-- Fix F1_TRIAL_BALANCE to only check posted entries (drafts are WIP, not part of trial balance)
CREATE OR REPLACE FUNCTION public.run_integrity_verification(_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _results jsonb := '[]'::jsonb;
  _cnt bigint;
  _sum_d numeric;
  _sum_c numeric;
  _has_critical_fail boolean := false;
  _has_warning boolean := false;
BEGIN
  -- T1: Org Isolation
  SELECT COUNT(*) INTO _cnt FROM public.profiles WHERE organization_id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'T1_ORG_ISOLATION', 'category', 'Tenant Security', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'All profiles have organization_id' ELSE _cnt || ' profiles missing organization_id' END,
    'auto_fix_possible', false
  );
  IF _cnt > 0 THEN _has_critical_fail := true; END IF;

  -- T2: RLS Coverage
  SELECT COUNT(*) INTO _cnt
  FROM information_schema.tables t
  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    AND NOT EXISTS (SELECT 1 FROM pg_tables pt WHERE pt.schemaname = 'public' AND pt.tablename = t.table_name AND pt.rowsecurity = true);
  _results := _results || jsonb_build_object(
    'id', 'T2_RLS_COVERAGE', 'category', 'Tenant Security', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'All tables have RLS enabled' ELSE _cnt || ' tables without RLS' END,
    'auto_fix_possible', true
  );
  IF _cnt > 0 THEN _has_critical_fail := true; END IF;

  -- T3: Role Integrity
  SELECT COUNT(*) INTO _cnt
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE p.id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'T3_ROLE_INTEGRITY', 'category', 'Tenant Security', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All user_roles have matching profiles' ELSE _cnt || ' orphan user_roles without matching profile' END,
    'auto_fix_possible', true
  );

  -- F1: Trial Balance (POSTED entries only — drafts are WIP)
  SELECT COALESCE(SUM(jl.debit), 0), COALESCE(SUM(jl.credit), 0)
  INTO _sum_d, _sum_c
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.status = 'posted'
    AND (_org_id IS NULL OR je.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F1_TRIAL_BALANCE', 'category', 'Financial Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _sum_d = _sum_c THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _sum_d = _sum_c THEN 'Trial balance is balanced (debits = credits = ' || _sum_d || ')'
      ELSE 'IMBALANCE: debits=' || _sum_d || ' credits=' || _sum_c || ' diff=' || (_sum_d - _sum_c) END,
    'auto_fix_possible', false
  );
  IF _sum_d != _sum_c THEN _has_critical_fail := true; END IF;

  -- F1b: Draft Entry Balance Warning
  SELECT COALESCE(SUM(jl.debit), 0), COALESCE(SUM(jl.credit), 0)
  INTO _sum_d, _sum_c
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.status = 'draft'
    AND (_org_id IS NULL OR je.organization_id = _org_id);
  IF _sum_d != _sum_c THEN
    _results := _results || jsonb_build_object(
      'id', 'F1b_DRAFT_BALANCE', 'category', 'Financial Integrity', 'severity', 'MEDIUM',
      'status', 'WARNING',
      'message', 'Draft entries imbalanced: debits=' || _sum_d || ' credits=' || _sum_c || ' diff=' || (_sum_d - _sum_c) || ' (will block posting)',
      'auto_fix_possible', true
    );
    _has_warning := true;
  END IF;

  -- F2: Orphan Journal Lines
  SELECT COUNT(*) INTO _cnt
  FROM public.journal_lines jl
  LEFT JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'F2_ORPHAN_JOURNAL_LINES', 'category', 'Financial Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'No orphan journal lines' ELSE _cnt || ' orphan journal lines found' END,
    'auto_fix_possible', true
  );

  -- F3: Invoice Amounts
  SELECT COUNT(*) INTO _cnt FROM public.invoices WHERE total_amount < 0 AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F3_INVOICE_AMOUNTS', 'category', 'Financial Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'All invoice amounts are non-negative' ELSE _cnt || ' invoices with negative amounts' END,
    'auto_fix_possible', false
  );

  -- F4: GL Account Referential Integrity
  SELECT COUNT(*) INTO _cnt
  FROM public.journal_lines jl
  LEFT JOIN public.gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE ga.id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'F4_GL_ACCOUNT_REFERENTIAL', 'category', 'Financial Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'All journal lines reference valid GL accounts' ELSE _cnt || ' journal lines with invalid GL account refs' END,
    'auto_fix_possible', false
  );

  -- F5: Period Lock
  SELECT COUNT(*) INTO _cnt
  FROM public.journal_entries je
  JOIN public.fiscal_periods fp ON fp.organization_id = je.organization_id
    AND je.entry_date BETWEEN fp.start_date AND fp.end_date
  WHERE fp.status = 'closed'
    AND je.created_at > fp.updated_at
    AND (_org_id IS NULL OR je.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F5_PERIOD_LOCK', 'category', 'Financial Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'No modifications detected in locked periods' ELSE _cnt || ' entries created after period close' END,
    'auto_fix_possible', false
  );
  IF _cnt > 0 THEN _has_critical_fail := true; END IF;

  -- C1: Expense Receipts
  SELECT COUNT(*) INTO _cnt FROM public.expenses WHERE receipt_url IS NULL AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'C1_EXPENSE_RECEIPTS', 'category', 'Compliance', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All expenses have receipts' ELSE _cnt || ' expenses missing receipts' END,
    'auto_fix_possible', false
  );
  IF _cnt > 0 THEN _has_warning := true; END IF;

  -- C2: Audit Log Coverage
  SELECT COUNT(*) INTO _cnt FROM public.audit_logs WHERE (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'C2_AUDIT_LOG_COVERAGE', 'category', 'Compliance', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', _cnt || ' audit log entries found',
    'auto_fix_possible', false
  );

  -- C3: Payroll Approval
  SELECT COUNT(*) INTO _cnt
  FROM public.payroll_runs
  WHERE status = 'processed' AND approved_by IS NULL AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'C3_PAYROLL_APPROVAL', 'category', 'Compliance', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'All approved payroll runs have approver recorded' ELSE _cnt || ' payroll runs processed without approver' END,
    'auto_fix_possible', false
  );

  -- O1: Duplicate Invoices
  SELECT COUNT(*) INTO _cnt FROM (
    SELECT invoice_number, organization_id FROM public.invoices
    WHERE (_org_id IS NULL OR organization_id = _org_id)
    GROUP BY invoice_number, organization_id HAVING COUNT(*) > 1
  ) dupes;
  _results := _results || jsonb_build_object(
    'id', 'O1_DUPLICATE_INVOICES', 'category', 'Operational Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'No duplicate invoice numbers' ELSE _cnt || ' duplicate invoice number groups found' END,
    'auto_fix_possible', false
  );

  -- O2: Stale Drafts
  SELECT COUNT(*) INTO _cnt
  FROM public.journal_entries
  WHERE status = 'draft' AND created_at < NOW() - INTERVAL '30 days'
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'O2_STALE_DRAFTS', 'category', 'Operational Integrity', 'severity', 'LOW',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No stale unposted entries' ELSE _cnt || ' journal entries in draft for >30 days' END,
    'auto_fix_possible', true
  );

  -- W1: Payroll Lifecycle
  SELECT COUNT(*) INTO _cnt
  FROM public.payroll_runs
  WHERE status = 'processed' AND approved_at IS NULL
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W1_PAYROLL_LIFECYCLE', 'category', 'Workflow Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'All finalized payroll runs were properly approved' ELSE _cnt || ' payroll runs finalized without proper approval timestamp' END,
    'auto_fix_possible', false
  );

  -- W2: Leave Approval
  SELECT COUNT(*) INTO _cnt
  FROM public.leave_requests
  WHERE status = 'approved' AND reviewed_by IS NULL
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W2_LEAVE_APPROVAL', 'category', 'Workflow Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All approved leaves have a reviewer' ELSE _cnt || ' approved leaves without reviewer recorded' END,
    'auto_fix_possible', false
  );

  -- W3: Expense Workflow
  SELECT COUNT(*) INTO _cnt
  FROM public.expenses
  WHERE status = 'paid' AND approved_by IS NULL
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W3_EXPENSE_WORKFLOW', 'category', 'Workflow Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All paid expenses have a reviewer' ELSE _cnt || ' paid expenses without reviewer' END,
    'auto_fix_possible', false
  );

  -- UI1: Profile Binding
  SELECT COUNT(*) INTO _cnt
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE u.id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'UI1_PROFILE_BINDING', 'category', 'UI/Data Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'All profiles are linked to auth users' ELSE _cnt || ' profiles without matching auth user' END,
    'auto_fix_possible', true
  );

  -- UI2: Attendance Orphans
  SELECT COUNT(*) INTO _cnt
  FROM public.attendance_records ar
  LEFT JOIN public.profiles p ON p.id = ar.profile_id
  WHERE ar.profile_id IS NOT NULL AND p.id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'UI2_ATTENDANCE_ORPHANS', 'category', 'UI/Data Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No orphan attendance records' ELSE _cnt || ' attendance records with invalid profile' END,
    'auto_fix_possible', true
  );

  -- UI3: Leave Orphans
  SELECT COUNT(*) INTO _cnt
  FROM public.leave_requests lr
  LEFT JOIN public.profiles p ON p.id = lr.profile_id
  WHERE lr.profile_id IS NOT NULL AND p.id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'UI3_LEAVE_ORPHANS', 'category', 'UI/Data Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No orphan leave requests' ELSE _cnt || ' leave requests with invalid profile' END,
    'auto_fix_possible', true
  );

  RETURN jsonb_build_object(
    'run_at', NOW(),
    'organization_id', _org_id,
    'total_checks', jsonb_array_length(_results),
    'passed', (SELECT COUNT(*) FROM jsonb_array_elements(_results) r WHERE r->>'status' = 'PASS'),
    'failed', (SELECT COUNT(*) FROM jsonb_array_elements(_results) r WHERE r->>'status' = 'FAIL'),
    'warnings', (SELECT COUNT(*) FROM jsonb_array_elements(_results) r WHERE r->>'status' = 'WARNING'),
    'overall_status', CASE
      WHEN _has_critical_fail THEN 'BLOCKED'
      WHEN _has_warning THEN 'DEGRADED'
      ELSE 'OPERATIONAL'
    END,
    'results', _results
  );
END;
$$;