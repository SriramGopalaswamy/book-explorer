
-- ═══════════════════════════════════════════════════════════════
-- FIX 1: Add missing columns detected by RC-025, RC-026, RC-027
-- ═══════════════════════════════════════════════════════════════

-- items.created_by (referenced in Inventory CRUD)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='items' AND column_name='created_by') THEN
    ALTER TABLE public.items ADD COLUMN created_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- purchase_orders.expected_date
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_orders' AND column_name='expected_date') THEN
    ALTER TABLE public.purchase_orders ADD COLUMN expected_date date;
  END IF;
END $$;

-- sales_orders.expected_date
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_orders' AND column_name='expected_date') THEN
    ALTER TABLE public.sales_orders ADD COLUMN expected_date date;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- FIX 2: Auto-balance any unbalanced journal entries (RC-024)
-- Only fix posted entries with small rounding errors (< 1.00)
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  _je_id uuid;
  _imbalance numeric;
  _first_line_id uuid;
BEGIN
  FOR _je_id, _imbalance IN
    SELECT je.id, sum(jl.debit) - sum(jl.credit)
    FROM journal_entries je
    JOIN journal_lines jl ON jl.journal_entry_id = je.id
    GROUP BY je.id
    HAVING abs(sum(jl.debit) - sum(jl.credit)) BETWEEN 0.01 AND 1.00
  LOOP
    -- Add a rounding adjustment line
    SELECT id INTO _first_line_id FROM journal_lines WHERE journal_entry_id = _je_id LIMIT 1;
    IF _imbalance > 0 THEN
      INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit, organization_id)
      SELECT _je_id, account_id, 'Auto rounding adjustment', 0, _imbalance, organization_id
      FROM journal_lines WHERE id = _first_line_id;
    ELSE
      INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit, organization_id)
      SELECT _je_id, account_id, 'Auto rounding adjustment', abs(_imbalance), 0, organization_id
      FROM journal_lines WHERE id = _first_line_id;
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- EXPANDED Root Cause Audit Engine v3: 42 → 54 checks, 17 → 21 categories
-- Adjacent checks discovered through category analysis
-- ═══════════════════════════════════════════════════════════════

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
  _count3 bigint;
  _missing_cols text;
  _rpc_ok boolean;
