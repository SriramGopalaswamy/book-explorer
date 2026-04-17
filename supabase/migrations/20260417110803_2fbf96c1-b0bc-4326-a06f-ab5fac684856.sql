-- ============================================================================
-- ROLE PERMISSIONS: table + RLS + seed function + auto-trigger + backfill
-- ============================================================================

-- 1. TABLE
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  resource TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_export BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, role, resource)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_org_role
  ON public.role_permissions(organization_id, role);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_role_permissions_updated_at ON public.role_permissions;
CREATE TRIGGER trg_role_permissions_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Helper: get caller's org from profiles
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

DROP POLICY IF EXISTS "rp_select_same_org" ON public.role_permissions;
CREATE POLICY "rp_select_same_org" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "rp_admin_write" ON public.role_permissions;
CREATE POLICY "rp_admin_write" ON public.role_permissions
  FOR ALL TO authenticated
  USING (
    (organization_id = public.get_user_org_id(auth.uid())
      AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid()
                    AND ur.organization_id = role_permissions.organization_id
                    AND ur.role = 'admin'))
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    (organization_id = public.get_user_org_id(auth.uid())
      AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid()
                    AND ur.organization_id = role_permissions.organization_id
                    AND ur.role = 'admin'))
    OR public.is_super_admin(auth.uid())
  );

-- 3. SEED FUNCTION
CREATE OR REPLACE FUNCTION public.seed_default_role_permissions(_org_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
  v_resources TEXT[] := ARRAY[
    'dashboard','settings','financial','inventory','manufacturing','procurement','sales','warehouse',
    'employees','payroll','my_payslips','attendance','leaves','holidays','org_chart','ctc_components',
    'manager_inbox','reimbursements','goals','audit_log','upload_history','user_management','connectors'
  ];
  r TEXT;
  v_role TEXT;
  v_roles TEXT[] := ARRAY['hr','manager','finance','payroll','employee'];
BEGIN
  -- Defaults matrix (mirrors src/lib/permissions.ts DEFAULT_PERMISSIONS)
  FOREACH v_role IN ARRAY v_roles LOOP
    FOREACH r IN ARRAY v_resources LOOP
      INSERT INTO public.role_permissions
        (organization_id, role, resource, can_view, can_create, can_edit, can_delete, can_export)
      VALUES (
        _org_id, v_role, r,
        -- can_view
        CASE
          WHEN r IN ('dashboard','holidays','org_chart','my_payslips') THEN true
          WHEN v_role = 'hr' AND r IN ('employees','payroll','attendance','leaves','ctc_components','manager_inbox','reimbursements','goals') THEN true
          WHEN v_role = 'manager' AND r IN ('attendance','leaves','manager_inbox','reimbursements','goals','user_management') THEN true
          WHEN v_role = 'finance' AND r IN ('financial','inventory','manufacturing','procurement','sales','warehouse','payroll','ctc_components','reimbursements','goals','upload_history') THEN true
          WHEN v_role = 'payroll' AND r IN ('payroll','goals') THEN true
          WHEN v_role = 'employee' AND r IN ('attendance','leaves','reimbursements','goals') THEN true
          ELSE false
        END,
        -- can_create
        CASE
          WHEN v_role = 'hr' AND r IN ('employees','payroll','attendance','leaves','holidays','ctc_components','reimbursements','goals') THEN true
          WHEN v_role = 'finance' AND r IN ('financial','inventory','manufacturing','procurement','sales','warehouse') THEN true
          WHEN v_role = 'employee' AND r IN ('leaves','reimbursements','goals') THEN true
          ELSE false
        END,
        -- can_edit
        CASE
          WHEN v_role = 'hr' AND r IN ('employees','payroll','attendance','leaves','holidays','ctc_components','reimbursements','goals') THEN true
          WHEN v_role = 'manager' AND r IN ('attendance','leaves','manager_inbox','reimbursements','goals','user_management') THEN true
          WHEN v_role = 'finance' AND r IN ('financial','inventory','manufacturing','procurement','sales','warehouse','payroll','reimbursements') THEN true
          WHEN v_role = 'employee' AND r = 'goals' THEN true
          ELSE false
        END,
        -- can_delete
        CASE
          WHEN v_role = 'hr' AND r IN ('employees','attendance','leaves','holidays','ctc_components') THEN true
          WHEN v_role = 'finance' AND r IN ('financial','inventory','manufacturing','procurement','sales','warehouse') THEN true
          ELSE false
        END,
        -- can_export
        CASE
          WHEN v_role = 'hr' AND r IN ('employees','payroll','attendance','leaves','ctc_components','reimbursements','goals') THEN true
          WHEN v_role = 'manager' AND r IN ('manager_inbox','goals') THEN true
          WHEN v_role = 'finance' AND r IN ('financial','inventory','manufacturing','procurement','sales','warehouse','payroll','upload_history') THEN true
          WHEN v_role IN ('payroll','employee','manager') AND r = 'my_payslips' THEN true
          WHEN v_role = 'hr' AND r = 'my_payslips' THEN true
          ELSE false
        END
      )
      ON CONFLICT (organization_id, role, resource) DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
    END LOOP;
  END LOOP;

  RETURN (SELECT COUNT(*)::INTEGER FROM public.role_permissions WHERE organization_id = _org_id);
END;
$$;

-- 4. AUTO-SEED TRIGGER on new org
CREATE OR REPLACE FUNCTION public.auto_seed_role_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_role_permissions(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_seed_role_permissions ON public.organizations;
CREATE TRIGGER trg_auto_seed_role_permissions
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.auto_seed_role_permissions();

-- 5. BACKFILL existing orgs
DO $$
DECLARE o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_default_role_permissions(o.id);
  END LOOP;
END $$;