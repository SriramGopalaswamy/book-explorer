
-- Storage table for historical audit runs
CREATE TABLE IF NOT EXISTS public.integrity_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_by uuid NOT NULL,
  run_scope text NOT NULL DEFAULT 'full',
  engine_status text NOT NULL DEFAULT 'PENDING',
  total_checks int NOT NULL DEFAULT 0,
  passed int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  warnings int NOT NULL DEFAULT 0,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integrity_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage integrity runs"
  ON public.integrity_audit_runs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid() AND pr.role = 'super_admin'
    )
  );

-- Root Cause Audit RPC
CREATE OR REPLACE FUNCTION public.run_root_cause_audit(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _checks jsonb := '[]'::jsonb;
  _count bigint;
  _count2 bigint;
BEGIN
  -- RC-001: Profiles with NULL organization_id
  SELECT count(*) INTO _count FROM profiles WHERE organization_id IS NULL;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-001', 'category', 'Orphan Records',
    'severity', CASE WHEN _count > 0 THEN 'CRITICAL' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Profiles with NULL organization_id: %s', _count),
    'auto_fix_possible', true, 'affected_count', _count
  );

  -- RC-002: Profiles with no matching auth.users
  SELECT count(*) INTO _count
  FROM profiles p LEFT JOIN auth.users u ON u.id = p.user_id WHERE u.id IS NULL;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-002', 'category', 'Orphan Records',
    'severity', CASE WHEN _count > 0 THEN 'HIGH' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Orphan profiles (no auth user): %s', _count),
    'auto_fix_possible', true, 'affected_count', _count
  );

  -- RC-003: User roles referencing non-existent profiles
  SELECT count(*) INTO _count
  FROM user_roles ur LEFT JOIN profiles p ON p.user_id = ur.user_id WHERE p.id IS NULL;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-003', 'category', 'Orphan Records',
    'severity', CASE WHEN _count > 0 THEN 'HIGH' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Role assignments with no profile: %s', _count),
    'auto_fix_possible', true, 'affected_count', _count
  );

  -- RC-004: Financial records with NULL org_id
  SELECT count(*) INTO _count FROM invoices WHERE organization_id IS NULL;
  SELECT count(*) INTO _count2 FROM bills WHERE organization_id IS NULL;
  _count := _count + _count2;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-004', 'category', 'Orphan Records',
    'severity', CASE WHEN _count > 0 THEN 'CRITICAL' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Financial records with NULL org_id: %s', _count),
    'auto_fix_possible', false, 'affected_count', _count
  );

  -- RC-005: Profiles assigned to multiple organizations
  SELECT count(*) INTO _count FROM (
    SELECT user_id FROM profiles GROUP BY user_id HAVING count(DISTINCT organization_id) > 1
  ) dupes;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-005', 'category', 'Cross-Tenant Isolation',
    'severity', CASE WHEN _count > 0 THEN 'CRITICAL' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', format('Users with profiles in multiple orgs: %s', _count),
    'auto_fix_possible', false, 'affected_count', _count
  );

  -- RC-006: Attendance records org mismatch
  SELECT count(*) INTO _count
  FROM attendance_records ar JOIN profiles p ON p.user_id = ar.user_id
  WHERE ar.organization_id != p.organization_id;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-006', 'category', 'Cross-Tenant Isolation',
    'severity', CASE WHEN _count > 0 THEN 'CRITICAL' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Attendance records with mismatched org_id: %s', _count),
    'auto_fix_possible', true, 'affected_count', _count
  );

  -- RC-007: Payroll records org mismatch
  SELECT count(*) INTO _count
  FROM payroll_records pr JOIN profiles p ON p.user_id = pr.user_id
  WHERE pr.organization_id != p.organization_id;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-007', 'category', 'Cross-Tenant Isolation',
    'severity', CASE WHEN _count > 0 THEN 'CRITICAL' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Payroll records with mismatched org_id: %s', _count),
    'auto_fix_possible', true, 'affected_count', _count
  );

  -- RC-008: handle_new_user trigger guard check
  SELECT count(*) INTO _count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'handle_new_user' AND n.nspname = 'public'
    AND p.prosrc NOT LIKE '%NOT EXISTS%';
  _checks := _checks || jsonb_build_object(
    'id', 'RC-008', 'category', 'Trigger Safety',
    'severity', CASE WHEN _count > 0 THEN 'CRITICAL' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _count = 0 THEN 'handle_new_user has duplication guard' ELSE 'handle_new_user MISSING IF NOT EXISTS guard' END,
    'auto_fix_possible', true, 'affected_count', _count
  );

  -- RC-009: Disabled triggers
  SELECT count(*) INTO _count
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND t.tgenabled = 'D';
  _checks := _checks || jsonb_build_object(
    'id', 'RC-009', 'category', 'Trigger Safety',
    'severity', CASE WHEN _count > 0 THEN 'MEDIUM' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', format('Disabled triggers in public schema: %s', _count),
    'auto_fix_possible', false, 'affected_count', _count
  );

  -- RC-010: Duplicate profiles (same user+org)
  SELECT count(*) INTO _count FROM (
    SELECT user_id, organization_id FROM profiles WHERE organization_id IS NOT NULL
    GROUP BY user_id, organization_id HAVING count(*) > 1
  ) dupes;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-010', 'category', 'Duplicate Records',
    'severity', CASE WHEN _count > 0 THEN 'CRITICAL' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Duplicate profiles (same user+org): %s', _count),
    'auto_fix_possible', true, 'affected_count', _count
  );

  -- RC-011: Duplicate role assignments
  SELECT count(*) INTO _count FROM (
    SELECT user_id, role, organization_id FROM user_roles
    GROUP BY user_id, role, organization_id HAVING count(*) > 1
  ) dupes;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-011', 'category', 'Duplicate Records',
    'severity', CASE WHEN _count > 0 THEN 'HIGH' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Duplicate role assignments: %s', _count),
    'auto_fix_possible', true, 'affected_count', _count
  );

  -- RC-012: Duplicate invoice numbers within same org
  SELECT count(*) INTO _count FROM (
    SELECT invoice_number, organization_id FROM invoices WHERE is_deleted = false
    GROUP BY invoice_number, organization_id HAVING count(*) > 1
  ) dupes;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-012', 'category', 'Duplicate Records',
    'severity', CASE WHEN _count > 0 THEN 'HIGH' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Duplicate invoice numbers: %s', _count),
    'auto_fix_possible', false, 'affected_count', _count
  );

  -- RC-013: Tables with RLS enabled but no policies
  SELECT count(*) INTO _count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
    AND NOT EXISTS (SELECT 1 FROM pg_policies pp WHERE pp.tablename = c.relname AND pp.schemaname = 'public');
  _checks := _checks || jsonb_build_object(
    'id', 'RC-013', 'category', 'RLS & Access Control',
    'severity', CASE WHEN _count > 0 THEN 'CRITICAL' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Tables with RLS enabled but zero policies: %s', _count),
    'auto_fix_possible', false, 'affected_count', _count
  );

  -- RC-014: Tables WITHOUT RLS
  SELECT count(*) INTO _count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
    AND c.relname NOT LIKE 'pg_%' AND c.relname NOT IN ('schema_migrations', 'spatial_ref_sys');
  _checks := _checks || jsonb_build_object(
    'id', 'RC-014', 'category', 'RLS & Access Control',
    'severity', CASE WHEN _count > 0 THEN 'HIGH' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', format('Tables without RLS enabled: %s', _count),
    'auto_fix_possible', false, 'affected_count', _count
  );

  -- RC-015: Ghost profiles (null/empty email)
  SELECT count(*) INTO _count FROM profiles WHERE email IS NULL OR email = '';
  _checks := _checks || jsonb_build_object(
    'id', 'RC-015', 'category', 'Ghost & Stale Data',
    'severity', CASE WHEN _count > 0 THEN 'HIGH' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Ghost profiles (null/empty email): %s', _count),
    'auto_fix_possible', true, 'affected_count', _count
  );

  -- RC-016: Invoices referencing non-existent customers
  SELECT count(*) INTO _count
  FROM invoices i WHERE i.customer_id IS NOT NULL AND i.is_deleted = false
    AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = i.customer_id);
  _checks := _checks || jsonb_build_object(
    'id', 'RC-016', 'category', 'Ghost & Stale Data',
    'severity', CASE WHEN _count > 0 THEN 'MEDIUM' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', format('Invoices referencing deleted customers: %s', _count),
    'auto_fix_possible', false, 'affected_count', _count
  );

  -- RC-017: Leave requests org mismatch
  SELECT count(*) INTO _count
  FROM leave_requests lr JOIN profiles p ON p.user_id = lr.user_id
  WHERE lr.organization_id != p.organization_id;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-017', 'category', 'Ghost & Stale Data',
    'severity', CASE WHEN _count > 0 THEN 'HIGH' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Leave requests with org mismatch: %s', _count),
    'auto_fix_possible', true, 'affected_count', _count
  );

  -- RC-018: Nullable org_id columns
  SELECT count(*) INTO _count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'organization_id' AND is_nullable = 'YES'
    AND table_name NOT IN ('integrity_audit_runs');
  _checks := _checks || jsonb_build_object(
    'id', 'RC-018', 'category', 'Default Value Traps',
    'severity', CASE WHEN _count > 5 THEN 'MEDIUM' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', format('Tables with nullable organization_id: %s', _count),
    'auto_fix_possible', false, 'affected_count', _count
  );

  -- RC-019: Soft-deleted invoices missing timestamp
  SELECT count(*) INTO _count FROM invoices WHERE is_deleted = true AND deleted_at IS NULL;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-019', 'category', 'Soft Delete Integrity',
    'severity', CASE WHEN _count > 0 THEN 'MEDIUM' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', format('Soft-deleted invoices missing deleted_at: %s', _count),
    'auto_fix_possible', true, 'affected_count', _count
  );

  -- RC-020: Soft-deleted bills missing timestamp
  SELECT count(*) INTO _count FROM bills WHERE is_deleted = true AND deleted_at IS NULL;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-020', 'category', 'Soft Delete Integrity',
    'severity', CASE WHEN _count > 0 THEN 'MEDIUM' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', format('Soft-deleted bills missing deleted_at: %s', _count),
    'auto_fix_possible', true, 'affected_count', _count
  );

  -- RC-021: Expenses with NULL user_id
  SELECT count(*) INTO _count FROM expenses WHERE user_id IS NULL;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-021', 'category', 'Orphan Records',
    'severity', CASE WHEN _count > 0 THEN 'HIGH' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Expenses with NULL user_id: %s', _count),
    'auto_fix_possible', false, 'affected_count', _count
  );

  -- RC-022: Payroll runs stuck in processing
  SELECT count(*) INTO _count FROM payroll_runs
  WHERE status = 'processing' AND created_at < now() - interval '24 hours';
  _checks := _checks || jsonb_build_object(
    'id', 'RC-022', 'category', 'Ghost & Stale Data',
    'severity', CASE WHEN _count > 0 THEN 'MEDIUM' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', format('Stale payroll runs stuck in processing: %s', _count),
    'auto_fix_possible', true, 'affected_count', _count
  );

  -- RC-023: Journal entries with unbalanced debits/credits
  SELECT count(*) INTO _count FROM (
    SELECT je.id FROM journal_entries je
    JOIN journal_lines jl ON jl.journal_entry_id = je.id
    GROUP BY je.id
    HAVING abs(sum(jl.debit_amount) - sum(jl.credit_amount)) > 0.01
  ) unbalanced;
  _checks := _checks || jsonb_build_object(
    'id', 'RC-023', 'category', 'Financial Integrity',
    'severity', CASE WHEN _count > 0 THEN 'CRITICAL' ELSE 'LOW' END,
    'status', CASE WHEN _count = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', format('Unbalanced journal entries (debit != credit): %s', _count),
    'auto_fix_possible', false, 'affected_count', _count
  );

  RETURN jsonb_build_object(
    'engine', 'Root Cause Audit Engine v1',
    'run_at', now(),
    'org_filter', p_org_id,
    'total_checks', jsonb_array_length(_checks),
    'checks', _checks
  );
END;
$$;
