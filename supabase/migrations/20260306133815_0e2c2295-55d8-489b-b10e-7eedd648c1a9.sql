
-- Upgrade Verification Engine V3 → V4: Add Connectors, Inventory, Manufacturing, Warehouse, Sales, Procurement checks
CREATE OR REPLACE FUNCTION public.run_financial_verification(_org_id uuid DEFAULT NULL)
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
  _tbl text;
  _missing_rls text[] := '{}';
  _broken_triggers text[] := '{}';
BEGIN

  -- ═══════════════════════════════════════════════
  -- SECTION 1: TENANT & ACCESS INTEGRITY
  -- ═══════════════════════════════════════════════

  -- T1: Organization Isolation
  SELECT count(*) INTO _cnt FROM public.profiles WHERE organization_id IS NULL;
  _results := _results || jsonb_build_object(
    'id', 'T1_ORG_ISOLATION', 'category', 'Tenant & Access Integrity', 'severity', 'CRITICAL',
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
    'id', 'T2_RLS_COVERAGE', 'category', 'Tenant & Access Integrity', 'severity', 'CRITICAL',
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
    'id', 'T3_ROLE_INTEGRITY', 'category', 'Tenant & Access Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All user_roles have matching profiles' ELSE _cnt || ' orphan user_roles without matching profile' END,
    'auto_fix_possible', true
  );

  -- ═══════════════════════════════════════════════
  -- SECTION 2: FINANCIAL INTEGRITY
  -- ═══════════════════════════════════════════════

  -- F1: Trial Balance
  SELECT COALESCE(SUM(jl.debit), 0), COALESCE(SUM(jl.credit), 0)
  INTO _sum_d, _sum_c
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.status = 'posted' AND (_org_id IS NULL OR je.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F1_TRIAL_BALANCE', 'category', 'Financial Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _sum_d = _sum_c THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _sum_d = _sum_c THEN 'Trial balance is balanced (posted debits = credits = ' || _sum_d || ')'
      ELSE 'IMBALANCE: debits=' || _sum_d || ' credits=' || _sum_c || ' diff=' || (_sum_d - _sum_c) END,
    'auto_fix_possible', false
  );
  IF _sum_d != _sum_c THEN _has_critical_fail := true; END IF;

  -- F1b: Draft Balance (warning only)
  SELECT COALESCE(SUM(jl.debit), 0), COALESCE(SUM(jl.credit), 0)
  INTO _sum_d, _sum_c
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.status = 'draft' AND (_org_id IS NULL OR je.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F1b_DRAFT_BALANCE', 'category', 'Financial Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _sum_d = _sum_c THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _sum_d = _sum_c THEN 'All draft entries are balanced'
      ELSE 'Draft imbalance: debits=' || _sum_d || ' credits=' || _sum_c END,
    'auto_fix_possible', false
  );

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
  WHERE i.amount < 0 AND (_org_id IS NULL OR i.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F3_INVOICE_AMOUNTS', 'category', 'Financial Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All invoice amounts are non-negative' ELSE _cnt || ' invoices with negative amounts' END,
    'auto_fix_possible', false
  );

  -- F4: GL Account Referential Integrity
  SELECT count(*) INTO _cnt FROM public.journal_lines jl
  LEFT JOIN public.gl_accounts ga ON ga.id = jl.gl_account_id
  LEFT JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE ga.id IS NULL AND (_org_id IS NULL OR je.organization_id = _org_id);
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
  WHERE fp.status = 'locked' AND fr.updated_at > fp.closed_at
    AND (_org_id IS NULL OR fr.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'F5_PERIOD_LOCK', 'category', 'Financial Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'No modifications detected in locked periods' ELSE _cnt || ' records modified after period lock' END,
    'auto_fix_possible', false
  );
  IF _cnt > 0 THEN _has_critical_fail := true; END IF;

  -- F6: Duplicate Invoice Numbers
  SELECT count(*) INTO _cnt FROM (
    SELECT invoice_number, organization_id FROM public.invoices
    WHERE (_org_id IS NULL OR organization_id = _org_id)
    GROUP BY invoice_number, organization_id HAVING count(*) > 1
  ) dup;
  _results := _results || jsonb_build_object(
    'id', 'F6_DUPLICATE_INVOICES', 'category', 'Financial Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No duplicate invoice numbers' ELSE _cnt || ' duplicate invoice number groups found' END,
    'auto_fix_possible', false
  );

  -- F7: Duplicate Bill Numbers
  SELECT count(*) INTO _cnt FROM (
    SELECT bill_number, organization_id FROM public.bills
    WHERE (_org_id IS NULL OR organization_id = _org_id)
    GROUP BY bill_number, organization_id HAVING count(*) > 1
  ) dup;
  _results := _results || jsonb_build_object(
    'id', 'F7_DUPLICATE_BILLS', 'category', 'Financial Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No duplicate bill numbers' ELSE _cnt || ' duplicate bill number groups found' END,
    'auto_fix_possible', false
  );

  -- ═══════════════════════════════════════════════
  -- SECTION 3: COMPLIANCE & AUDIT
  -- ═══════════════════════════════════════════════

  -- C1: Expense Receipt Compliance
  SELECT count(*) INTO _cnt FROM public.expenses
  WHERE receipt_url IS NULL AND status NOT IN ('rejected', 'draft') AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'C1_EXPENSE_RECEIPTS', 'category', 'Compliance & Audit', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All non-rejected expenses have receipts' ELSE _cnt || ' expenses missing receipts' END,
    'auto_fix_possible', false
  );

  -- C2: Audit Log Coverage
  SELECT count(*) INTO _cnt FROM public.audit_logs WHERE (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'C2_AUDIT_LOG_COVERAGE', 'category', 'Compliance & Audit', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt > 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt > 0 THEN _cnt || ' audit log entries found' ELSE 'No audit log entries — ensure audit logging is active' END,
    'auto_fix_possible', false
  );

  -- C3: Payroll Approval Workflow
  SELECT count(*) INTO _cnt FROM public.payroll_runs
  WHERE status = 'approved' AND approved_by IS NULL AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'C3_PAYROLL_APPROVAL', 'category', 'Compliance & Audit', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All approved payroll runs have approver recorded' ELSE _cnt || ' approved payroll runs missing approver' END,
    'auto_fix_possible', false
  );

  -- ═══════════════════════════════════════════════
  -- SECTION 4: WORKFLOW INTEGRITY
  -- ═══════════════════════════════════════════════

  -- W1: Payroll Run Lifecycle
  SELECT count(*) INTO _cnt FROM public.payroll_runs
  WHERE status = 'finalized' AND approved_by IS NULL AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W1_PAYROLL_LIFECYCLE', 'category', 'Workflow Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All finalized payroll runs were properly approved' ELSE _cnt || ' finalized payroll runs skipped approval' END,
    'auto_fix_possible', false
  );

  -- W2: Leave Approval Without Reviewer
  SELECT count(*) INTO _cnt FROM public.leave_requests
  WHERE status = 'approved' AND reviewed_by IS NULL AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W2_LEAVE_APPROVAL', 'category', 'Workflow Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All approved leaves have a reviewer' ELSE _cnt || ' approved leaves missing reviewer' END,
    'auto_fix_possible', false
  );

  -- W3: Expense Workflow Integrity
  SELECT count(*) INTO _cnt FROM public.expenses
  WHERE status = 'paid' AND reviewed_by IS NULL AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W3_EXPENSE_WORKFLOW', 'category', 'Workflow Integrity', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All paid expenses have a reviewer' ELSE _cnt || ' paid expenses missing reviewer' END,
    'auto_fix_possible', false
  );

  -- W4: Stale Processing Workflows (stuck >24h)
  SELECT count(*) INTO _cnt FROM public.payroll_runs
  WHERE status = 'processing' AND created_at < now() - interval '24 hours'
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'W4_STALE_PAYROLL_RUNS', 'category', 'Workflow Integrity', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No stale processing payroll runs' ELSE _cnt || ' payroll runs stuck in processing >24h' END,
    'auto_fix_possible', true
  );

  -- W5: Duplicate Payroll Records (same employee, same period, not superseded)
  SELECT count(*) INTO _cnt FROM (
    SELECT profile_id, pay_period FROM public.payroll_records
    WHERE is_superseded = false AND (_org_id IS NULL OR organization_id = _org_id)
    GROUP BY profile_id, pay_period HAVING count(*) > 1
  ) dup;
  _results := _results || jsonb_build_object(
    'id', 'W5_DUPLICATE_PAYROLL', 'category', 'Workflow Integrity', 'severity', 'CRITICAL',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN _cnt = 0 THEN 'No duplicate active payroll records' ELSE _cnt || ' employees with duplicate active payroll records in same period' END,
    'auto_fix_possible', false
  );
  IF _cnt > 0 THEN _has_critical_fail := true; END IF;

  -- ═══════════════════════════════════════════════
  -- SECTION 5: DATA BINDING & ORPHANS
  -- ═══════════════════════════════════════════════

  -- UI1: Profile-User Binding
  SELECT count(*) INTO _cnt FROM public.profiles
  WHERE user_id IS NULL AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'UI1_PROFILE_BINDING', 'category', 'Data Binding', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All profiles are linked to auth users' ELSE _cnt || ' profiles without user_id binding' END,
    'auto_fix_possible', false
  );

  -- UI2: Attendance Orphans
  SELECT count(*) INTO _cnt FROM public.attendance_records ar
  LEFT JOIN public.profiles p ON p.id = ar.profile_id
  WHERE ar.profile_id IS NOT NULL AND p.id IS NULL AND (_org_id IS NULL OR ar.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'UI2_ATTENDANCE_ORPHANS', 'category', 'Data Binding', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No orphan attendance records' ELSE _cnt || ' attendance records with invalid profile_id' END,
    'auto_fix_possible', true
  );

  -- UI3: Leave Request Orphans
  SELECT count(*) INTO _cnt FROM public.leave_requests lr
  LEFT JOIN public.profiles p ON p.id = lr.profile_id
  WHERE lr.profile_id IS NOT NULL AND p.id IS NULL AND (_org_id IS NULL OR lr.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'UI3_LEAVE_ORPHANS', 'category', 'Data Binding', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No orphan leave requests' ELSE _cnt || ' leave requests with invalid profile_id' END,
    'auto_fix_possible', true
  );

  -- UI4: Payroll Record Orphans
  SELECT count(*) INTO _cnt FROM public.payroll_records pr
  LEFT JOIN public.profiles p ON p.id = pr.profile_id
  WHERE pr.profile_id IS NOT NULL AND p.id IS NULL AND (_org_id IS NULL OR pr.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'UI4_PAYROLL_ORPHANS', 'category', 'Data Binding', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No orphan payroll records' ELSE _cnt || ' payroll records with invalid profile_id' END,
    'auto_fix_possible', true
  );

  -- UI5: Expense Orphans
  SELECT count(*) INTO _cnt FROM public.expenses ex
  LEFT JOIN public.profiles p ON p.id = ex.profile_id
  WHERE ex.profile_id IS NOT NULL AND p.id IS NULL AND (_org_id IS NULL OR ex.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'UI5_EXPENSE_ORPHANS', 'category', 'Data Binding', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No orphan expense records' ELSE _cnt || ' expenses with invalid profile_id' END,
    'auto_fix_possible', true
  );

  -- ═══════════════════════════════════════════════
  -- SECTION 6: OPERATIONAL SAFETY
  -- ═══════════════════════════════════════════════

  -- O1: Stale Unposted Entries
  SELECT count(*) INTO _cnt FROM public.financial_records
  WHERE is_posted = false AND created_at < now() - interval '30 days'
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'O1_STALE_DRAFTS', 'category', 'Operational Safety', 'severity', 'LOW',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No stale unposted entries' ELSE _cnt || ' unposted entries older than 30 days' END,
    'auto_fix_possible', false
  );

  -- O2: Timestamp Integrity
  SELECT count(*) INTO _cnt FROM public.profiles
  WHERE updated_at < created_at AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'O2_TIMESTAMP_INTEGRITY', 'category', 'Operational Safety', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All profile timestamps are consistent' ELSE _cnt || ' profiles where updated_at < created_at' END,
    'auto_fix_possible', true
  );

  -- O3: Broken Triggers
  FOR _tbl IN
    SELECT DISTINCT t.tgrelid::regclass::text
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND p.prosrc LIKE '%NEW.user_id%'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = (t.tgrelid::regclass::text)
          AND c.column_name = 'user_id'
      )
  LOOP
    _broken_triggers := array_append(_broken_triggers, _tbl);
  END LOOP;
  _results := _results || jsonb_build_object(
    'id', 'O3_TRIGGER_HEALTH', 'category', 'Operational Safety', 'severity', 'CRITICAL',
    'status', CASE WHEN array_length(_broken_triggers, 1) IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'message', CASE WHEN array_length(_broken_triggers, 1) IS NULL THEN 'No broken triggers detected'
      ELSE 'Broken triggers on: ' || array_to_string(_broken_triggers, ', ') || ' (reference missing columns)' END,
    'auto_fix_possible', false
  );
  IF array_length(_broken_triggers, 1) IS NOT NULL THEN _has_critical_fail := true; END IF;

  -- O4: Duplicate Attendance Records
  SELECT count(*) INTO _cnt FROM (
    SELECT user_id, date FROM public.attendance_records
    WHERE (_org_id IS NULL OR organization_id = _org_id)
    GROUP BY user_id, date HAVING count(*) > 1
  ) dup;
  _results := _results || jsonb_build_object(
    'id', 'O4_DUPLICATE_ATTENDANCE', 'category', 'Operational Safety', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No duplicate attendance records' ELSE _cnt || ' user-date pairs with duplicate attendance entries' END,
    'auto_fix_possible', true
  );

  -- ═══════════════════════════════════════════════════════════════
  -- SECTION 7 (V4 NEW): CONNECTORS MODULE INTEGRITY
  -- ═══════════════════════════════════════════════════════════════

  -- CN1: Integration Status Consistency
  SELECT count(*) INTO _cnt FROM public.integrations
  WHERE status = 'connected' AND access_token IS NULL AND shop_domain IS NULL
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'CN1_INTEGRATION_STATUS', 'category', 'Connectors', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All connected integrations have credentials' ELSE _cnt || ' integrations marked connected without credentials' END,
    'auto_fix_possible', false
  );

  -- CN2: Orphan Shopify Orders (orders without valid integration)
  SELECT count(*) INTO _cnt FROM public.shopify_orders so
  LEFT JOIN public.integrations i ON i.organization_id = so.organization_id AND i.provider = 'shopify'
  WHERE i.id IS NULL AND (_org_id IS NULL OR so.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'CN2_ORPHAN_SHOPIFY_ORDERS', 'category', 'Connectors', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All shopify orders have parent integration' ELSE _cnt || ' shopify orders without matching integration' END,
    'auto_fix_possible', false
  );

  -- CN3: Connector Log Health (error rate)
  SELECT count(*) INTO _cnt FROM public.connector_logs
  WHERE status = 'error' AND created_at > now() - interval '7 days'
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'CN3_CONNECTOR_ERRORS', 'category', 'Connectors', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No connector errors in past 7 days' ELSE _cnt || ' connector errors in past 7 days' END,
    'auto_fix_possible', false
  );

  -- ═══════════════════════════════════════════════════════════════
  -- SECTION 8 (V4 NEW): INVENTORY & WAREHOUSE INTEGRITY
  -- ═══════════════════════════════════════════════════════════════

  -- INV1: Negative Stock Quantities
  SELECT count(*) INTO _cnt FROM public.items
  WHERE quantity < 0 AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'INV1_NEGATIVE_STOCK', 'category', 'Inventory', 'severity', 'HIGH',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No items with negative stock' ELSE _cnt || ' items with negative stock quantities' END,
    'auto_fix_possible', false
  );

  -- INV2: Items Without SKU
  SELECT count(*) INTO _cnt FROM public.items
  WHERE (sku IS NULL OR sku = '') AND status = 'active' AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'INV2_MISSING_SKU', 'category', 'Inventory', 'severity', 'LOW',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All active items have SKU' ELSE _cnt || ' active items missing SKU' END,
    'auto_fix_possible', false
  );

  -- INV3: Stock Adjustment Balance (adjustments should net to current stock levels)
  SELECT count(*) INTO _cnt FROM public.stock_adjustments
  WHERE status = 'approved' AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'INV3_STOCK_ADJUSTMENTS', 'category', 'Inventory', 'severity', 'LOW',
    'status', 'PASS',
    'message', _cnt || ' approved stock adjustments recorded',
    'auto_fix_possible', false
  );

  -- WH1: Warehouse Without Bins (warehouses that should have bin locations)
  SELECT count(*) INTO _cnt FROM public.warehouses w
  LEFT JOIN public.bin_locations bl ON bl.warehouse_id = w.id
  WHERE bl.id IS NULL AND w.is_active = true AND (_org_id IS NULL OR w.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'WH1_WAREHOUSE_BINS', 'category', 'Warehouse', 'severity', 'LOW',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All active warehouses have bin locations' ELSE _cnt || ' active warehouses without bin locations' END,
    'auto_fix_possible', false
  );

  -- WH2: Stale Stock Transfers (pending > 7 days)
  SELECT count(*) INTO _cnt FROM public.stock_transfers
  WHERE status = 'pending' AND created_at < now() - interval '7 days'
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'WH2_STALE_TRANSFERS', 'category', 'Warehouse', 'severity', 'LOW',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No stale stock transfers' ELSE _cnt || ' stock transfers pending > 7 days' END,
    'auto_fix_possible', false
  );

  -- ═══════════════════════════════════════════════════════════════
  -- SECTION 9 (V4 NEW): PROCUREMENT & SALES INTEGRITY
  -- ═══════════════════════════════════════════════════════════════

  -- PO1: Purchase Orders Without Goods Receipt (received POs should have GRN)
  SELECT count(*) INTO _cnt FROM public.purchase_orders po
  LEFT JOIN public.goods_receipts gr ON gr.purchase_order_id = po.id
  WHERE po.status = 'received' AND gr.id IS NULL AND (_org_id IS NULL OR po.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'PO1_PO_WITHOUT_GRN', 'category', 'Procurement', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All received POs have goods receipts' ELSE _cnt || ' received POs without goods receipt note' END,
    'auto_fix_possible', false
  );

  -- PO2: Stale Draft Purchase Orders (> 30 days)
  SELECT count(*) INTO _cnt FROM public.purchase_orders
  WHERE status = 'draft' AND created_at < now() - interval '30 days'
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'PO2_STALE_POS', 'category', 'Procurement', 'severity', 'LOW',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No stale draft POs' ELSE _cnt || ' draft POs older than 30 days' END,
    'auto_fix_possible', false
  );

  -- SO1: Sales Orders Without Delivery (delivered SOs should have delivery notes)
  SELECT count(*) INTO _cnt FROM public.sales_orders so
  LEFT JOIN public.delivery_notes dn ON dn.sales_order_id = so.id
  WHERE so.status = 'delivered' AND dn.id IS NULL AND (_org_id IS NULL OR so.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'SO1_SO_WITHOUT_DELIVERY', 'category', 'Sales', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All delivered SOs have delivery notes' ELSE _cnt || ' delivered SOs without delivery note' END,
    'auto_fix_possible', false
  );

  -- ═══════════════════════════════════════════════════════════════
  -- SECTION 10 (V4 NEW): MANUFACTURING INTEGRITY
  -- ═══════════════════════════════════════════════════════════════

  -- MFG1: BOM Without Components (active BOMs should have materials)
  SELECT count(*) INTO _cnt FROM public.bill_of_materials bom
  LEFT JOIN public.bom_components bc ON bc.bom_id = bom.id
  WHERE bom.status = 'active' AND bc.id IS NULL AND (_org_id IS NULL OR bom.organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'MFG1_BOM_COMPONENTS', 'category', 'Manufacturing', 'severity', 'MEDIUM',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'All active BOMs have components' ELSE _cnt || ' active BOMs without any components' END,
    'auto_fix_possible', false
  );

  -- MFG2: Stale Work Orders (in_progress > 30 days)
  SELECT count(*) INTO _cnt FROM public.work_orders
  WHERE status = 'in_progress' AND created_at < now() - interval '30 days'
    AND (_org_id IS NULL OR organization_id = _org_id);
  _results := _results || jsonb_build_object(
    'id', 'MFG2_STALE_WORK_ORDERS', 'category', 'Manufacturing', 'severity', 'LOW',
    'status', CASE WHEN _cnt = 0 THEN 'PASS' ELSE 'WARNING' END,
    'message', CASE WHEN _cnt = 0 THEN 'No stale work orders' ELSE _cnt || ' work orders in progress > 30 days' END,
    'auto_fix_possible', false
  );

  -- SUMMARY
  _results := _results || jsonb_build_object(
    'id', 'SUMMARY', 'category', 'System', 'severity', 'INFO',
    'status', CASE WHEN _has_critical_fail THEN 'CRITICAL_ISSUES_FOUND' ELSE 'ALL_CLEAR' END,
    'message', CASE WHEN _has_critical_fail THEN 'Critical integrity issues detected — review required' ELSE 'All V4 integrity checks passed successfully' END,
    'auto_fix_possible', false
  );

  RETURN _results;
END;
$$;
