
CREATE OR REPLACE FUNCTION public.run_financial_verification(_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _results jsonb := '[]'::jsonb;
  _check jsonb;
  _cnt bigint;
  _cnt2 bigint;
  _sum_d numeric;
  _sum_c numeric;
  _has_critical_fail boolean := false;
  _engine_status text;
  _tbl text;
  _missing_rls text[] := '{}';
  _org_count bigint;
  _total_records bigint;
  _leave_no_reviewer bigint;
  _leave_orphan bigint;
BEGIN

  -- ========================================
  -- CATEGORY 1: TENANT & ACCESS INTEGRITY
  -- ========================================

  -- T1: Organization Isolation
  SELECT count(*) INTO _cnt FROM public.profiles
  WHERE organization_id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'T1_ORG_ISOLATION', 'category', 'Tenant Access', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'All profiles have organization_id' ELSE _cnt || ' profiles missing organization_id' END,
    'auto_fix_possible', false
  );
  IF _cnt > 0 THEN _has_critical_fail := true; END IF;

  -- T2: RLS Coverage
  FOR _tbl IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    _missing_rls := array_append(_missing_rls, _tbl);
  END LOOP;
  _results := _results || jsonb_build_object(
    'id', 'T2_RLS_COVERAGE', 'category', 'Tenant Access', 'severity', 'CRITICAL',
    'status', CASE WHEN array_length(_missing_rls, 1) IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN array_length(_missing_rls, 1) IS NULL THEN 'All tables have RLS enabled' ELSE array_length(_missing_rls, 1) || ' tables without RLS: ' || array_to_string(_missing_rls, ', ') END,
    'auto_fix_possible', false
  );
  IF array_length(_missing_rls, 1) IS NOT NULL THEN _has_critical_fail := true; END IF;

  -- T3: User-Role Integrity
  SELECT count(*) INTO _cnt FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id AND p.organization_id = ur.organization_id
  WHERE p.id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'T3_ROLE_INTEGRITY', 'category', 'Tenant Access', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All user_roles have matching profiles' ELSE _cnt || ' orphan user_roles without matching profile' END,
    'auto_fix_possible', true
  );

  -- ========================================
  -- CATEGORY 2: FINANCIAL ACCURACY
  -- ========================================

  -- F1: Trial Balance
  SELECT COALESCE(SUM(jl.debit), 0), COALESCE(SUM(jl.credit), 0)
  INTO _sum_d, _sum_c
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE (_org_id IS NULL OR je.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F1_TRIAL_BALANCE', 'category', 'Financial Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _sum_d = _sum_c THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _sum_d = _sum_c THEN 'Trial balance is balanced (debits = credits = ' || _sum_d || ')'
      ELSE 'IMBALANCE: debits=' || _sum_d || ' credits=' || _sum_c || ' diff=' || (_sum_d - _sum_c) END,
    'auto_fix_possible', false
  );
  IF _sum_d != _sum_c THEN _has_critical_fail := true; END IF;

  -- F2: Orphan Journal Lines
  SELECT count(*) INTO _cnt FROM public.journal_lines jl
  LEFT JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'F2_ORPHAN_JOURNAL_LINES', 'category', 'Financial Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No orphan journal lines' ELSE _cnt || ' orphan journal lines found' END,
    'auto_fix_possible', true
  );

  -- F3: Invoice Amount Integrity
  SELECT count(*) INTO _cnt FROM public.invoices i
  WHERE i.amount < 0
    AND (_org_id IS NULL OR i.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F3_INVOICE_AMOUNTS', 'category', 'Financial Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All invoice amounts are non-negative' ELSE _cnt || ' invoices with negative amounts' END,
    'auto_fix_possible', false
  );

  -- F4: GL Account Balance Consistency (computed from journal_lines vs gl_accounts)
  -- gl_accounts does not store a running balance; balances are computed on-the-fly.
  -- Instead, verify that every gl_account referenced in journal_lines actually exists.
  SELECT count(*) INTO _cnt FROM public.journal_lines jl
  LEFT JOIN public.gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE ga.id IS NULL
    AND (_org_id IS NULL OR jl.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F4_GL_ACCOUNT_REFERENTIAL', 'category', 'Financial Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All journal lines reference valid GL accounts' ELSE _cnt || ' journal lines reference non-existent GL accounts' END,
    'auto_fix_possible', false
  );

  -- F5: Fiscal Period Lock Enforcement
  SELECT count(*) INTO _cnt FROM public.financial_records fr
  JOIN public.fiscal_periods fp ON fr.organization_id = fp.organization_id
    AND fr.record_date BETWEEN fp.start_date AND fp.end_date
  WHERE fp.status = 'locked'
    AND fr.updated_at > fp.closed_at
    AND (_org_id IS NULL OR fr.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F5_PERIOD_LOCK', 'category', 'Financial Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'No modifications detected in locked periods' ELSE _cnt || ' records modified after period lock' END,
    'auto_fix_possible', false
  );
  IF _cnt > 0 THEN _has_critical_fail := true; END IF;

  -- ========================================
  -- CATEGORY 3: COMPLIANCE & AUDIT
  -- ========================================

  -- C1: Expense Receipt Compliance
  SELECT count(*) INTO _cnt FROM public.expenses
  WHERE receipt_url IS NULL AND status != 'rejected'
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'C1_EXPENSE_RECEIPTS', 'category', 'Compliance', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All non-rejected expenses have receipts' ELSE _cnt || ' expenses missing receipts' END,
    'auto_fix_possible', false
  );

  -- C2: Audit Log Coverage
  SELECT count(*) INTO _cnt FROM public.audit_logs
  WHERE (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'C2_AUDIT_LOG_COVERAGE', 'category', 'Compliance', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt > 0 THEN _cnt || ' audit log entries found' ELSE 'No audit log entries — ensure audit logging is active' END,
    'auto_fix_possible', false
  );

  -- C3: Payroll Approval Workflow
  SELECT count(*) INTO _cnt FROM public.payroll_runs
  WHERE status = 'approved' AND approved_by IS NULL
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'C3_PAYROLL_APPROVAL', 'category', 'Compliance', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All approved payroll runs have approver recorded' ELSE _cnt || ' approved payroll runs missing approver' END,
    'auto_fix_possible', false
  );

  -- ========================================
  -- CATEGORY 4: OPERATIONAL SAFETY
  -- ========================================

  -- O1: Duplicate Invoice Numbers
  SELECT count(*) INTO _cnt FROM (
    SELECT invoice_number, organization_id FROM public.invoices
    WHERE (_org_id IS NULL OR organization_id = _org_id)
    GROUP BY invoice_number, organization_id HAVING count(*) > 1
  ) dup;
  _results := _results || jsonb_build_object(
    'id', 'O1_DUPLICATE_INVOICES', 'category', 'Operational Safety', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No duplicate invoice numbers' ELSE _cnt || ' duplicate invoice number groups found' END,
    'auto_fix_possible', false
  );

  -- O2: Stale Draft Entries
  SELECT count(*) INTO _cnt FROM public.financial_records
  WHERE status = 'draft' AND created_at < now() - interval '30 days'
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'O2_STALE_DRAFTS', 'category', 'Operational Safety', 'severity', 'LOW',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'INFO' END,
    'message', CASE WHEN _cnt = 0 THEN 'No stale draft entries' ELSE _cnt || ' draft entries older than 30 days' END,
    'auto_fix_possible', false
  );

  -- ========================================
  -- CATEGORY 5: WORKFLOW INTEGRITY
  -- ========================================

  -- W1: Payroll Run Lifecycle
  SELECT count(*) INTO _cnt FROM public.payroll_runs
  WHERE status = 'finalized' AND approved_by IS NULL
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W1_PAYROLL_LIFECYCLE', 'category', 'Workflow Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All finalized payroll runs were properly approved' ELSE _cnt || ' finalized payroll runs skipped approval' END,
    'auto_fix_possible', false
  );

  -- W2: Leave Approval Without Reviewer
  SELECT count(*) INTO _cnt FROM public.leave_requests
  WHERE status = 'approved' AND reviewed_by IS NULL
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W2_LEAVE_APPROVAL', 'category', 'Workflow Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All approved leaves have a reviewer' ELSE _cnt || ' approved leaves missing reviewer' END,
    'auto_fix_possible', false
  );

  -- W3: Expense Workflow Integrity
  SELECT count(*) INTO _cnt FROM public.expenses
  WHERE status = 'paid' AND reviewed_by IS NULL
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W3_EXPENSE_WORKFLOW', 'category', 'Workflow Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All paid expenses have a reviewer' ELSE _cnt || ' paid expenses missing reviewer' END,
    'auto_fix_possible', false
  );

  -- ========================================
  -- CATEGORY 6: DATA BINDING VALIDATION
  -- ========================================

  -- UI1: Profile-User Binding
  SELECT count(*) INTO _cnt FROM public.profiles
  WHERE user_id IS NULL
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'UI1_PROFILE_BINDING', 'category', 'Data Binding', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All profiles are linked to auth users' ELSE _cnt || ' profiles without user_id binding' END,
    'auto_fix_possible', false
  );

  -- UI2: Attendance Orphans
  SELECT count(*) INTO _cnt FROM public.attendance_records ar
  LEFT JOIN public.profiles p ON p.id = ar.profile_id
  WHERE ar.profile_id IS NOT NULL AND p.id IS NULL
    AND (_org_id IS NULL OR ar.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'UI2_ATTENDANCE_ORPHANS', 'category', 'Data Binding', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No orphan attendance records' ELSE _cnt || ' attendance records with invalid profile_id' END,
    'auto_fix_possible', true
  );

  -- UI3: Leave Request Orphans
  SELECT count(*) INTO _cnt FROM public.leave_requests lr
  LEFT JOIN public.profiles p ON p.id = lr.profile_id
  WHERE lr.profile_id IS NOT NULL AND p.id IS NULL
    AND (_org_id IS NULL OR lr.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'UI3_LEAVE_ORPHANS', 'category', 'Data Binding', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No orphan leave requests' ELSE _cnt || ' leave requests with invalid profile_id' END,
    'auto_fix_possible', true
  );

  -- ========================================
  -- FINAL SUMMARY
  -- ========================================
  _results := _results || jsonb_build_object(
    'id', 'SUMMARY', 'category', 'System', 'severity', 'INFO',
    'status', CASE WHEN _has_critical_fail THEN 'CRITICAL_ISSUES_FOUND' ELSE 'ALL_CLEAR' END,
    'message', CASE WHEN _has_critical_fail THEN 'Critical integrity issues detected — review required' ELSE 'All integrity checks passed successfully' END,
    'auto_fix_possible', false
  );

  RETURN _results;
END;
$$;