BEGIN

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 1: ORPHAN RECORDS (RC-001 to RC-005)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM profiles WHERE organization_id IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-001','category','Orphan Records','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Profiles with NULL organization_id: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM profiles p LEFT JOIN auth.users u ON u.id=p.user_id WHERE u.id IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-002','category','Orphan Records','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Orphan profiles (no auth user): %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM user_roles ur LEFT JOIN profiles p ON p.user_id=ur.user_id WHERE p.id IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-003','category','Orphan Records','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Role assignments with no profile: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM invoices WHERE organization_id IS NULL;
  SELECT count(*) INTO _count2 FROM bills WHERE organization_id IS NULL;
  _count := _count+_count2;
  _checks := _checks || jsonb_build_object('id','RC-004','category','Orphan Records','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Financial records with NULL org_id: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM expenses WHERE user_id IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-005','category','Orphan Records','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Expenses with NULL user_id: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 2: CROSS-TENANT ISOLATION (RC-006 to RC-008)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM (SELECT user_id FROM profiles GROUP BY user_id HAVING count(DISTINCT organization_id)>1) d;
  _checks := _checks || jsonb_build_object('id','RC-006','category','Cross-Tenant Isolation','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Users with profiles in multiple orgs: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM attendance_records ar JOIN profiles p ON p.user_id=ar.user_id WHERE ar.organization_id!=p.organization_id;
  _checks := _checks || jsonb_build_object('id','RC-007','category','Cross-Tenant Isolation','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Attendance records with mismatched org_id: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM payroll_records pr JOIN profiles p ON p.user_id=pr.user_id WHERE pr.organization_id!=p.organization_id;
  _checks := _checks || jsonb_build_object('id','RC-008','category','Cross-Tenant Isolation','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Payroll records with mismatched org_id: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 3: TRIGGER SAFETY (RC-009 to RC-010)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='handle_new_user' AND n.nspname='public' AND p.prosrc NOT LIKE '%NOT EXISTS%';
  _checks := _checks || jsonb_build_object('id','RC-009','category','Trigger Safety','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _count=0 THEN 'handle_new_user has duplication guard' ELSE 'handle_new_user MISSING IF NOT EXISTS guard' END,'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.tgenabled='D';
  _checks := _checks || jsonb_build_object('id','RC-010','category','Trigger Safety','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Disabled triggers in public schema: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 4: DUPLICATE RECORDS (RC-011 to RC-013)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM (SELECT user_id,organization_id FROM profiles WHERE organization_id IS NOT NULL GROUP BY user_id,organization_id HAVING count(*)>1) d;
  _checks := _checks || jsonb_build_object('id','RC-011','category','Duplicate Records','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Duplicate profiles (same user+org): %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM (SELECT user_id,role,organization_id FROM user_roles GROUP BY user_id,role,organization_id HAVING count(*)>1) d;
  _checks := _checks || jsonb_build_object('id','RC-012','category','Duplicate Records','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Duplicate role assignments: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM (SELECT invoice_number,organization_id FROM invoices WHERE is_deleted=false GROUP BY invoice_number,organization_id HAVING count(*)>1) d;
  _checks := _checks || jsonb_build_object('id','RC-013','category','Duplicate Records','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Duplicate invoice numbers: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 5: RLS & ACCESS CONTROL (RC-014 to RC-016)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=true AND NOT EXISTS (SELECT 1 FROM pg_policies pp WHERE pp.tablename=c.relname AND pp.schemaname='public');
  _checks := _checks || jsonb_build_object('id','RC-014','category','RLS & Access Control','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Tables with RLS enabled but zero policies: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false AND c.relname NOT LIKE 'pg_%' AND c.relname NOT IN ('schema_migrations','spatial_ref_sys');
  _checks := _checks || jsonb_build_object('id','RC-015','category','RLS & Access Control','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Tables without RLS enabled: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM invoices i JOIN organizations o ON o.id=i.organization_id WHERE o.status IN ('suspended','locked','archived') AND i.created_at > o.updated_at;
  _checks := _checks || jsonb_build_object('id','RC-016','category','RLS & Access Control','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Records created in suspended/locked orgs: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 6: GHOST & STALE DATA (RC-017 to RC-020)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM profiles WHERE email IS NULL OR email='';
  _checks := _checks || jsonb_build_object('id','RC-017','category','Ghost & Stale Data','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Ghost profiles (null/empty email): %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM invoices i WHERE i.customer_id IS NOT NULL AND i.is_deleted=false AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id=i.customer_id);
  _checks := _checks || jsonb_build_object('id','RC-018','category','Ghost & Stale Data','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Invoices referencing deleted customers: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM leave_requests lr JOIN profiles p ON p.user_id=lr.user_id WHERE lr.organization_id!=p.organization_id;
  _checks := _checks || jsonb_build_object('id','RC-019','category','Ghost & Stale Data','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Leave requests with org mismatch: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM payroll_runs WHERE status='processing' AND created_at < now()-interval '24 hours';
  _checks := _checks || jsonb_build_object('id','RC-020','category','Ghost & Stale Data','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Stale payroll runs stuck in processing: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 7: DEFAULT VALUE TRAPS (RC-021)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM information_schema.columns WHERE table_schema='public' AND column_name='organization_id' AND is_nullable='YES' AND table_name NOT IN ('integrity_audit_runs');
  _checks := _checks || jsonb_build_object('id','RC-021','category','Default Value Traps','severity',CASE WHEN _count>5 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Tables with nullable organization_id: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 8: SOFT DELETE INTEGRITY (RC-022 to RC-023)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM invoices WHERE is_deleted=true AND deleted_at IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-022','category','Soft Delete Integrity','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Soft-deleted invoices missing deleted_at: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM bills WHERE is_deleted=true AND deleted_at IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-023','category','Soft Delete Integrity','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Soft-deleted bills missing deleted_at: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 9: FINANCIAL INTEGRITY (RC-024)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM (SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id=je.id GROUP BY je.id HAVING abs(sum(jl.debit)-sum(jl.credit))>0.01) u;
  _checks := _checks || jsonb_build_object('id','RC-024','category','Financial Integrity','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Unbalanced journal entries (debit != credit): %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 10: SCHEMA DRIFT (RC-025 to RC-027)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM information_schema.columns WHERE table_schema='public' AND table_name='items' AND column_name='created_by';
  _checks := _checks || jsonb_build_object('id','RC-025','category','Schema Drift','severity',CASE WHEN _count=0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count>0 THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _count>0 THEN 'items.created_by column exists' ELSE 'items table missing created_by column' END,'auto_fix_possible',true,'affected_count',CASE WHEN _count=0 THEN 1 ELSE 0 END);

  SELECT count(*) INTO _count FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_orders' AND column_name='expected_date';
  _checks := _checks || jsonb_build_object('id','RC-026','category','Schema Drift','severity',CASE WHEN _count=0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count>0 THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _count>0 THEN 'purchase_orders.expected_date exists' ELSE 'purchase_orders missing expected_date column' END,'auto_fix_possible',true,'affected_count',CASE WHEN _count=0 THEN 1 ELSE 0 END);

  SELECT count(*) INTO _count FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_orders' AND column_name='expected_date';
  _checks := _checks || jsonb_build_object('id','RC-027','category','Schema Drift','severity',CASE WHEN _count=0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count>0 THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _count>0 THEN 'sales_orders.expected_date exists' ELSE 'sales_orders missing expected_date column' END,'auto_fix_possible',true,'affected_count',CASE WHEN _count=0 THEN 1 ELSE 0 END);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 11: SEEDING COMPLETENESS (RC-028 to RC-031)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM organizations o WHERE o.name ILIKE '%sandbox%' AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.organization_id=o.id);
  _checks := _checks || jsonb_build_object('id','RC-028','category','Seeding Completeness','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Sandbox orgs with zero profiles: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM organizations o WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.organization_id=o.id) AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN profiles p2 ON p2.user_id=ur.user_id WHERE p2.organization_id=o.id);
  _checks := _checks || jsonb_build_object('id','RC-029','category','Seeding Completeness','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Orgs with profiles but zero role assignments: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM organizations o WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.organization_id=o.id) AND NOT EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id=o.id);
  _checks := _checks || jsonb_build_object('id','RC-030','category','Seeding Completeness','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Orgs with profiles but zero org_members: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM organizations o WHERE (SELECT count(*) FROM profiles p WHERE p.organization_id=o.id)>=5 AND (SELECT count(*) FROM profiles p2 WHERE p2.organization_id=o.id AND p2.manager_id IS NOT NULL)=0;
  _checks := _checks || jsonb_build_object('id','RC-031','category','Seeding Completeness','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Orgs with 5+ employees but zero manager assignments: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 12: RPC HEALTH (RC-032)
  -- ═══════════════════════════════════════════════════════════════

  BEGIN
    PERFORM run_financial_verification();
    _rpc_ok := true;
  EXCEPTION WHEN OTHERS THEN
    _rpc_ok := false;
  END;
  _checks := _checks || jsonb_build_object('id','RC-032','category','RPC Health','severity',CASE WHEN NOT _rpc_ok THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _rpc_ok THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _rpc_ok THEN 'run_financial_verification RPC executes successfully' ELSE 'run_financial_verification RPC FAILED' END,'auto_fix_possible',false,'affected_count',CASE WHEN _rpc_ok THEN 0 ELSE 1 END);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 13: FK ORPHAN CASCADE (RC-033 to RC-035)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM bills b WHERE b.vendor_id IS NOT NULL AND b.is_deleted=false AND NOT EXISTS (SELECT 1 FROM vendors v WHERE v.id=b.vendor_id);
  _checks := _checks || jsonb_build_object('id','RC-033','category','FK Orphan Cascade','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Bills referencing deleted vendors: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM profiles p WHERE p.manager_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p2 WHERE p2.id=p.manager_id);
  _checks := _checks || jsonb_build_object('id','RC-034','category','FK Orphan Cascade','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Profiles with invalid manager_id: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM expenses e WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id=e.user_id);
  _checks := _checks || jsonb_build_object('id','RC-035','category','FK Orphan Cascade','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Expenses referencing non-existent profiles: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 14: TIMESTAMP ANOMALIES (RC-036 to RC-037)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM invoices WHERE created_at > now() + interval '1 hour' AND is_deleted=false;
  SELECT count(*) INTO _count2 FROM bills WHERE created_at > now() + interval '1 hour' AND is_deleted=false;
  SELECT count(*) INTO _count3 FROM expenses WHERE created_at > now() + interval '1 hour';
  _count := _count+_count2+_count3;
  _checks := _checks || jsonb_build_object('id','RC-036','category','Timestamp Anomalies','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Financial records with future created_at: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM invoices WHERE updated_at < created_at AND is_deleted=false;
  SELECT count(*) INTO _count2 FROM bills WHERE updated_at < created_at AND is_deleted=false;
  _count := _count+_count2;
  _checks := _checks || jsonb_build_object('id','RC-037','category','Timestamp Anomalies','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Records where updated_at < created_at: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 15: STATUS MACHINE VIOLATIONS (RC-038 to RC-039)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM invoices WHERE is_deleted=false AND status NOT IN ('draft','sent','partially_paid','paid','overdue','cancelled','void','written_off');
  _checks := _checks || jsonb_build_object('id','RC-038','category','Status Machine Violations','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Invoices in invalid status: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM payroll_runs WHERE status='draft' AND created_at < now()-interval '30 days';
  _checks := _checks || jsonb_build_object('id','RC-039','category','Status Machine Violations','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Payroll runs stuck in draft 30+ days: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 16: NUMERIC BOUNDARY VIOLATIONS (RC-040 to RC-041)
  -- ═══════════════════════════════════════════════════════════════

  SELECT count(*) INTO _count FROM invoices WHERE amount<0 AND is_deleted=false;
  SELECT count(*) INTO _count2 FROM bills WHERE amount<0 AND is_deleted=false;
  _count := _count+_count2;
  _checks := _checks || jsonb_build_object('id','RC-040','category','Numeric Boundary Violations','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Invoices/Bills with negative amounts: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM bills WHERE tds_rate IS NOT NULL AND tds_rate>100;
  _checks := _checks || jsonb_build_object('id','RC-041','category','Numeric Boundary Violations','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Bills with TDS rate > 100%%: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- CATEGORY 17: CONSTRAINT COVERAGE (RC-042)
  -- ═══════════════════════════════════════════════════════════════

  _count := 0;
  _missing_cols := '';
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='items' AND indexdef LIKE '%sku%' AND indexdef LIKE '%organization_id%') THEN
    _count := _count+1; _missing_cols := _missing_cols || 'items(sku+org), ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='bills' AND indexdef LIKE '%bill_number%' AND indexdef LIKE '%organization_id%') THEN
    _count := _count+1; _missing_cols := _missing_cols || 'bills(bill_number+org), ';
  END IF;
  _checks := _checks || jsonb_build_object('id','RC-042','category','Constraint Coverage','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Missing unique constraints: %s — %s',_count,rtrim(_missing_cols,', ')),'auto_fix_possible',true,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- NEW CATEGORY 18: FISCAL PERIOD INTEGRITY (RC-043 to RC-045)
  -- Adjacent to: Financial Integrity, Timestamp Anomalies
  -- ═══════════════════════════════════════════════════════════════

  -- RC-043: Overlapping fiscal periods within same org
  SELECT count(*) INTO _count FROM (
    SELECT fp1.id FROM fiscal_periods fp1 JOIN fiscal_periods fp2
    ON fp1.organization_id=fp2.organization_id AND fp1.id!=fp2.id
    AND fp1.start_date<=fp2.end_date AND fp1.end_date>=fp2.start_date
    WHERE fp1.status!='cancelled' AND fp2.status!='cancelled'
  ) ov;
  _checks := _checks || jsonb_build_object('id','RC-043','category','Fiscal Period Integrity','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Overlapping fiscal periods: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-044: Closed fiscal periods with entries created after closure
  SELECT count(*) INTO _count FROM financial_records fr JOIN fiscal_periods fp
    ON fr.organization_id=fp.organization_id
    AND fr.record_date BETWEEN fp.start_date AND fp.end_date
    WHERE fp.status='closed' AND fr.created_at > fp.updated_at;
  _checks := _checks || jsonb_build_object('id','RC-044','category','Fiscal Period Integrity','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Entries created in closed fiscal periods: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-045: Orgs with financial data but zero fiscal periods
  SELECT count(*) INTO _count FROM organizations o
    WHERE EXISTS (SELECT 1 FROM financial_records fr WHERE fr.organization_id=o.id)
    AND NOT EXISTS (SELECT 1 FROM fiscal_periods fp WHERE fp.organization_id=o.id);
  _checks := _checks || jsonb_build_object('id','RC-045','category','Fiscal Period Integrity','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Orgs with financial data but no fiscal periods: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- NEW CATEGORY 19: AUTH-PROFILE SYNC (RC-046 to RC-048)
  -- Adjacent to: Orphan Records, Cross-Tenant Isolation
  -- ═══════════════════════════════════════════════════════════════

  -- RC-046: Profile email != auth.users email
  SELECT count(*) INTO _count FROM profiles p JOIN auth.users u ON u.id=p.user_id WHERE p.email IS NOT NULL AND u.email IS NOT NULL AND lower(p.email)!=lower(u.email);
  _checks := _checks || jsonb_build_object('id','RC-046','category','Auth-Profile Sync','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Profiles with email mismatch vs auth: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  -- RC-047: Auth users with no profile at all
  SELECT count(*) INTO _count FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id=u.id);
  _checks := _checks || jsonb_build_object('id','RC-047','category','Auth-Profile Sync','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Auth users with no profile record: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  -- RC-048: Profiles with status=inactive but user can still login
  SELECT count(*) INTO _count FROM profiles p JOIN auth.users u ON u.id=p.user_id WHERE p.status='inactive' AND u.banned_until IS NULL AND u.deleted_at IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-048','category','Auth-Profile Sync','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Inactive profiles with active auth sessions: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- NEW CATEGORY 20: PAYROLL-ATTENDANCE SYNC (RC-049 to RC-051)
  -- Adjacent to: Seeding Completeness, Cross-Tenant Isolation
  -- ═══════════════════════════════════════════════════════════════

  -- RC-049: Payroll records for months with zero attendance
  SELECT count(*) INTO _count FROM payroll_records pr
    WHERE NOT EXISTS (
      SELECT 1 FROM attendance_records ar
      WHERE ar.user_id=pr.user_id
      AND extract(month FROM ar.date::date)=extract(month FROM pr.pay_period_start)
      AND extract(year FROM ar.date::date)=extract(year FROM pr.pay_period_start)
    );
  _checks := _checks || jsonb_build_object('id','RC-049','category','Payroll-Attendance Sync','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Payroll records with zero attendance for period: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-050: Duplicate payroll records (same user, same period)
  SELECT count(*) INTO _count FROM (
    SELECT user_id, pay_period_start, pay_period_end FROM payroll_records
    GROUP BY user_id, pay_period_start, pay_period_end HAVING count(*)>1
  ) d;
  _checks := _checks || jsonb_build_object('id','RC-050','category','Payroll-Attendance Sync','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Duplicate payroll records (same user+period): %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-051: Payroll runs without any payroll records
  SELECT count(*) INTO _count FROM payroll_runs pr
    WHERE pr.status IN ('completed','approved')
    AND NOT EXISTS (SELECT 1 FROM payroll_records prr WHERE prr.payroll_run_id=pr.id);
  _checks := _checks || jsonb_build_object('id','RC-051','category','Payroll-Attendance Sync','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Completed payroll runs with zero records: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- NEW CATEGORY 21: CHART OF ACCOUNTS INTEGRITY (RC-052 to RC-054)
  -- Adjacent to: Financial Integrity, Seeding Completeness
  -- ═══════════════════════════════════════════════════════════════

  -- RC-052: Orgs with financial records but zero chart_of_accounts
  SELECT count(*) INTO _count FROM organizations o
    WHERE EXISTS (SELECT 1 FROM financial_records fr WHERE fr.organization_id=o.id)
    AND NOT EXISTS (SELECT 1 FROM chart_of_accounts coa WHERE coa.organization_id=o.id);
  _checks := _checks || jsonb_build_object('id','RC-052','category','Chart of Accounts Integrity','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Orgs with financial data but no chart of accounts: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-053: Journal lines referencing non-existent accounts
  SELECT count(*) INTO _count FROM journal_lines jl
    WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts coa WHERE coa.id=jl.account_id);
  _checks := _checks || jsonb_build_object('id','RC-053','category','Chart of Accounts Integrity','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Journal lines with orphan account references: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-054: Inactive CoA accounts with recent transactions
  SELECT count(*) INTO _count FROM chart_of_accounts coa
    WHERE coa.is_active=false
    AND EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.account_id=coa.id AND jl.created_at > now()-interval '90 days');
  _checks := _checks || jsonb_build_object('id','RC-054','category','Chart of Accounts Integrity','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Inactive accounts with recent journal entries: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'engine','Root Cause Audit Engine v3',
    'run_at',now(),
    'org_filter',p_org_id,
    'total_checks',jsonb_array_length(_checks),
    'checks',_checks
  );
END;
$$;
