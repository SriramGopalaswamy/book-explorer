-- Fix 1: Replace is_admin_or_finance to scope by organization_id
CREATE OR REPLACE FUNCTION public.is_admin_or_finance(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'finance')
      AND organization_id = _org_id
  )
$$;

-- Fix 2: Replace is_admin_hr_or_manager to scope by organization_id
CREATE OR REPLACE FUNCTION public.is_admin_hr_or_manager(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'hr', 'manager')
      AND organization_id = _org_id
  )
$$;

-- Fix 3: Scope has_role function with organization_id overload (using app_role enum)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND organization_id = _org_id
  )
$$;

-- Update RLS policies on audit tables to pass organization_id

DROP POLICY IF EXISTS "Finance users can view compliance checks" ON public.audit_compliance_checks;
CREATE POLICY "Finance users can view compliance checks"
ON public.audit_compliance_checks FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
  )
  AND public.is_admin_or_finance(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Finance users can view compliance runs" ON public.audit_compliance_runs;
CREATE POLICY "Finance users can view compliance runs"
ON public.audit_compliance_runs FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
  )
  AND public.is_admin_or_finance(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Finance users can view IFC assessments" ON public.audit_ifc_assessments;
CREATE POLICY "Finance users can view IFC assessments"
ON public.audit_ifc_assessments FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
  )
  AND public.is_admin_or_finance(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Finance users can view AI narratives" ON public.audit_ai_narratives;
CREATE POLICY "Finance users can view AI narratives"
ON public.audit_ai_narratives FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
  )
  AND public.is_admin_or_finance(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Finance users can view AI anomalies" ON public.audit_ai_anomalies;
CREATE POLICY "Finance users can view AI anomalies"
ON public.audit_ai_anomalies FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
  )
  AND public.is_admin_or_finance(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Finance users can view AI samples" ON public.audit_ai_samples;
CREATE POLICY "Finance users can view AI samples"
ON public.audit_ai_samples FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
  )
  AND public.is_admin_or_finance(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Finance users can view risk themes" ON public.audit_risk_themes;
CREATE POLICY "Finance users can view risk themes"
ON public.audit_risk_themes FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
  )
  AND public.is_admin_or_finance(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Finance users can view audit pack exports" ON public.audit_pack_exports;
CREATE POLICY "Finance users can view audit pack exports"
ON public.audit_pack_exports FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
  )
  AND public.is_admin_or_finance(auth.uid(), organization_id)
);

-- Fix OAuth configs policy to scope admin check by organization
DROP POLICY IF EXISTS "Org admins can manage OAuth configs" ON public.organization_oauth_configs;
CREATE POLICY "Org admins can manage OAuth configs"
ON public.organization_oauth_configs FOR ALL
TO authenticated
USING (
  organization_id IN (
    SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
  )
  AND public.has_role(auth.uid(), 'admin'::app_role, organization_id)
)
WITH CHECK (
  organization_id IN (
    SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
  )
  AND public.has_role(auth.uid(), 'admin'::app_role, organization_id)
);