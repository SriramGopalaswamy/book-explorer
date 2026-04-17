-- Role-based permission configurator
-- Stores per-org, per-role, per-resource permission overrides.
-- Admin and super_admin are never stored here; they always return true in application code.

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role            text        NOT NULL CHECK (role IN ('hr', 'manager', 'finance', 'payroll', 'employee')),
  resource        text        NOT NULL,
  can_view        boolean     NOT NULL DEFAULT false,
  can_create      boolean     NOT NULL DEFAULT false,
  can_edit        boolean     NOT NULL DEFAULT false,
  can_delete      boolean     NOT NULL DEFAULT false,
  can_export      boolean     NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid        REFERENCES auth.users(id),
  UNIQUE (organization_id, role, resource)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Org admins can fully manage their org's permission matrix
CREATE POLICY "org_admin_manage_role_permissions"
  ON public.role_permissions
  FOR ALL
  USING     (is_org_admin(auth.uid(), organization_id))
  WITH CHECK(is_org_admin(auth.uid(), organization_id));

-- All org members can read the full permission matrix for their org
-- (needed by useRolePermissions hook on every page load)
CREATE POLICY "org_members_read_role_permissions"
  ON public.role_permissions
  FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

-- Super admin can read all orgs (for platform tooling)
CREATE POLICY "super_admin_read_role_permissions"
  ON public.role_permissions
  FOR SELECT
  USING (is_super_admin(auth.uid()));

-- Index for fast lookup by (org, role)
CREATE INDEX IF NOT EXISTS idx_role_permissions_org_role
  ON public.role_permissions (organization_id, role);

