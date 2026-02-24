
-- =============================================
-- PHASE 1: Compensation Engine - Database Layer
-- =============================================

-- 1. compensation_structures (versioned salary records)
CREATE TABLE public.compensation_structures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  annual_ctc NUMERIC NOT NULL CHECK (annual_ctc >= 0),
  effective_from DATE NOT NULL,
  effective_to DATE DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  revision_reason TEXT,
  revision_number INTEGER NOT NULL DEFAULT 1,
  created_by UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce only one active record per employee per org
CREATE UNIQUE INDEX uq_one_active_compensation 
  ON public.compensation_structures (profile_id, organization_id) 
  WHERE (is_active = true);

-- Index for lookups
CREATE INDEX idx_comp_struct_profile ON public.compensation_structures(profile_id, organization_id);
CREATE INDEX idx_comp_struct_active ON public.compensation_structures(is_active) WHERE is_active = true;

-- 2. compensation_components (CTC breakdown rows)
CREATE TABLE public.compensation_components (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  compensation_structure_id UUID NOT NULL REFERENCES public.compensation_structures(id) ON DELETE CASCADE,
  component_name TEXT NOT NULL,
  component_type TEXT NOT NULL CHECK (component_type IN ('earning', 'deduction')),
  annual_amount NUMERIC NOT NULL DEFAULT 0 CHECK (annual_amount >= 0),
  monthly_amount NUMERIC GENERATED ALWAYS AS (ROUND(annual_amount / 12, 2)) STORED,
  percentage_of_basic NUMERIC DEFAULT NULL,
  is_taxable BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comp_components_struct ON public.compensation_components(compensation_structure_id);

-- 3. Enable RLS
ALTER TABLE public.compensation_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_components ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for compensation_structures
CREATE POLICY "HR admins can manage compensation structures"
  ON public.compensation_structures FOR ALL
  USING (is_org_admin_or_hr(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Finance can view compensation structures"
  ON public.compensation_structures FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Employees can view own compensation"
  ON public.compensation_structures FOR SELECT
  USING (
    profile_id = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    AND organization_id = get_user_organization_id(auth.uid())
  );

-- 5. RLS Policies for compensation_components (access via parent)
CREATE POLICY "HR admins can manage compensation components"
  ON public.compensation_components FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.compensation_structures cs
    WHERE cs.id = compensation_components.compensation_structure_id
    AND is_org_admin_or_hr(auth.uid(), cs.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.compensation_structures cs
    WHERE cs.id = compensation_components.compensation_structure_id
    AND is_org_admin_or_hr(auth.uid(), cs.organization_id)
  ));

CREATE POLICY "Finance can view compensation components"
  ON public.compensation_components FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.compensation_structures cs
    WHERE cs.id = compensation_components.compensation_structure_id
    AND is_org_admin_or_finance(auth.uid(), cs.organization_id)
  ));

CREATE POLICY "Employees can view own compensation components"
  ON public.compensation_components FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.compensation_structures cs
    WHERE cs.id = compensation_components.compensation_structure_id
    AND cs.profile_id = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  ));

-- 6. Trigger: Auto-close previous active record on new insert
CREATE OR REPLACE FUNCTION public.close_previous_compensation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Close any existing active record for this employee in same org
  UPDATE public.compensation_structures
  SET 
    is_active = false,
    effective_to = NEW.effective_from - INTERVAL '1 day',
    updated_at = now()
  WHERE profile_id = NEW.profile_id
    AND organization_id = NEW.organization_id
    AND is_active = true
    AND id != NEW.id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_close_previous_compensation
  AFTER INSERT ON public.compensation_structures
  FOR EACH ROW
  EXECUTE FUNCTION public.close_previous_compensation();

-- 7. Trigger: Auto-increment revision_number
CREATE OR REPLACE FUNCTION public.set_compensation_revision_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.revision_number := COALESCE(
    (SELECT MAX(revision_number) + 1 
     FROM public.compensation_structures 
     WHERE profile_id = NEW.profile_id 
       AND organization_id = NEW.organization_id),
    1
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_revision_number
  BEFORE INSERT ON public.compensation_structures
  FOR EACH ROW
  EXECUTE FUNCTION public.set_compensation_revision_number();

-- 8. Trigger: Prevent in-place salary updates (immutability)
CREATE OR REPLACE FUNCTION public.prevent_compensation_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow closing (is_active, effective_to, updated_at changes)
  IF NEW.annual_ctc != OLD.annual_ctc 
     OR NEW.effective_from != OLD.effective_from
     OR NEW.profile_id != OLD.profile_id
     OR NEW.organization_id != OLD.organization_id
     OR NEW.revision_number != OLD.revision_number THEN
    RAISE EXCEPTION 'Compensation structures are immutable. Create a new revision instead.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_compensation_mutation
  BEFORE UPDATE ON public.compensation_structures
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_compensation_mutation();

-- 9. Trigger: Audit log on compensation insert
CREATE OR REPLACE FUNCTION public.audit_compensation_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name TEXT;
  v_target_name TEXT;
  v_actor_role TEXT;
BEGIN
  SELECT full_name INTO v_actor_name FROM profiles WHERE user_id = auth.uid() LIMIT 1;
  SELECT full_name INTO v_target_name FROM profiles WHERE id = NEW.profile_id LIMIT 1;
  SELECT role INTO v_actor_role FROM user_roles WHERE user_id = auth.uid() AND organization_id = NEW.organization_id LIMIT 1;

  INSERT INTO public.audit_logs (
    actor_id, actor_name, actor_role,
    entity_type, entity_id, action,
    target_user_id, target_name,
    organization_id, metadata
  ) VALUES (
    auth.uid(), v_actor_name, v_actor_role,
    'compensation', NEW.id, 'salary_revision',
    (SELECT user_id FROM profiles WHERE id = NEW.profile_id LIMIT 1),
    v_target_name,
    NEW.organization_id,
    jsonb_build_object(
      'annual_ctc', NEW.annual_ctc,
      'effective_from', NEW.effective_from,
      'revision_number', NEW.revision_number,
      'revision_reason', NEW.revision_reason
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_compensation_insert
  AFTER INSERT ON public.compensation_structures
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_compensation_insert();

-- 10. updated_at trigger
CREATE TRIGGER update_compensation_structures_updated_at
  BEFORE UPDATE ON public.compensation_structures
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
