
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

  -- RC-016: Org writes while suspended
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
  -- NEW CATEGORY 10: SCHEMA DRIFT (RC-025 to RC-027)
  -- ═══════════════════════════════════════════════════════════════

  -- RC-025: items.created_by column missing
  SELECT count(*) INTO _count FROM information_schema.columns WHERE table_schema='public' AND table_name='items' AND column_name='created_by';
  _checks := _checks || jsonb_build_object('id','RC-025','category','Schema Drift','severity',CASE WHEN _count=0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count>0 THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _count>0 THEN 'items.created_by column exists' ELSE 'items table missing created_by column — Inventory CRUD will fail' END,'auto_fix_possible',true,'affected_count',CASE WHEN _count=0 THEN 1 ELSE 0 END);

  -- RC-026: purchase_orders.expected_date column missing
  SELECT count(*) INTO _count FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_orders' AND column_name='expected_date';
  _checks := _checks || jsonb_build_object('id','RC-026','category','Schema Drift','severity',CASE WHEN _count=0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count>0 THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _count>0 THEN 'purchase_orders.expected_date exists' ELSE 'purchase_orders missing expected_date column — PO lifecycle will fail' END,'auto_fix_possible',true,'affected_count',CASE WHEN _count=0 THEN 1 ELSE 0 END);

  -- RC-027: sales_orders.expected_date column missing
  SELECT count(*) INTO _count FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_orders' AND column_name='expected_date';
  _checks := _checks || jsonb_build_object('id','RC-027','category','Schema Drift','severity',CASE WHEN _count=0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count>0 THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _count>0 THEN 'sales_orders.expected_date exists' ELSE 'sales_orders missing expected_date column — SO lifecycle will fail' END,'auto_fix_possible',true,'affected_count',CASE WHEN _count=0 THEN 1 ELSE 0 END);

  -- ═══════════════════════════════════════════════════════════════
  -- NEW CATEGORY 11: SEEDING COMPLETENESS (RC-028 to RC-031)
  -- ═══════════════════════════════════════════════════════════════

  -- RC-028: Sandbox orgs with zero profiles
  SELECT count(*) INTO _count FROM organizations o WHERE o.name ILIKE '%sandbox%' AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.organization_id=o.id);
  _checks := _checks || jsonb_build_object('id','RC-028','category','Seeding Completeness','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Sandbox orgs with zero profiles: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-029: Orgs with profiles but zero role assignments
  SELECT count(*) INTO _count FROM organizations o WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.organization_id=o.id) AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN profiles p2 ON p2.user_id=ur.user_id WHERE p2.organization_id=o.id);
  _checks := _checks || jsonb_build_object('id','RC-029','category','Seeding Completeness','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Orgs with profiles but zero role assignments: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-030: Orgs with profiles but zero org_members
  SELECT count(*) INTO _count FROM organizations o WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.organization_id=o.id) AND NOT EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id=o.id);
  _checks := _checks || jsonb_build_object('id','RC-030','category','Seeding Completeness','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Orgs with profiles but zero org_members: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-031: Profiles with no manager hierarchy
  SELECT count(*) INTO _count FROM organizations o WHERE (SELECT count(*) FROM profiles p WHERE p.organization_id=o.id)>=5 AND (SELECT count(*) FROM profiles p2 WHERE p2.organization_id=o.id AND p2.manager_id IS NOT NULL)=0;
  _checks := _checks || jsonb_build_object('id','RC-031','category','Seeding Completeness','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Orgs with 5+ employees but zero manager assignments: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- NEW CATEGORY 12: RPC HEALTH (RC-032)
  -- ═══════════════════════════════════════════════════════════════

  BEGIN
    PERFORM run_financial_verification();
    _rpc_ok := true;
  EXCEPTION WHEN OTHERS THEN
    _rpc_ok := false;
  END;
  _checks := _checks || jsonb_build_object('id','RC-032','category','RPC Health','severity',CASE WHEN NOT _rpc_ok THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _rpc_ok THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _rpc_ok THEN 'run_financial_verification RPC executes successfully' ELSE 'run_financial_verification RPC FAILED — verification engine broken' END,'auto_fix_possible',false,'affected_count',CASE WHEN _rpc_ok THEN 0 ELSE 1 END);

  -- ═══════════════════════════════════════════════════════════════
  -- NEW CATEGORY 13: FK ORPHAN CASCADE (RC-033 to RC-035)
  -- ═══════════════════════════════════════════════════════════════

  -- RC-033: Bills referencing non-existent vendors
  SELECT count(*) INTO _count FROM bills b WHERE b.vendor_id IS NOT NULL AND b.is_deleted=false AND NOT EXISTS (SELECT 1 FROM vendors v WHERE v.id=b.vendor_id);
  _checks := _checks || jsonb_build_object('id','RC-033','category','FK Orphan Cascade','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Bills referencing deleted vendors: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-034: Profiles with manager_id pointing to non-existent profile
  SELECT count(*) INTO _count FROM profiles p WHERE p.manager_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p2 WHERE p2.id=p.manager_id);
  _checks := _checks || jsonb_build_object('id','RC-034','category','FK Orphan Cascade','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Profiles with manager_id referencing non-existent profile: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  -- RC-035: Expenses referencing non-existent profiles
  SELECT count(*) INTO _count FROM expenses e WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id=e.user_id);
  _checks := _checks || jsonb_build_object('id','RC-035','category','FK Orphan Cascade','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Expenses referencing non-existent profiles: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- NEW CATEGORY 14: TIMESTAMP ANOMALIES (RC-036 to RC-037)
  -- ═══════════════════════════════════════════════════════════════

  -- RC-036: Records with created_at in the future
  SELECT count(*) INTO _count FROM invoices WHERE created_at > now() + interval '1 hour' AND is_deleted=false;
  SELECT count(*) INTO _count2 FROM bills WHERE created_at > now() + interval '1 hour' AND is_deleted=false;
  SELECT count(*) INTO _count3 FROM expenses WHERE created_at > now() + interval '1 hour';
  _count := _count+_count2+_count3;
  _checks := _checks || jsonb_build_object('id','RC-036','category','Timestamp Anomalies','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Financial records with future created_at: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-037: Records where updated_at < created_at
  SELECT count(*) INTO _count FROM invoices WHERE updated_at < created_at AND is_deleted=false;
  SELECT count(*) INTO _count2 FROM bills WHERE updated_at < created_at AND is_deleted=false;
  _count := _count+_count2;
  _checks := _checks || jsonb_build_object('id','RC-037','category','Timestamp Anomalies','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Records where updated_at < created_at: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- NEW CATEGORY 15: STATUS MACHINE VIOLATIONS (RC-038 to RC-039)
  -- ═══════════════════════════════════════════════════════════════

  -- RC-038: Invoices in unexpected states
  SELECT count(*) INTO _count FROM invoices WHERE is_deleted=false AND status NOT IN ('draft','sent','partially_paid','paid','overdue','cancelled','void','written_off');
  _checks := _checks || jsonb_build_object('id','RC-038','category','Status Machine Violations','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Invoices in invalid status: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-039: Payroll runs in draft for 30+ days
  SELECT count(*) INTO _count FROM payroll_runs WHERE status='draft' AND created_at < now()-interval '30 days';
  _checks := _checks || jsonb_build_object('id','RC-039','category','Status Machine Violations','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Payroll runs stuck in draft 30+ days: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- NEW CATEGORY 16: NUMERIC BOUNDARY VIOLATIONS (RC-040 to RC-041)
  -- ═══════════════════════════════════════════════════════════════

  -- RC-040: Negative financial amounts
  SELECT count(*) INTO _count FROM invoices WHERE amount<0 AND is_deleted=false;
  SELECT count(*) INTO _count2 FROM bills WHERE amount<0 AND is_deleted=false;
  _count := _count+_count2;
  _checks := _checks || jsonb_build_object('id','RC-040','category','Numeric Boundary Violations','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Invoices/Bills with negative amounts: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-041: TDS rates exceeding 100%
  SELECT count(*) INTO _count FROM bills WHERE tds_rate IS NOT NULL AND tds_rate>100;
  _checks := _checks || jsonb_build_object('id','RC-041','category','Numeric Boundary Violations','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Bills with TDS rate > 100%%: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  -- NEW CATEGORY 17: CONSTRAINT COVERAGE (RC-042)
  -- ═══════════════════════════════════════════════════════════════

  -- RC-042: Critical tables missing unique constraints
  _count := 0;
  _missing_cols := '';
  -- Check items has unique SKU per org
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='items' AND indexdef LIKE '%sku%' AND indexdef LIKE '%organization_id%') THEN
    _count := _count+1; _missing_cols := _missing_cols || 'items(sku+org), ';
  END IF;
  -- Check bill_number unique per org
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='bills' AND indexdef LIKE '%bill_number%' AND indexdef LIKE '%organization_id%') THEN
    _count := _count+1; _missing_cols := _missing_cols || 'bills(bill_number+org), ';
  END IF;
  _checks := _checks || jsonb_build_object('id','RC-042','category','Constraint Coverage','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Missing unique constraints: %s — %s',_count,rtrim(_missing_cols,', ')),'auto_fix_possible',true,'affected_count',_count);

  -- ═══════════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'engine','Root Cause Audit Engine v2',
    'run_at',now(),
    'org_filter',p_org_id,
    'total_checks',jsonb_array_length(_checks),
    'checks',_checks
  );
END;
$$;