-- ── Seed helper ───────────────────────────────────────────────────────────────
-- Call seed_default_role_permissions(org_id) after creating a new organisation.
-- Existing rows are left unchanged (ON CONFLICT DO NOTHING), so re-running is safe.
CREATE OR REPLACE FUNCTION public.seed_default_role_permissions(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r text;
  res text;
BEGIN
  -- Matrix encoded inline to avoid dependency on application code.
  -- Format: role, resource, can_view, can_create, can_edit, can_delete, can_export
  FOR r, res IN
    SELECT v.role, v.resource
    FROM (VALUES
      -- hr
      ('hr','dashboard',          true,  false, false, false, false),
      ('hr','financial',          false, false, false, false, false),
      ('hr','inventory',          false, false, false, false, false),
      ('hr','manufacturing',      false, false, false, false, false),
      ('hr','procurement',        false, false, false, false, false),
      ('hr','sales',              false, false, false, false, false),
      ('hr','warehouse',          false, false, false, false, false),
      ('hr','hrms_employees',     true,  true,  true,  true,  true ),
      ('hr','hrms_payroll',       true,  true,  true,  false, true ),
      ('hr','hrms_my_payslips',   true,  false, false, false, true ),
      ('hr','hrms_attendance',    true,  true,  true,  true,  true ),
      ('hr','hrms_leaves',        true,  true,  true,  true,  true ),
      ('hr','hrms_holidays',      true,  true,  true,  true,  true ),
      ('hr','hrms_org_chart',     true,  false, false, false, false),
      ('hr','hrms_ctc_components',true,  true,  true,  true,  true ),
      ('hr','hrms_manager_inbox', true,  false, false, false, false),
      ('hr','hrms_reimbursements',true,  true,  true,  true,  true ),
      ('hr','goals',              true,  true,  true,  true,  true ),
      ('hr','connectors',         false, false, false, false, false),
      ('hr','audit_log',          false, false, false, false, false),
      ('hr','upload_history',     false, false, false, false, false),
      ('hr','user_management',    false, false, false, false, false),
      ('hr','settings',           false, false, false, false, false),
      -- manager
      ('manager','dashboard',           true,  false, false, false, false),
      ('manager','financial',           false, false, false, false, false),
      ('manager','inventory',           false, false, false, false, false),
      ('manager','manufacturing',       false, false, false, false, false),
      ('manager','procurement',         false, false, false, false, false),
      ('manager','sales',               false, false, false, false, false),
      ('manager','warehouse',           false, false, false, false, false),
      ('manager','hrms_employees',      false, false, false, false, false),
      ('manager','hrms_payroll',        false, false, false, false, false),
      ('manager','hrms_my_payslips',    true,  false, false, false, true ),
      ('manager','hrms_attendance',     true,  false, true,  false, false),
      ('manager','hrms_leaves',         true,  false, true,  false, false),
      ('manager','hrms_holidays',       true,  false, false, false, false),
      ('manager','hrms_org_chart',      true,  false, false, false, false),
      ('manager','hrms_ctc_components', false, false, false, false, false),
      ('manager','hrms_manager_inbox',  true,  true,  true,  true,  true ),
      ('manager','hrms_reimbursements', true,  false, true,  false, false),
      ('manager','goals',               true,  true,  true,  true,  true ),
      ('manager','connectors',          false, false, false, false, false),
      ('manager','audit_log',           false, false, false, false, false),
      ('manager','upload_history',      false, false, false, false, false),
      ('manager','user_management',     true,  false, true,  false, false),
      ('manager','settings',            false, false, false, false, false),
      -- finance
      ('finance','dashboard',           true,  false, false, false, false),
      ('finance','financial',           true,  true,  true,  true,  true ),
      ('finance','inventory',           true,  true,  true,  true,  true ),
      ('finance','manufacturing',       true,  true,  true,  true,  true ),
      ('finance','procurement',         true,  true,  true,  true,  true ),
      ('finance','sales',               true,  true,  true,  true,  true ),
      ('finance','warehouse',           true,  true,  true,  true,  true ),
      ('finance','hrms_employees',      false, false, false, false, false),
      ('finance','hrms_payroll',        true,  false, true,  false, true ),
      ('finance','hrms_my_payslips',    true,  false, false, false, true ),
      ('finance','hrms_attendance',     false, false, false, false, false),
      ('finance','hrms_leaves',         false, false, false, false, false),
      ('finance','hrms_holidays',       true,  false, false, false, false),
      ('finance','hrms_org_chart',      true,  false, false, false, false),
      ('finance','hrms_ctc_components', true,  false, false, false, false),
      ('finance','hrms_manager_inbox',  false, false, false, false, false),
      ('finance','hrms_reimbursements', true,  false, true,  false, false),
      ('finance','goals',               true,  false, false, false, false),
      ('finance','connectors',          false, false, false, false, false),
      ('finance','audit_log',           false, false, false, false, false),
      ('finance','upload_history',      true,  false, false, false, true ),
      ('finance','user_management',     false, false, false, false, false),
      ('finance','settings',            false, false, false, false, false),
      -- payroll
      ('payroll','dashboard',           true,  false, false, false, false),
      ('payroll','financial',           false, false, false, false, false),
      ('payroll','inventory',           false, false, false, false, false),
      ('payroll','manufacturing',       false, false, false, false, false),
      ('payroll','procurement',         false, false, false, false, false),
      ('payroll','sales',               false, false, false, false, false),
      ('payroll','warehouse',           false, false, false, false, false),
      ('payroll','hrms_employees',      false, false, false, false, false),
      ('payroll','hrms_payroll',        true,  false, false, false, false),
      ('payroll','hrms_my_payslips',    true,  false, false, false, true ),
      ('payroll','hrms_attendance',     false, false, false, false, false),
      ('payroll','hrms_leaves',         false, false, false, false, false),
      ('payroll','hrms_holidays',       true,  false, false, false, false),
      ('payroll','hrms_org_chart',      true,  false, false, false, false),
      ('payroll','hrms_ctc_components', false, false, false, false, false),
      ('payroll','hrms_manager_inbox',  false, false, false, false, false),
      ('payroll','hrms_reimbursements', false, false, false, false, false),
      ('payroll','goals',               true,  false, false, false, false),
      ('payroll','connectors',          false, false, false, false, false),
      ('payroll','audit_log',           false, false, false, false, false),
      ('payroll','upload_history',      false, false, false, false, false),
      ('payroll','user_management',     false, false, false, false, false),
      ('payroll','settings',            false, false, false, false, false),
      -- employee
      ('employee','dashboard',           true,  false, false, false, false),
      ('employee','financial',           false, false, false, false, false),
      ('employee','inventory',           false, false, false, false, false),
      ('employee','manufacturing',       false, false, false, false, false),
      ('employee','procurement',         false, false, false, false, false),
      ('employee','sales',               false, false, false, false, false),
      ('employee','warehouse',           false, false, false, false, false),
      ('employee','hrms_employees',      false, false, false, false, false),
      ('employee','hrms_payroll',        false, false, false, false, false),
      ('employee','hrms_my_payslips',    true,  false, false, false, true ),
      ('employee','hrms_attendance',     true,  false, true,  false, false),
      ('employee','hrms_leaves',         true,  true,  false, false, false),
      ('employee','hrms_holidays',       true,  false, false, false, false),
      ('employee','hrms_org_chart',      true,  false, false, false, false),
      ('employee','hrms_ctc_components', false, false, false, false, false),
      ('employee','hrms_manager_inbox',  false, false, false, false, false),
      ('employee','hrms_reimbursements', true,  true,  false, false, false),
      ('employee','goals',               true,  true,  true,  false, false),
      ('employee','connectors',          false, false, false, false, false),
      ('employee','audit_log',           false, false, false, false, false),
      ('employee','upload_history',      false, false, false, false, false),
      ('employee','user_management',     false, false, false, false, false),
      ('employee','settings',            false, false, false, false, false)
    ) AS v(role, resource, can_view, can_create, can_edit, can_delete, can_export)
  LOOP
    INSERT INTO public.role_permissions
      (organization_id, role, resource, can_view, can_create, can_edit, can_delete, can_export)
    VALUES
      (p_org_id, r, res,
       (SELECT can_view   FROM (VALUES(false)) AS x(can_view)),
       (SELECT can_create FROM (VALUES(false)) AS x(can_create)),
       (SELECT can_edit   FROM (VALUES(false)) AS x(can_edit)),
       (SELECT can_delete FROM (VALUES(false)) AS x(can_delete)),
       (SELECT can_export FROM (VALUES(false)) AS x(can_export)))
    ON CONFLICT (organization_id, role, resource) DO NOTHING;
  END LOOP;
END;
$$;

-- Simpler, correct seed using a single INSERT ... SELECT
-- (replaces the loop above — kept for clarity, overwritten here)
CREATE OR REPLACE FUNCTION public.seed_default_role_permissions(p_org_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.role_permissions
    (organization_id, role, resource, can_view, can_create, can_edit, can_delete, can_export)
  VALUES
    -- hr
    (p_org_id,'hr','dashboard',          true,  false, false, false, false),
    (p_org_id,'hr','financial',          false, false, false, false, false),
    (p_org_id,'hr','inventory',          false, false, false, false, false),
    (p_org_id,'hr','manufacturing',      false, false, false, false, false),
    (p_org_id,'hr','procurement',        false, false, false, false, false),
    (p_org_id,'hr','sales',              false, false, false, false, false),
    (p_org_id,'hr','warehouse',          false, false, false, false, false),
    (p_org_id,'hr','hrms_employees',     true,  true,  true,  true,  true ),
    (p_org_id,'hr','hrms_payroll',       true,  true,  true,  false, true ),
    (p_org_id,'hr','hrms_my_payslips',   true,  false, false, false, true ),
    (p_org_id,'hr','hrms_attendance',    true,  true,  true,  true,  true ),
    (p_org_id,'hr','hrms_leaves',        true,  true,  true,  true,  true ),
    (p_org_id,'hr','hrms_holidays',      true,  true,  true,  true,  true ),
    (p_org_id,'hr','hrms_org_chart',     true,  false, false, false, false),
    (p_org_id,'hr','hrms_ctc_components',true,  true,  true,  true,  true ),
    (p_org_id,'hr','hrms_manager_inbox', true,  false, false, false, false),
    (p_org_id,'hr','hrms_reimbursements',true,  true,  true,  true,  true ),
    (p_org_id,'hr','goals',              true,  true,  true,  true,  true ),
    (p_org_id,'hr','connectors',         false, false, false, false, false),
    (p_org_id,'hr','audit_log',          false, false, false, false, false),
    (p_org_id,'hr','upload_history',     false, false, false, false, false),
    (p_org_id,'hr','user_management',    false, false, false, false, false),
    (p_org_id,'hr','settings',           false, false, false, false, false),
    -- manager
    (p_org_id,'manager','dashboard',           true,  false, false, false, false),
    (p_org_id,'manager','financial',           false, false, false, false, false),
    (p_org_id,'manager','inventory',           false, false, false, false, false),
    (p_org_id,'manager','manufacturing',       false, false, false, false, false),
    (p_org_id,'manager','procurement',         false, false, false, false, false),
    (p_org_id,'manager','sales',               false, false, false, false, false),
    (p_org_id,'manager','warehouse',           false, false, false, false, false),
    (p_org_id,'manager','hrms_employees',      false, false, false, false, false),
    (p_org_id,'manager','hrms_payroll',        false, false, false, false, false),
    (p_org_id,'manager','hrms_my_payslips',    true,  false, false, false, true ),
    (p_org_id,'manager','hrms_attendance',     true,  false, true,  false, false),
    (p_org_id,'manager','hrms_leaves',         true,  false, true,  false, false),
    (p_org_id,'manager','hrms_holidays',       true,  false, false, false, false),
    (p_org_id,'manager','hrms_org_chart',      true,  false, false, false, false),
    (p_org_id,'manager','hrms_ctc_components', false, false, false, false, false),
    (p_org_id,'manager','hrms_manager_inbox',  true,  true,  true,  true,  true ),
    (p_org_id,'manager','hrms_reimbursements', true,  false, true,  false, false),
    (p_org_id,'manager','goals',               true,  true,  true,  true,  true ),
    (p_org_id,'manager','connectors',          false, false, false, false, false),
    (p_org_id,'manager','audit_log',           false, false, false, false, false),
    (p_org_id,'manager','upload_history',      false, false, false, false, false),
    (p_org_id,'manager','user_management',     true,  false, true,  false, false),
    (p_org_id,'manager','settings',            false, false, false, false, false),
    -- finance
    (p_org_id,'finance','dashboard',           true,  false, false, false, false),
    (p_org_id,'finance','financial',           true,  true,  true,  true,  true ),
    (p_org_id,'finance','inventory',           true,  true,  true,  true,  true ),
    (p_org_id,'finance','manufacturing',       true,  true,  true,  true,  true ),
    (p_org_id,'finance','procurement',         true,  true,  true,  true,  true ),
    (p_org_id,'finance','sales',               true,  true,  true,  true,  true ),
    (p_org_id,'finance','warehouse',           true,  true,  true,  true,  true ),
    (p_org_id,'finance','hrms_employees',      false, false, false, false, false),
    (p_org_id,'finance','hrms_payroll',        true,  false, true,  false, true ),
    (p_org_id,'finance','hrms_my_payslips',    true,  false, false, false, true ),
    (p_org_id,'finance','hrms_attendance',     false, false, false, false, false),
    (p_org_id,'finance','hrms_leaves',         false, false, false, false, false),
    (p_org_id,'finance','hrms_holidays',       true,  false, false, false, false),
    (p_org_id,'finance','hrms_org_chart',      true,  false, false, false, false),
    (p_org_id,'finance','hrms_ctc_components', true,  false, false, false, false),
    (p_org_id,'finance','hrms_manager_inbox',  false, false, false, false, false),
    (p_org_id,'finance','hrms_reimbursements', true,  false, true,  false, false),
    (p_org_id,'finance','goals',               true,  false, false, false, false),
    (p_org_id,'finance','connectors',          false, false, false, false, false),
    (p_org_id,'finance','audit_log',           false, false, false, false, false),
    (p_org_id,'finance','upload_history',      true,  false, false, false, true ),
    (p_org_id,'finance','user_management',     false, false, false, false, false),
    (p_org_id,'finance','settings',            false, false, false, false, false),
    -- payroll
    (p_org_id,'payroll','dashboard',           true,  false, false, false, false),
    (p_org_id,'payroll','financial',           false, false, false, false, false),
    (p_org_id,'payroll','inventory',           false, false, false, false, false),
    (p_org_id,'payroll','manufacturing',       false, false, false, false, false),
    (p_org_id,'payroll','procurement',         false, false, false, false, false),
    (p_org_id,'payroll','sales',               false, false, false, false, false),
    (p_org_id,'payroll','warehouse',           false, false, false, false, false),
    (p_org_id,'payroll','hrms_employees',      false, false, false, false, false),
    (p_org_id,'payroll','hrms_payroll',        true,  false, false, false, false),
    (p_org_id,'payroll','hrms_my_payslips',    true,  false, false, false, true ),
    (p_org_id,'payroll','hrms_attendance',     false, false, false, false, false),
    (p_org_id,'payroll','hrms_leaves',         false, false, false, false, false),
    (p_org_id,'payroll','hrms_holidays',       true,  false, false, false, false),
    (p_org_id,'payroll','hrms_org_chart',      true,  false, false, false, false),
    (p_org_id,'payroll','hrms_ctc_components', false, false, false, false, false),
    (p_org_id,'payroll','hrms_manager_inbox',  false, false, false, false, false),
    (p_org_id,'payroll','hrms_reimbursements', false, false, false, false, false),
    (p_org_id,'payroll','goals',               true,  false, false, false, false),
    (p_org_id,'payroll','connectors',          false, false, false, false, false),
    (p_org_id,'payroll','audit_log',           false, false, false, false, false),
    (p_org_id,'payroll','upload_history',      false, false, false, false, false),
    (p_org_id,'payroll','user_management',     false, false, false, false, false),
    (p_org_id,'payroll','settings',            false, false, false, false, false),
    -- employee
    (p_org_id,'employee','dashboard',           true,  false, false, false, false),
    (p_org_id,'employee','financial',           false, false, false, false, false),
    (p_org_id,'employee','inventory',           false, false, false, false, false),
    (p_org_id,'employee','manufacturing',       false, false, false, false, false),
    (p_org_id,'employee','procurement',         false, false, false, false, false),
    (p_org_id,'employee','sales',               false, false, false, false, false),
    (p_org_id,'employee','warehouse',           false, false, false, false, false),
    (p_org_id,'employee','hrms_employees',      false, false, false, false, false),
    (p_org_id,'employee','hrms_payroll',        false, false, false, false, false),
    (p_org_id,'employee','hrms_my_payslips',    true,  false, false, false, true ),
    (p_org_id,'employee','hrms_attendance',     true,  false, true,  false, false),
    (p_org_id,'employee','hrms_leaves',         true,  true,  false, false, false),
    (p_org_id,'employee','hrms_holidays',       true,  false, false, false, false),
    (p_org_id,'employee','hrms_org_chart',      true,  false, false, false, false),
    (p_org_id,'employee','hrms_ctc_components', false, false, false, false, false),
    (p_org_id,'employee','hrms_manager_inbox',  false, false, false, false, false),
    (p_org_id,'employee','hrms_reimbursements', true,  true,  false, false, false),
    (p_org_id,'employee','goals',               true,  true,  true,  false, false),
    (p_org_id,'employee','connectors',          false, false, false, false, false),
    (p_org_id,'employee','audit_log',           false, false, false, false, false),
    (p_org_id,'employee','upload_history',      false, false, false, false, false),
    (p_org_id,'employee','user_management',     false, false, false, false, false),
    (p_org_id,'employee','settings',            false, false, false, false, false)
  ON CONFLICT (organization_id, role, resource) DO NOTHING;
$$;

COMMENT ON TABLE public.role_permissions IS
  'Per-org, per-role, per-resource permission overrides. Admin/super_admin are never stored here.';

COMMENT ON FUNCTION public.seed_default_role_permissions IS
  'Call after creating a new organisation to populate default permissions. Safe to re-run.';
