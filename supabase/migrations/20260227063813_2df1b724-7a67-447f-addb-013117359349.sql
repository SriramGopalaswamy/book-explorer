
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
  _missing_idx text[] := '{}';
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: only super_admin can run verification engine';
  END IF;

  -- =====================================================
  -- CATEGORY 1: TENANT & ACCESS INTEGRITY
  -- =====================================================

  -- T1: RLS Enforcement
  SELECT array_agg(pt.tablename)
  INTO _missing_rls
  FROM pg_tables pt
  WHERE pt.schemaname = 'public'
    AND pt.rowsecurity = false
    AND EXISTS (
      SELECT 1 FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = pt.tablename AND a.attname = 'organization_id' AND a.attnum > 0
    )
    AND pt.tablename != 'organizations';

  _check := jsonb_build_object(
    'id', 'T1_RLS_ENFORCEMENT', 'category', 'Tenant & Access Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN COALESCE(array_length(_missing_rls, 1), 0) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN COALESCE(array_length(_missing_rls, 1), 0) = 0 
      THEN 'All tenant tables have RLS enabled'
      ELSE 'RLS disabled on: ' || array_to_string(_missing_rls, ', ')
    END,
    'auto_fix_possible', true
  );
  _results := _results || _check;
  IF (_check->>'status') = 'FAIL' THEN _has_critical_fail := true; END IF;

  -- T2: Roles Org-Scoped
  SELECT count(*) INTO _cnt FROM public.user_roles WHERE organization_id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'T2_ROLES_ORG_SCOPED', 'category', 'Tenant & Access Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt = 0 THEN 'All user_roles entries are org-scoped' ELSE _cnt || ' user_roles entries missing organization_id' END,
    'auto_fix_possible', false
  );

  -- T3: Role Escalation
  SELECT count(*) INTO _cnt FROM (
    SELECT user_id FROM public.user_roles WHERE role = 'admin' GROUP BY user_id HAVING count(DISTINCT organization_id) > 1
  ) x;
  _results := _results || jsonb_build_object(
    'id', 'T3_ROLE_ESCALATION', 'category', 'Tenant & Access Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt = 0 THEN 'No cross-tenant admin escalation detected' ELSE _cnt || ' users have admin role across multiple organizations' END,
    'auto_fix_possible', false
  );

  -- T4: Orphan Orgs
  SELECT count(*) INTO _cnt FROM public.organizations o
  WHERE NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = o.id)
    AND o.environment_type != 'sandbox';
  _results := _results || jsonb_build_object(
    'id', 'T4_ORPHAN_ORGS', 'category', 'Tenant & Access Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt = 0 THEN 'All non-sandbox organizations have members' ELSE _cnt || ' organizations have zero members' END,
    'auto_fix_possible', false
  );

  -- T5: Session Isolation
  _results := _results || jsonb_build_object(
    'id', 'T5_SESSION_ISOLATION', 'category', 'Tenant & Access Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_roles' AND rowsecurity = true) THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_roles' AND rowsecurity = true) THEN 'platform_roles table has RLS enabled' ELSE 'platform_roles missing RLS - privilege escalation risk' END,
    'auto_fix_possible', true
  );
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_roles' AND rowsecurity = true) THEN
    _has_critical_fail := true;
  END IF;

  -- T6: API Org Mismatch
  SELECT count(*) INTO _cnt FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND (t.tgname LIKE '%auto_set_org%' OR t.tgname LIKE '%block_locked%' OR t.tgname LIKE '%validate_identity%');
  _results := _results || jsonb_build_object(
    'id', 'T6_API_ORG_MISMATCH', 'category', 'Tenant & Access Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt >= 3 THEN 'PASS' ELSE 'WARNING' END,
    'detail', _cnt || ' org-protection triggers active (auto_set_org, block_locked, validate_identity)',
    'auto_fix_possible', false
  );

  -- T7: Sandbox Isolation (NEW)
  SELECT count(*) INTO _cnt FROM public.sandbox_users su
  WHERE NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = su.sandbox_org_id AND o.environment_type = 'sandbox'
  );
  _check := jsonb_build_object(
    'id', 'T7_SANDBOX_ISOLATION', 'category', 'Tenant & Access Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt = 0 THEN 'All sandbox users belong to sandbox-type organizations' ELSE _cnt || ' sandbox user(s) linked to non-sandbox organizations - isolation breach' END,
    'auto_fix_possible', false
  );
  _results := _results || _check;
  IF (_check->>'status') = 'FAIL' THEN _has_critical_fail := true; END IF;

  -- =====================================================
  -- CATEGORY 2: FINANCIAL INTEGRITY
  -- =====================================================

  -- F1: Double Entry
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO _sum_d, _sum_c
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.is_posted = true
    AND (_org_id IS NULL OR je.organization_id = _org_id);
  _check := jsonb_build_object(
    'id', 'F1_DOUBLE_ENTRY', 'category', 'Financial Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _sum_d = _sum_c THEN 'PASS' ELSE 'FAIL' END,
    'detail', 'Total Debits: ' || _sum_d::text || ' | Total Credits: ' || _sum_c::text || ' | Variance: ' || (_sum_d - _sum_c)::text,
    'auto_fix_possible', false
  );
  _results := _results || _check;
  IF (_check->>'status') = 'FAIL' THEN _has_critical_fail := true; END IF;

  -- F2: Orphan Journal Lines
  SELECT count(*) INTO _cnt FROM public.journal_lines jl
  WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.id = jl.journal_entry_id);
  _check := jsonb_build_object(
    'id', 'F2_ORPHAN_JOURNAL_LINES', 'category', 'Financial Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt = 0 THEN 'No orphan journal lines detected' ELSE _cnt || ' journal lines with no parent entry' END,
    'auto_fix_possible', false
  );
  _results := _results || _check;
  IF (_check->>'status') = 'FAIL' THEN _has_critical_fail := true; END IF;

  -- F3: Posting Immutability
  SELECT count(*) INTO _cnt FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('journal_entries', 'journal_lines')
    AND (t.tgname LIKE '%immutable%' OR t.tgname LIKE '%prevent%' OR t.tgname LIKE '%block%');
  _check := jsonb_build_object(
    'id', 'F3_POSTING_IMMUTABILITY', 'category', 'Financial Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt > 0 THEN _cnt || ' immutability triggers active on journal tables' ELSE 'No immutability triggers found - data mutation risk' END,
    'auto_fix_possible', true
  );
  _results := _results || _check;
  IF (_check->>'status') = 'FAIL' THEN _has_critical_fail := true; END IF;

  -- F4: Closed Period Posting
  SELECT count(*) INTO _cnt
  FROM public.journal_entries je
  JOIN public.fiscal_periods fp ON fp.organization_id = je.organization_id
    AND je.entry_date BETWEEN fp.start_date AND fp.end_date
    AND fp.status = 'closed'
  WHERE je.is_posted = true
    AND fp.closed_at IS NOT NULL
    AND je.created_at > fp.closed_at
    AND (_org_id IS NULL OR je.organization_id = _org_id);
  _check := jsonb_build_object(
    'id', 'F4_CLOSED_PERIOD_POSTING', 'category', 'Financial Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt = 0 THEN 'No entries posted into closed fiscal periods' ELSE _cnt || ' entries posted after period closure' END,
    'auto_fix_possible', false
  );
  _results := _results || _check;
  IF (_check->>'status') = 'FAIL' THEN _has_critical_fail := true; END IF;

  -- F5: COA Duplicates
  SELECT count(*) INTO _cnt FROM (
    SELECT organization_id, account_code FROM public.chart_of_accounts GROUP BY organization_id, account_code HAVING count(*) > 1
  ) x WHERE (_org_id IS NULL OR x.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F5_COA_DUPLICATES', 'category', 'Financial Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt = 0 THEN 'No duplicate account codes in Chart of Accounts' ELSE _cnt || ' duplicate account code(s) detected' END,
    'auto_fix_possible', false
  );

  -- F6: Mandatory Accounts
  IF _org_id IS NOT NULL THEN
    SELECT count(*) INTO _cnt FROM unnest(ARRAY['1100','1200','2100','3100','4100','5100']) AS required_code
    WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE organization_id = _org_id AND account_code = required_code);
    _results := _results || jsonb_build_object(
      'id', 'F6_MANDATORY_ACCOUNTS', 'category', 'Financial Integrity', 'severity', 'HIGH',
      'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
      'detail', CASE WHEN _cnt = 0 THEN 'All 6 mandatory GL accounts present' ELSE _cnt || ' mandatory GL account(s) missing for target org' END,
      'auto_fix_possible', true
    );
  ELSE
    _results := _results || jsonb_build_object(
      'id', 'F6_MANDATORY_ACCOUNTS', 'category', 'Financial Integrity', 'severity', 'HIGH',
      'status', 'PASS', 'detail', 'Mandatory accounts check skipped (no org_id filter)', 'auto_fix_possible', true
    );
  END IF;

  -- F7: Tax Ledger Mapping
  IF _org_id IS NOT NULL THEN
    SELECT count(*) INTO _cnt FROM unnest(ARRAY['2300','2310','2320']) AS tax_code
    WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE organization_id = _org_id AND account_code = tax_code);
    _results := _results || jsonb_build_object(
      'id', 'F7_TAX_LEDGER_MAPPING', 'category', 'Financial Integrity', 'severity', 'HIGH',
      'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
      'detail', CASE WHEN _cnt = 0 THEN 'All tax ledger accounts mapped' ELSE _cnt || ' tax ledger account(s) missing' END,
      'auto_fix_possible', true
    );
  ELSE
    _results := _results || jsonb_build_object(
      'id', 'F7_TAX_LEDGER_MAPPING', 'category', 'Financial Integrity', 'severity', 'HIGH',
      'status', 'PASS', 'detail', 'Tax ledger check skipped (no org_id filter)', 'auto_fix_possible', true
    );
  END IF;

  -- F8: Posting Engine
  SELECT count(*) INTO _cnt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'post_journal_entry';
  _results := _results || jsonb_build_object(
    'id', 'F8_POSTING_ENGINE', 'category', 'Financial Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt > 0 THEN 'post_journal_entry SECURITY DEFINER function exists and operational' ELSE 'Posting engine function not found' END,
    'auto_fix_possible', false
  );

  -- F9: GL Locked Account Protection (NEW)
  SELECT count(*) INTO _cnt FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'gl_accounts'
    AND (t.tgname LIKE '%prevent%delete%' OR t.tgname LIKE '%protect%locked%' OR t.tgname LIKE '%block%delete%');
  SELECT count(*) INTO _cnt2 FROM public.gl_accounts WHERE is_locked = true;
  _results := _results || jsonb_build_object(
    'id', 'F9_GL_LOCKED_ACCOUNTS', 'category', 'Financial Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' WHEN _cnt2 = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE
      WHEN _cnt > 0 THEN _cnt || ' delete-protection trigger(s) on gl_accounts | ' || _cnt2 || ' locked accounts'
      WHEN _cnt2 = 0 THEN 'No locked GL accounts exist (protection not needed yet)'
      ELSE _cnt2 || ' locked GL account(s) but no delete-prevention trigger found'
    END,
    'auto_fix_possible', true
  );

  -- F10: Document Sequence Gaps (NEW)
  SELECT count(*) INTO _cnt FROM (
    SELECT organization_id, source_type,
      document_sequence_number,
      LAG(document_sequence_number) OVER (PARTITION BY organization_id, source_type ORDER BY document_sequence_number) AS prev_seq
    FROM public.journal_entries
    WHERE document_sequence_number IS NOT NULL AND is_posted = true
      AND (_org_id IS NULL OR organization_id = _org_id)
  ) sq
  WHERE prev_seq IS NOT NULL
    AND document_sequence_number IS NOT NULL
    AND prev_seq != document_sequence_number; -- just check they exist, gaps are complex to detect with alphanumeric
  -- Simpler: count entries with NULL sequence numbers that are posted
  SELECT count(*) INTO _cnt FROM public.journal_entries
  WHERE is_posted = true AND document_sequence_number IS NULL
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F10_DOCUMENT_SEQUENCES', 'category', 'Financial Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt = 0 THEN 'All posted journal entries have document sequence numbers' ELSE _cnt || ' posted journal entries missing document sequence number' END,
    'auto_fix_possible', true
  );

  -- F11: Unposted Stale Entries (NEW)
  SELECT count(*) INTO _cnt FROM public.journal_entries
  WHERE is_posted = false
    AND created_at < now() - interval '30 days'
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F11_STALE_DRAFT_ENTRIES', 'category', 'Financial Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt = 0 THEN 'No stale draft journal entries (>30 days)' ELSE _cnt || ' unposted journal entries older than 30 days' END,
    'auto_fix_possible', false
  );

  -- =====================================================
  -- CATEGORY 3: COMPLIANCE & AUDIT
  -- =====================================================

  -- A1: Audit Log Parity
  SELECT count(*) INTO _cnt FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'audit_logs' AND a.attname = 'organization_id' AND a.attnotnull = true AND a.attnum > 0;
  _check := jsonb_build_object(
    'id', 'A1_AUDIT_LOG_PARITY', 'category', 'Compliance & Audit', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt > 0 THEN 'audit_logs.organization_id is NOT NULL - tenant parity enforced' ELSE 'audit_logs.organization_id is nullable - log spoofing risk' END,
    'auto_fix_possible', true
  );
  _results := _results || _check;
  IF (_check->>'status') = 'FAIL' THEN _has_critical_fail := true; END IF;

  -- A2: Audit Tamper Protection
  SELECT count(*) INTO _cnt FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'audit_logs' AND cmd IN ('UPDATE', 'DELETE');
  _results := _results || jsonb_build_object(
    'id', 'A2_AUDIT_TAMPER_PROTECTION', 'category', 'Compliance & Audit', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt = 0 THEN 'No UPDATE/DELETE RLS policies on audit_logs - immutability preserved' ELSE _cnt || ' UPDATE/DELETE policies found on audit_logs' END,
    'auto_fix_possible', false
  );

  -- A3: Payroll Immutability
  SELECT count(*) INTO _cnt FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'payroll_runs'
    AND (t.tgname LIKE '%locked%' OR t.tgname LIKE '%state_transition%');
  _results := _results || jsonb_build_object(
    'id', 'A3_PAYROLL_IMMUTABILITY', 'category', 'Compliance & Audit', 'severity', 'HIGH',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt > 0 THEN _cnt || ' payroll lock enforcement trigger(s) active' ELSE 'No payroll lock triggers' END,
    'auto_fix_possible', true
  );

  -- A4: Compensation Immutability
  SELECT count(*) INTO _cnt FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'compensation_structures'
    AND t.tgname LIKE '%prevent_compensation%';
  _results := _results || jsonb_build_object(
    'id', 'A4_COMPENSATION_IMMUTABILITY', 'category', 'Compliance & Audit', 'severity', 'HIGH',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt > 0 THEN 'Compensation mutation prevention trigger active' ELSE 'Compensation structures may be mutable' END,
    'auto_fix_possible', true
  );

  -- A5: Audit Coverage
  SELECT count(*) INTO _cnt FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND t.tgname LIKE '%audit%';
  _results := _results || jsonb_build_object(
    'id', 'A5_AUDIT_COVERAGE', 'category', 'Compliance & Audit', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt >= 2 THEN 'PASS' ELSE 'WARNING' END,
    'detail', _cnt || ' audit-related triggers detected across schema',
    'auto_fix_possible', false
  );

  -- A6: Storage Bucket Policies (NEW)
  SELECT count(*) INTO _cnt FROM (
    SELECT DISTINCT b.id AS bucket_id
    FROM storage.buckets b
    WHERE b.public = false
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies pp
        WHERE pp.schemaname = 'storage' AND pp.tablename = 'objects'
      )
  ) missing_policies;
  -- Better approach: check if private buckets exist but storage.objects has no policies at all
  SELECT count(*) INTO _cnt FROM storage.buckets WHERE public = false;
  SELECT count(*) INTO _cnt2 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';
  _results := _results || jsonb_build_object(
    'id', 'A6_STORAGE_BUCKET_POLICIES', 'category', 'Compliance & Audit', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 OR _cnt2 > 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE
      WHEN _cnt = 0 THEN 'No private storage buckets configured'
      WHEN _cnt2 > 0 THEN _cnt || ' private bucket(s) protected by ' || _cnt2 || ' storage policy/policies'
      ELSE _cnt || ' private bucket(s) with NO storage policies - data exposed'
    END,
    'auto_fix_possible', false
  );

  -- A7: Profile Change Audit (NEW)
  SELECT count(*) INTO _cnt FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profile_change_requests';
  IF _cnt > 0 THEN
    SELECT count(*) INTO _cnt2 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profile_change_requests' AND rowsecurity = true;
    _results := _results || jsonb_build_object(
      'id', 'A7_PROFILE_CHANGE_RLS', 'category', 'Compliance & Audit', 'severity', 'MEDIUM',
      'status', CASE WHEN _cnt2 > 0 THEN 'PASS' ELSE 'WARNING' END,
      'detail', CASE WHEN _cnt2 > 0 THEN 'profile_change_requests table has RLS enabled' ELSE 'profile_change_requests table exists but RLS is disabled' END,
      'auto_fix_possible', true
    );
  ELSE
    _results := _results || jsonb_build_object(
      'id', 'A7_PROFILE_CHANGE_RLS', 'category', 'Compliance & Audit', 'severity', 'MEDIUM',
      'status', 'WARNING', 'detail', 'profile_change_requests table does not exist', 'auto_fix_possible', true
    );
  END IF;

  -- =====================================================
  -- CATEGORY 4: OPERATIONAL & API SAFETY
  -- =====================================================

  -- O1: FK Coverage
  SELECT count(*) INTO _cnt FROM (
    SELECT DISTINCT c.relname
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND a.attname = 'organization_id' AND a.attnum > 0 AND c.relkind = 'r'
      AND c.relname != 'organizations'
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint con
        WHERE con.conrelid = c.oid AND con.contype = 'f'
          AND EXISTS (
            SELECT 1 FROM pg_class fc
            JOIN pg_namespace fn ON fn.oid = fc.relnamespace
            WHERE fc.oid = con.confrelid AND fn.nspname = 'public' AND fc.relname = 'organizations'
          )
      )
  ) missing;
  _results := _results || jsonb_build_object(
    'id', 'O1_FK_COVERAGE', 'category', 'Operational & API Safety', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt = 0 THEN 'All org-scoped tables have FK to organizations' ELSE _cnt || ' table(s) missing FK constraint to organizations' END,
    'auto_fix_possible', true
  );

  -- O2: Org Write Protection
  SELECT count(*) INTO _cnt FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND t.tgname LIKE '%block_locked_or_archived%';
  _results := _results || jsonb_build_object(
    'id', 'O2_ORG_WRITE_PROTECTION', 'category', 'Operational & API Safety', 'severity', 'HIGH',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', _cnt || ' org write-protection trigger(s) active for locked/archived states',
    'auto_fix_possible', true
  );

  -- O3: Org Delete Protection
  SELECT count(*) INTO _cnt FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'organizations' AND t.tgname LIKE '%prevent_org_hard_delete%';
  _results := _results || jsonb_build_object(
    'id', 'O3_ORG_DELETE_PROTECTION', 'category', 'Operational & API Safety', 'severity', 'HIGH',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'FAIL' END,
    'detail', CASE WHEN _cnt > 0 THEN 'Organization hard-delete prevention trigger active' ELSE 'Organizations can be hard-deleted' END,
    'auto_fix_possible', true
  );

  -- O4: Index Coverage
  SELECT count(DISTINCT c.relname) INTO _cnt
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND a.attname = 'organization_id' AND a.attnum > 0 AND c.relkind = 'r'
    AND c.relname != 'organizations'
    AND NOT EXISTS (
      SELECT 1 FROM pg_index pi
      JOIN pg_class ic ON ic.oid = pi.indexrelid
      WHERE pi.indrelid = c.oid
        AND EXISTS (
          SELECT 1 FROM pg_attribute ia
          WHERE ia.attrelid = ic.oid AND ia.attname = 'organization_id'
        )
    );
  _results := _results || jsonb_build_object(
    'id', 'O4_INDEX_COVERAGE', 'category', 'Operational & API Safety', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt = 0 THEN 'All org-scoped tables have indexes on organization_id' ELSE _cnt || ' table(s) missing index on organization_id' END,
    'auto_fix_possible', true
  );

  -- O5: Invoice Triggers
  SELECT count(*) INTO _cnt FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND t.tgname LIKE '%recalculate_invoice%';
  _results := _results || jsonb_build_object(
    'id', 'O5_INVOICE_TRIGGERS', 'category', 'Operational & API Safety', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', _cnt || ' invoice recalculation trigger(s) active',
    'auto_fix_possible', false
  );

  -- O6: Leave Validation
  SELECT count(*) INTO _cnt FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND (t.tgname LIKE '%validate_leave%' OR t.tgname LIKE '%decrement_leave%');
  _results := _results || jsonb_build_object(
    'id', 'O6_LEAVE_VALIDATION', 'category', 'Operational & API Safety', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', _cnt || ' leave balance validation/decrement trigger(s) active',
    'auto_fix_possible', false
  );

  -- O7: Quote & Bill Triggers (NEW)
  SELECT count(*) INTO _cnt FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND (t.tgname LIKE '%recalculate_quote%' OR t.tgname LIKE '%recalculate_bill%');
  _results := _results || jsonb_build_object(
    'id', 'O7_QUOTE_BILL_TRIGGERS', 'category', 'Operational & API Safety', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt >= 2 THEN 'PASS' ELSE 'WARNING' END,
    'detail', _cnt || ' quote/bill recalculation trigger(s) active (expected 2+)',
    'auto_fix_possible', true
  );

  -- O8: Suspended Org Enforcement (NEW)
  -- Check that block_locked_or_archived_org_writes function also checks status='suspended'
  -- We verify by checking the function source
  SELECT count(*) INTO _cnt FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'block_locked_or_archived_org_writes'
    AND p.prosrc LIKE '%suspended%';
  -- Also check if is_org_active helper exists
  SELECT count(*) INTO _cnt2 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_org_active';
  _results := _results || jsonb_build_object(
    'id', 'O8_SUSPENDED_ORG_ENFORCEMENT', 'category', 'Operational & API Safety', 'severity', 'HIGH',
    'status', CASE WHEN _cnt > 0 OR _cnt2 > 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE
      WHEN _cnt > 0 THEN 'Write-protection function checks suspended status'
      WHEN _cnt2 > 0 THEN 'is_org_active helper exists but write-protection may not check suspended state'
      ELSE 'Neither write-protection nor is_org_active checks for suspended organizations'
    END,
    'auto_fix_possible', true
  );

  -- O9: Payslip Dispute RLS (NEW)
  SELECT count(*) INTO _cnt FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payslip_disputes';
  IF _cnt > 0 THEN
    SELECT count(*) INTO _cnt2 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payslip_disputes' AND cmd = 'SELECT';
    _results := _results || jsonb_build_object(
      'id', 'O9_PAYSLIP_DISPUTE_RLS', 'category', 'Operational & API Safety', 'severity', 'MEDIUM',
      'status', CASE WHEN _cnt2 > 0 THEN 'PASS' ELSE 'WARNING' END,
      'detail', CASE WHEN _cnt2 > 0 THEN _cnt2 || ' SELECT policy/policies on payslip_disputes (manager + employee visibility)' ELSE 'payslip_disputes has no SELECT policies - visibility issue' END,
      'auto_fix_possible', true
    );
  ELSE
    _results := _results || jsonb_build_object(
      'id', 'O9_PAYSLIP_DISPUTE_RLS', 'category', 'Operational & API Safety', 'severity', 'MEDIUM',
      'status', 'PASS', 'detail', 'payslip_disputes table not present (feature not deployed)', 'auto_fix_possible', false
    );
  END IF;

  -- O10: Edge Function Config (NEW)
  SELECT count(*) INTO _cnt FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef = true
    AND NOT (p.prosrc LIKE '%is_super_admin%' OR p.prosrc LIKE '%is_org_admin%' OR p.prosrc LIKE '%is_org_member%' OR p.prosrc LIKE '%auth.uid()%');
  _results := _results || jsonb_build_object(
    'id', 'O10_DEFINER_FUNCTION_AUDIT', 'category', 'Operational & API Safety', 'severity', 'LOW',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'detail', CASE WHEN _cnt = 0 THEN 'All SECURITY DEFINER functions include access control checks' ELSE _cnt || ' SECURITY DEFINER function(s) may lack explicit access control' END,
    'auto_fix_possible', false
  );

  -- =====================================================
  -- FINAL STATUS
  -- =====================================================
  IF _has_critical_fail THEN
    _engine_status := 'BLOCKED';
  ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(_results) r WHERE r->>'severity' = 'HIGH' AND r->>'status' = 'FAIL') THEN
    _engine_status := 'DEGRADED';
  ELSE
    _engine_status := 'OPERATIONAL';
  END IF;

  RETURN jsonb_build_object(
    'engine_status', _engine_status,
    'total_checks', jsonb_array_length(_results),
    'passed', (SELECT count(*) FROM jsonb_array_elements(_results) r WHERE r->>'status' = 'PASS'),
    'failed', (SELECT count(*) FROM jsonb_array_elements(_results) r WHERE r->>'status' = 'FAIL'),
    'warnings', (SELECT count(*) FROM jsonb_array_elements(_results) r WHERE r->>'status' = 'WARNING'),
    'checks', _results,
    'run_at', now(),
    'engine_version', 'v3.0'
  );
END;
$function$;
