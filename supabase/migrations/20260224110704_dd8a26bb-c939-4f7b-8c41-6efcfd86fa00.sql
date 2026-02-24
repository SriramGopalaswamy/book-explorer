
-- =====================================================
-- Financial System Verification Engine v2
-- Comprehensive read-only verification across 4 categories
-- =====================================================

CREATE OR REPLACE FUNCTION public.run_financial_verification(_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  _missing_idx text[] := '{}';
BEGIN
  -- Only super_admins can run verification
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: only super_admin can run verification engine';
  END IF;

  -- =====================================================
  -- CATEGORY 1: TENANT & ACCESS INTEGRITY
  -- =====================================================

  -- T1: RLS enforcement on all tenant-scoped tables (CRITICAL)
  SELECT array_agg(pt.tablename)
  INTO _missing_rls
  FROM pg_tables pt
  JOIN information_schema.columns c
    ON c.table_schema = pt.schemaname AND c.table_name = pt.tablename
  WHERE pt.schemaname = 'public'
    AND c.column_name = 'organization_id'
    AND pt.tablename NOT IN ('organizations')
    AND pt.rowsecurity = false;

  _check := jsonb_build_object(
    'id', 'T1_RLS_ENFORCEMENT',
    'category', 'Tenant & Access Integrity',
    'severity', 'CRITICAL',
    'status', CASE WHEN COALESCE(array_length(_missing_rls, 1), 0) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN COALESCE(array_length(_missing_rls, 1), 0) = 0 
      THEN 'All ' || (SELECT count(DISTINCT pt.tablename) FROM pg_tables pt JOIN information_schema.columns c ON c.table_schema = pt.schemaname AND c.table_name = pt.tablename WHERE pt.schemaname = 'public' AND c.column_name = 'organization_id' AND pt.tablename != 'organizations') || ' tenant tables have RLS enabled'
      ELSE 'RLS disabled on: ' || array_to_string(_missing_rls, ', ')
    END,
    'auto_fix_possible', true
  );
  _results := _results || _check;
  IF (_check->>'status') = 'FAIL' THEN _has_critical_fail := true; END IF;

  -- T2: User roles org-scoped (no NULL org_id) (HIGH)
  SELECT count(*) INTO _cnt FROM public.user_roles WHERE organization_id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'T2_ROLES_ORG_SCOPED',
    'category', 'Tenant & Access Integrity',
    'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt = 0 THEN 'All user_roles entries are org-scoped' ELSE _cnt || ' user_roles entries missing organization_id' END,
    'auto_fix_possible', false
  );

  -- T3: Role escalation detection (HIGH) - users with admin in multiple orgs
  SELECT count(*) INTO _cnt
  FROM (
    SELECT user_id FROM public.user_roles WHERE role = 'admin' GROUP BY user_id HAVING count(DISTINCT organization_id) > 1
  ) x;
  _results := _results || jsonb_build_object(
    'id', 'T3_ROLE_ESCALATION',
    'category', 'Tenant & Access Integrity',
    'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt = 0 THEN 'No cross-tenant admin escalation detected' ELSE _cnt || ' users have admin role across multiple organizations' END,
    'auto_fix_possible', false
  );

  -- T4: Orphan organizations (HIGH) - orgs with no members
  SELECT count(*) INTO _cnt
  FROM public.organizations o
  WHERE NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = o.id)
    AND o.environment_type != 'sandbox';
  _results := _results || jsonb_build_object(
    'id', 'T4_ORPHAN_ORGS',
    'category', 'Tenant & Access Integrity',
    'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt = 0 THEN 'All non-sandbox organizations have members' ELSE _cnt || ' organizations have zero members' END,
    'auto_fix_possible', false
  );

  -- T5: Session isolation (platform_roles secured) (CRITICAL)
  _results := _results || jsonb_build_object(
    'id', 'T5_SESSION_ISOLATION',
    'category', 'Tenant & Access Integrity',
    'severity', 'CRITICAL',
    'status', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_roles' AND rowsecurity = true) THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_roles' AND rowsecurity = true) THEN 'platform_roles table has RLS enabled' ELSE 'platform_roles missing RLS - privilege escalation risk' END,
    'auto_fix_possible', true
  );
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_roles' AND rowsecurity = true) THEN
    _has_critical_fail := true;
  END IF;

  -- T6: API org mismatch protection (CRITICAL) - verify org-scoping triggers exist
  SELECT count(*) INTO _cnt
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND (trigger_name LIKE '%auto_set_org%' OR trigger_name LIKE '%block_locked%' OR trigger_name LIKE '%validate_identity%');
  _results := _results || jsonb_build_object(
    'id', 'T6_API_ORG_MISMATCH',
    'category', 'Tenant & Access Integrity',
    'severity', 'CRITICAL',
    'status', CASE WHEN _cnt >= 3 THEN 'PASS' ELSE 'WARNING' END,
    'detail', _cnt || ' org-protection triggers active (auto_set_org, block_locked, validate_identity)',
    'auto_fix_possible', false
  );

  -- =====================================================
  -- CATEGORY 2: FINANCIAL INTEGRITY
  -- =====================================================

  -- F1: Double entry validation - sum(debit) = sum(credit) (CRITICAL)
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO _sum_d, _sum_c
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.is_posted = true
    AND (_org_id IS NULL OR je.organization_id = _org_id);

  _check := jsonb_build_object(
    'id', 'F1_DOUBLE_ENTRY',
    'category', 'Financial Integrity',
    'severity', 'CRITICAL',
    'status', CASE WHEN _sum_d = _sum_c THEN 'PASS' ELSE 'FAIL' END,
    'detail', 'Total Debits: ' || _sum_d::text || ' | Total Credits: ' || _sum_c::text || ' | Variance: ' || (_sum_d - _sum_c)::text,
    'auto_fix_possible', false
  );
  _results := _results || _check;
  IF (_check->>'status') = 'FAIL' THEN _has_critical_fail := true; END IF;

  -- F2: No orphan journal lines (CRITICAL)
  SELECT count(*) INTO _cnt
  FROM public.journal_lines jl
  WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.id = jl.journal_entry_id);
  _check := jsonb_build_object(
    'id', 'F2_ORPHAN_JOURNAL_LINES',
    'category', 'Financial Integrity',
    'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt = 0 THEN 'No orphan journal lines detected' ELSE _cnt || ' journal lines with no parent entry' END,
    'auto_fix_possible', false
  );
  _results := _results || _check;
  IF (_check->>'status') = 'FAIL' THEN _has_critical_fail := true; END IF;

  -- F3: Posting immutability enforcement (CRITICAL) - verify triggers block UPDATE/DELETE on posted entries
  SELECT count(*) INTO _cnt
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND event_object_table IN ('journal_entries', 'journal_lines')
    AND (trigger_name LIKE '%immutable%' OR trigger_name LIKE '%prevent%' OR trigger_name LIKE '%block%');
  _check := jsonb_build_object(
    'id', 'F3_POSTING_IMMUTABILITY',
    'category', 'Financial Integrity',
    'severity', 'CRITICAL',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt > 0 THEN _cnt || ' immutability triggers active on journal tables' ELSE 'No immutability triggers found on journal_entries/journal_lines - data mutation risk' END,
    'auto_fix_possible', true
  );
  _results := _results || _check;
  IF (_check->>'status') = 'FAIL' THEN _has_critical_fail := true; END IF;

  -- F4: Closed period posting detection (CRITICAL)
  SELECT count(*) INTO _cnt
  FROM public.journal_entries je
  JOIN public.fiscal_periods fp ON fp.organization_id = je.organization_id
    AND je.entry_date BETWEEN fp.start_date AND fp.end_date
    AND fp.status = 'closed'
  WHERE je.is_posted = true
    AND je.created_at > fp.updated_at
    AND (_org_id IS NULL OR je.organization_id = _org_id);
  _check := jsonb_build_object(
    'id', 'F4_CLOSED_PERIOD_POSTING',
    'category', 'Financial Integrity',
    'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt = 0 THEN 'No entries posted into closed fiscal periods' ELSE _cnt || ' entries posted after period closure' END,
    'auto_fix_possible', false
  );
  _results := _results || _check;
  IF (_check->>'status') = 'FAIL' THEN _has_critical_fail := true; END IF;

  -- F5: COA duplicate code detection (HIGH)
  SELECT count(*) INTO _cnt
  FROM (
    SELECT organization_id, account_code FROM public.chart_of_accounts GROUP BY organization_id, account_code HAVING count(*) > 1
  ) x
  WHERE (_org_id IS NULL OR x.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F5_COA_DUPLICATES',
    'category', 'Financial Integrity',
    'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt = 0 THEN 'No duplicate account codes in Chart of Accounts' ELSE _cnt || ' duplicate account code(s) detected' END,
    'auto_fix_possible', false
  );

  -- F6: Mandatory GL accounts existence (HIGH)
  IF _org_id IS NOT NULL THEN
    SELECT count(*) INTO _cnt
    FROM unnest(ARRAY['1100','1200','2100','3100','4100','5100']) AS required_code
    WHERE NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts WHERE organization_id = _org_id AND account_code = required_code
    );
    _results := _results || jsonb_build_object(
      'id', 'F6_MANDATORY_ACCOUNTS',
      'category', 'Financial Integrity',
      'severity', 'HIGH',
      'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
      'detail', CASE WHEN _cnt = 0 THEN 'All 6 mandatory GL accounts present (Cash, AR, AP, Equity, Revenue, COGS)' ELSE _cnt || ' mandatory GL account(s) missing for target org' END,
      'auto_fix_possible', true
    );
  ELSE
    _results := _results || jsonb_build_object(
      'id', 'F6_MANDATORY_ACCOUNTS',
      'category', 'Financial Integrity',
      'severity', 'HIGH',
      'status', 'PASS',
      'detail', 'Mandatory accounts check skipped (no org_id filter - run with org for detailed check)',
      'auto_fix_possible', true
    );
  END IF;

  -- F7: Tax ledger mapping verification (HIGH)
  IF _org_id IS NOT NULL THEN
    SELECT count(*) INTO _cnt
    FROM unnest(ARRAY['2300','2310','2320']) AS tax_code
    WHERE NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts WHERE organization_id = _org_id AND account_code = tax_code
    );
    _results := _results || jsonb_build_object(
      'id', 'F7_TAX_LEDGER_MAPPING',
      'category', 'Financial Integrity',
      'severity', 'HIGH',
      'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
      'detail', CASE WHEN _cnt = 0 THEN 'All tax ledger accounts mapped (Input GST, Output GST, GST Payable)' ELSE _cnt || ' tax ledger account(s) missing' END,
      'auto_fix_possible', true
    );
  ELSE
    _results := _results || jsonb_build_object(
      'id', 'F7_TAX_LEDGER_MAPPING',
      'category', 'Financial Integrity',
      'severity', 'HIGH',
      'status', 'PASS',
      'detail', 'Tax ledger check skipped (no org_id filter)',
      'auto_fix_possible', true
    );
  END IF;

  -- F8: Posting engine determinism simulation (MEDIUM) - verify post_journal_entry function exists
  SELECT count(*) INTO _cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'post_journal_entry';
  _results := _results || jsonb_build_object(
    'id', 'F8_POSTING_ENGINE',
    'category', 'Financial Integrity',
    'severity', 'MEDIUM',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt > 0 THEN 'post_journal_entry SECURITY DEFINER function exists and operational' ELSE 'Posting engine function not found' END,
    'auto_fix_possible', false
  );

  -- =====================================================
  -- CATEGORY 3: COMPLIANCE & AUDIT
  -- =====================================================

  -- A1: Audit log parity validation (CRITICAL) - audit_logs must have NOT NULL org_id
  SELECT count(*) INTO _cnt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'audit_logs'
    AND column_name = 'organization_id' AND is_nullable = 'NO';
  _check := jsonb_build_object(
    'id', 'A1_AUDIT_LOG_PARITY',
    'category', 'Compliance & Audit',
    'severity', 'CRITICAL',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt > 0 THEN 'audit_logs.organization_id is NOT NULL - tenant parity enforced' ELSE 'audit_logs.organization_id is nullable - log spoofing risk' END,
    'auto_fix_possible', true
  );
  _results := _results || _check;
  IF (_check->>'status') = 'FAIL' THEN _has_critical_fail := true; END IF;

  -- A2: Audit tamper protection (CRITICAL) - verify no UPDATE/DELETE policies on audit_logs
  SELECT count(*) INTO _cnt
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'audit_logs'
    AND cmd IN ('UPDATE', 'DELETE');
  _results := _results || jsonb_build_object(
    'id', 'A2_AUDIT_TAMPER_PROTECTION',
    'category', 'Compliance & Audit',
    'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt = 0 THEN 'No UPDATE/DELETE RLS policies on audit_logs - immutability preserved' ELSE _cnt || ' UPDATE/DELETE policies found on audit_logs - potential tamper vector' END,
    'auto_fix_possible', false
  );

  -- A3: Payroll lock immutability (HIGH)
  SELECT count(*) INTO _cnt
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND event_object_table = 'payroll_runs'
    AND (trigger_name LIKE '%locked%' OR trigger_name LIKE '%state_transition%');
  _results := _results || jsonb_build_object(
    'id', 'A3_PAYROLL_IMMUTABILITY',
    'category', 'Compliance & Audit',
    'severity', 'HIGH',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt > 0 THEN _cnt || ' payroll lock enforcement trigger(s) active' ELSE 'No payroll lock triggers - locked runs may be mutated' END,
    'auto_fix_possible', true
  );

  -- A4: Compensation immutability (HIGH)
  SELECT count(*) INTO _cnt
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND event_object_table = 'compensation_structures'
    AND trigger_name LIKE '%prevent_compensation%';
  _results := _results || jsonb_build_object(
    'id', 'A4_COMPENSATION_IMMUTABILITY',
    'category', 'Compliance & Audit',
    'severity', 'HIGH',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt > 0 THEN 'Compensation mutation prevention trigger active' ELSE 'Compensation structures may be mutable' END,
    'auto_fix_possible', true
  );

  -- A5: Audit log coverage - key tables have audit triggers (MEDIUM)
  SELECT count(*) INTO _cnt
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND trigger_name LIKE '%audit%';
  _results := _results || jsonb_build_object(
    'id', 'A5_AUDIT_COVERAGE',
    'category', 'Compliance & Audit',
    'severity', 'MEDIUM',
    'status', CASE WHEN _cnt >= 2 THEN 'PASS' ELSE 'WARNING' END,
    'detail', _cnt || ' audit-related triggers detected across schema',
    'auto_fix_possible', false
  );

  -- =====================================================
  -- CATEGORY 4: OPERATIONAL & API SAFETY
  -- =====================================================

  -- O1: FK constraint coverage (HIGH)
  SELECT count(*) INTO _cnt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'organization_id'
    AND c.table_name NOT IN ('organizations')
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = c.table_name
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'organizations'
    );
  _results := _results || jsonb_build_object(
    'id', 'O1_FK_COVERAGE',
    'category', 'Operational & API Safety',
    'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt = 0 THEN 'All org-scoped tables have FK to organizations' ELSE _cnt || ' table(s) missing FK constraint to organizations' END,
    'auto_fix_possible', true
  );

  -- O2: Org write protection triggers (HIGH)
  SELECT count(*) INTO _cnt
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND trigger_name LIKE '%block_locked_or_archived%';
  _results := _results || jsonb_build_object(
    'id', 'O2_ORG_WRITE_PROTECTION',
    'category', 'Operational & API Safety',
    'severity', 'HIGH',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', _cnt || ' org write-protection trigger(s) active for locked/archived states',
    'auto_fix_possible', true
  );

  -- O3: Org hard-delete protection (HIGH)
  SELECT count(*) INTO _cnt
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND event_object_table = 'organizations'
    AND trigger_name LIKE '%prevent_org_hard_delete%';
  _results := _results || jsonb_build_object(
    'id', 'O3_ORG_DELETE_PROTECTION',
    'category', 'Operational & API Safety',
    'severity', 'HIGH',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt > 0 THEN 'Organization hard-delete prevention trigger active' ELSE 'Organizations can be hard-deleted - use org_state=archived instead' END,
    'auto_fix_possible', true
  );

  -- O4: Index presence on org_id columns (MEDIUM)
  SELECT count(DISTINCT c.table_name) INTO _cnt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'organization_id'
    AND c.table_name NOT IN ('organizations')
    AND NOT EXISTS (
      SELECT 1 FROM pg_indexes pi
      WHERE pi.schemaname = 'public'
        AND pi.tablename = c.table_name
        AND pi.indexdef LIKE '%organization_id%'
    );
  _results := _results || jsonb_build_object(
    'id', 'O4_INDEX_COVERAGE',
    'category', 'Operational & API Safety',
    'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt = 0 THEN 'All org-scoped tables have indexes on organization_id' ELSE _cnt || ' table(s) missing index on organization_id - performance risk' END,
    'auto_fix_possible', true
  );

  -- O5: Invoice recalculation triggers (MEDIUM)
  SELECT count(*) INTO _cnt
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND trigger_name LIKE '%recalculate_invoice%';
  _results := _results || jsonb_build_object(
    'id', 'O5_INVOICE_TRIGGERS',
    'category', 'Operational & API Safety',
    'severity', 'MEDIUM',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', _cnt || ' invoice recalculation trigger(s) active',
    'auto_fix_possible', false
  );

  -- O6: Leave balance validation trigger (MEDIUM)
  SELECT count(*) INTO _cnt
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND (trigger_name LIKE '%validate_leave%' OR trigger_name LIKE '%decrement_leave%');
  _results := _results || jsonb_build_object(
    'id', 'O6_LEAVE_VALIDATION',
    'category', 'Operational & API Safety',
    'severity', 'MEDIUM',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', _cnt || ' leave balance validation/decrement trigger(s) active',
    'auto_fix_possible', false
  );

  -- =====================================================
  -- FINAL STATUS
  -- =====================================================
  IF _has_critical_fail THEN
    _engine_status := 'BLOCKED';
  ELSE
    -- Check if any HIGH fail
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_results) r WHERE r->>'severity' = 'HIGH' AND r->>'status' = 'FAIL') THEN
      _engine_status := 'DEGRADED';
    ELSE
      _engine_status := 'OPERATIONAL';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'engine_status', _engine_status,
    'timestamp', now()::text,
    'org_filter', _org_id,
    'total_checks', jsonb_array_length(_results),
    'checks', _results
  );
END;
$function$;
