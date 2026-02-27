
-- Fix verification engine: leave_requests uses 'reviewed_by' not 'approved_by'
CREATE OR REPLACE FUNCTION public.run_financial_verification(_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '60s'
AS $function$
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
  -- W2 fix: use reviewed_by instead of approved_by
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
    'id', 'T1_ORG_ISOLATION', 'category', 'Tenant & Access Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'All profiles have organization_id' ELSE _cnt || ' profiles missing organization_id' END,
    'auto_fix_possible', false
  );
  IF _cnt > 0 THEN _has_critical_fail := true; END IF;

  -- T2: RLS Enforcement
  FOR _tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename NOT IN ('schema_migrations', 'spatial_ref_sys')
  LOOP
    PERFORM 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = _tbl AND c.relrowsecurity = false;
    IF FOUND THEN
      _missing_rls := array_append(_missing_rls, _tbl);
    END IF;
  END LOOP;
  _results := _results || jsonb_build_object(
    'id', 'T2_RLS_ENFORCEMENT', 'category', 'Tenant & Access Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN array_length(_missing_rls, 1) IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN array_length(_missing_rls, 1) IS NULL THEN 'RLS enabled on all public tables'
      ELSE 'RLS disabled on: ' || array_to_string(_missing_rls, ', ') END,
    'auto_fix_possible', true
  );
  IF array_length(_missing_rls, 1) IS NOT NULL THEN _has_critical_fail := true; END IF;

  -- T3: Cross-Tenant Data Leak Check
  SELECT count(*) INTO _cnt FROM public.financial_records fr
  JOIN public.profiles p ON p.user_id = fr.user_id
  WHERE fr.organization_id != p.organization_id
    AND (_org_id IS NULL OR fr.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'T3_CROSS_TENANT_LEAK', 'category', 'Tenant & Access Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'No cross-tenant data leaks detected' ELSE _cnt || ' records with mismatched organization_id' END,
    'auto_fix_possible', false
  );
  IF _cnt > 0 THEN _has_critical_fail := true; END IF;

  -- T4: Role Assignment Integrity
  SELECT count(*) INTO _cnt FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE p.id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'T4_ROLE_INTEGRITY', 'category', 'Tenant & Access Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All role assignments have valid profiles' ELSE _cnt || ' role assignments with missing profiles' END,
    'auto_fix_possible', true
  );

  -- ========================================
  -- CATEGORY 2: FINANCIAL INTEGRITY
  -- ========================================

  -- F1: Double-Entry Balance
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO _sum_d, _sum_c
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.entry_id
  WHERE je.status = 'posted'
    AND (_org_id IS NULL OR je.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F1_DOUBLE_ENTRY_BALANCE', 'category', 'Financial Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _sum_d = _sum_c THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _sum_d = _sum_c THEN 'Double-entry balanced: debits = credits = ' || _sum_d
      ELSE 'IMBALANCE: debits=' || _sum_d || ' credits=' || _sum_c || ' diff=' || (_sum_d - _sum_c) END,
    'auto_fix_possible', false
  );
  IF _sum_d != _sum_c THEN _has_critical_fail := true; END IF;

  -- F2: Orphan Journal Lines
  SELECT count(*) INTO _cnt FROM public.journal_entry_lines jel
  LEFT JOIN public.journal_entries je ON je.id = jel.entry_id
  WHERE je.id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'F2_ORPHAN_JOURNAL_LINES', 'category', 'Financial Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No orphan journal lines' ELSE _cnt || ' orphan journal entry lines found' END,
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

  -- F4: GL Account Balance Consistency
  SELECT count(*) INTO _cnt FROM public.gl_accounts ga
  WHERE ga.current_balance != (
    SELECT COALESCE(SUM(jel.debit) - SUM(jel.credit), 0)
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.entry_id
    WHERE jel.account_id = ga.id AND je.status = 'posted'
  )
  AND (_org_id IS NULL OR ga.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F4_GL_BALANCE_CONSISTENCY', 'category', 'Financial Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All GL account balances are consistent with journal entries' ELSE _cnt || ' GL accounts with balance mismatch' END,
    'auto_fix_possible', true
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

  -- C1: Audit Log Coverage
  SELECT count(DISTINCT entity_type) INTO _cnt FROM public.audit_logs
  WHERE (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'C1_AUDIT_COVERAGE', 'category', 'Compliance & Audit', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt >= 3 THEN 'PASS' WHEN _cnt >= 1 THEN 'WARNING' ELSE 'FAIL' END,
    'message', _cnt || ' entity types covered in audit logs',
    'auto_fix_possible', false
  );

  -- C2: Document Sequence Gaps
  SELECT count(*) INTO _cnt FROM public.document_sequences ds
  WHERE ds.next_number <= 0
    AND (_org_id IS NULL OR ds.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'C2_DOC_SEQUENCE', 'category', 'Compliance & Audit', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All document sequences are valid' ELSE _cnt || ' document sequences with invalid numbering' END,
    'auto_fix_possible', true
  );

  -- C3: Approval Workflow Integrity
  SELECT count(*) INTO _cnt FROM public.approval_workflows aw
  WHERE aw.is_active = true AND aw.threshold_amount <= 0
    AND (_org_id IS NULL OR aw.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'C3_APPROVAL_WORKFLOWS', 'category', 'Compliance & Audit', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All active approval workflows have valid thresholds' ELSE _cnt || ' workflows with zero/negative thresholds' END,
    'auto_fix_possible', true
  );

  -- ========================================
  -- CATEGORY 4: OPERATIONAL SAFETY
  -- ========================================

  -- O1: Payroll Duplicate Check
  SELECT count(*) INTO _cnt FROM (
    SELECT profile_id, pay_period, count(*) as cnt
    FROM public.payroll_records
    WHERE (_org_id IS NULL OR organization_id = _org_id)
    GROUP BY profile_id, pay_period
    HAVING count(*) > 1
  ) dupes;
  _results := _results || jsonb_build_object(
    'id', 'O1_PAYROLL_DUPLICATES', 'category', 'Operational Safety', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'No duplicate payroll records found' ELSE _cnt || ' employee-period combinations with duplicate payroll' END,
    'auto_fix_possible', false
  );
  IF _cnt > 0 THEN _has_critical_fail := true; END IF;

  -- O2: Attendance Data Consistency
  SELECT count(*) INTO _cnt FROM public.attendance_daily ad
  WHERE ad.total_work_minutes < 0
    AND (_org_id IS NULL OR ad.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'O2_ATTENDANCE_CONSISTENCY', 'category', 'Operational Safety', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All attendance records have valid work minutes' ELSE _cnt || ' records with negative work minutes' END,
    'auto_fix_possible', true
  );

  -- O3: Asset Depreciation Integrity
  SELECT count(*) INTO _cnt FROM public.assets a
  WHERE a.current_book_value < 0
    AND (_org_id IS NULL OR a.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'O3_ASSET_DEPRECIATION', 'category', 'Operational Safety', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All asset book values are non-negative' ELSE _cnt || ' assets with negative book value' END,
    'auto_fix_possible', true
  );

  -- O4: Compensation Structure Integrity
  SELECT count(*) INTO _cnt FROM public.compensation_structures cs
  WHERE cs.is_active = true AND cs.annual_ctc <= 0
    AND (_org_id IS NULL OR cs.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'O4_COMPENSATION_INTEGRITY', 'category', 'Operational Safety', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All active compensation structures have valid CTC' ELSE _cnt || ' active structures with zero/negative CTC' END,
    'auto_fix_possible', false
  );

  -- ========================================
  -- CATEGORY 5: WORKFLOW INTEGRITY
  -- ========================================

  -- W1: Payroll Lifecycle Compliance
  -- Verify payroll records follow the draft → under_review → approved → locked lifecycle
  SELECT count(*) INTO _cnt FROM public.payroll_runs pr
  WHERE pr.status NOT IN ('draft', 'under_review', 'approved', 'locked')
    AND (_org_id IS NULL OR pr.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W1_PAYROLL_LIFECYCLE', 'category', 'Workflow Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All payroll runs follow valid lifecycle states'
      ELSE _cnt || ' payroll runs with invalid status values' END,
    'auto_fix_possible', true
  );

  -- W2: Leave Approval Chain (FIXED: use reviewed_by instead of approved_by)
  SELECT count(*) INTO _leave_no_reviewer FROM public.leave_requests
  WHERE status = 'approved' AND reviewed_by IS NULL
    AND (_org_id IS NULL OR organization_id = _org_id);
  SELECT count(*) INTO _leave_orphan FROM public.leave_requests lr
  WHERE lr.status = 'approved'
    AND lr.reviewed_by IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = lr.profile_id AND (p.manager_id = lr.reviewed_by OR EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = lr.reviewed_by AND ur.role IN ('admin', 'hr')
      ))
    )
    AND (_org_id IS NULL OR lr.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W2_LEAVE_APPROVAL_CHAIN', 'category', 'Workflow Integrity', 'severity', 'HIGH',
    'status', CASE
      WHEN _leave_no_reviewer = 0 AND _leave_orphan = 0 THEN 'PASS'
      WHEN _leave_no_reviewer > 0 THEN 'WARNING'
      ELSE 'INFO'
    END,
    'message', CASE
      WHEN _leave_no_reviewer = 0 AND _leave_orphan = 0 THEN 'All approved leaves have valid reviewer chain'
      WHEN _leave_no_reviewer > 0 THEN _leave_no_reviewer || ' approved leaves missing reviewer'
      ELSE _leave_orphan || ' approved leaves with reviewer outside management chain'
    END,
    'auto_fix_possible', true
  );

  -- W3: Expense Approval Pipeline
  SELECT count(*) INTO _cnt FROM public.expenses e
  WHERE e.status = 'approved' AND e.profile_id IS NULL
    AND (_org_id IS NULL OR e.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W3_EXPENSE_APPROVAL', 'category', 'Workflow Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All approved expenses have valid profile attribution'
      ELSE _cnt || ' approved expenses missing profile_id' END,
    'auto_fix_possible', true
  );

  -- W4: Invoice Status Transitions
  SELECT count(*) INTO _cnt FROM public.invoices i
  WHERE i.status NOT IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')
    AND (_org_id IS NULL OR i.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W4_INVOICE_STATUS', 'category', 'Workflow Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All invoices have valid status values'
      ELSE _cnt || ' invoices with invalid status values' END,
    'auto_fix_possible', true
  );

  -- W5: Profile Change Request Workflow
  SELECT count(*) INTO _cnt FROM public.profile_change_requests pcr
  WHERE pcr.status NOT IN ('pending', 'approved', 'rejected')
    AND (_org_id IS NULL OR pcr.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W5_PROFILE_CHANGE_WORKFLOW', 'category', 'Workflow Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All profile change requests have valid status'
      ELSE _cnt || ' profile change requests with invalid status' END,
    'auto_fix_possible', false
  );

  -- ========================================
  -- ENGINE STATUS
  -- ========================================
  _engine_status := CASE WHEN _has_critical_fail THEN 'BLOCKED' ELSE 'HEALTHY' END;

  RETURN jsonb_build_object(
    'engine_version', 'v4.0',
    'engine_status', _engine_status,
    'run_at', now(),
    'organization_id', _org_id,
    'total_checks', jsonb_array_length(_results),
    'critical_failures', (SELECT count(*) FROM jsonb_array_elements(_results) r WHERE r->>'status' = 'FAIL'),
    'warnings', (SELECT count(*) FROM jsonb_array_elements(_results) r WHERE r->>'status' = 'WARNING'),
    'passed', (SELECT count(*) FROM jsonb_array_elements(_results) r WHERE r->>'status' = 'PASS'),
    'results', _results
  );
END;
$function$;
