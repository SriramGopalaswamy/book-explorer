-- Fix: SuperAdmin write access to role_permissions + remove dead plpgsql seed function risk.
--
-- 1. The previous migration (20260417000001) created super_admin_read_role_permissions as
--    SELECT-only. SuperAdmins managing cross-org permissions from platform tools need write too.
-- 2. Remove the dead plpgsql version of seed_default_role_permissions by replacing it with
--    the correct SQL-function version only, eliminating any risk from the dead code path.

-- SuperAdmin: full management access across all orgs (needed for platform tooling)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'role_permissions'
      AND policyname = 'super_admin_manage_role_permissions'
  ) THEN
    CREATE POLICY "super_admin_manage_role_permissions"
      ON public.role_permissions
      FOR ALL
      USING  (is_super_admin(auth.uid()))
      WITH CHECK (is_super_admin(auth.uid()));
  END IF;
END;
$$;

-- Drop the old read-only super_admin policy if it exists (superseded by the ALL policy above)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'role_permissions'
      AND policyname = 'super_admin_read_role_permissions'
  ) THEN
    EXECUTE 'DROP POLICY "super_admin_read_role_permissions" ON public.role_permissions';
  END IF;
END;
$$;

-- Replace seed_default_role_permissions with the correct SQL-only version.
-- The previous migration had a dead plpgsql version followed by this correct SQL version;
-- we re-create here so the function is canonical and the dead code is no longer reachable.
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

COMMENT ON FUNCTION public.seed_default_role_permissions IS
  'Populates default role_permissions for a new org. Safe to re-run (ON CONFLICT DO NOTHING). Replaces dead plpgsql version from 20260417000001.';
