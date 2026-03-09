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

  -- CATEGORY 1: REFERENCE INTEGRITY
  SELECT count(*) INTO _count FROM profiles WHERE organization_id IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-001','category','Reference Integrity','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Profiles with NULL organization_id: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM profiles p LEFT JOIN auth.users u ON u.id=p.user_id WHERE u.id IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-002','category','Reference Integrity','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Orphan profiles (no auth user): %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM user_roles ur LEFT JOIN profiles p ON p.user_id=ur.user_id WHERE p.id IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-003','category','Reference Integrity','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Role assignments with no profile: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM invoices WHERE organization_id IS NULL;
  SELECT count(*) INTO _count2 FROM bills WHERE organization_id IS NULL;
  SELECT count(*) INTO _count3 FROM expenses WHERE organization_id IS NULL;
  _count := _count+_count2+_count3;
  _checks := _checks || jsonb_build_object('id','RC-004','category','Reference Integrity','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Financial records with NULL org_id: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM expenses WHERE user_id IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-005','category','Reference Integrity','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Expenses with NULL user_id: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM profiles p WHERE p.manager_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p2 WHERE p2.id=p.manager_id);
  _checks := _checks || jsonb_build_object('id','RC-006','category','Reference Integrity','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Profiles with invalid manager_id: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM bills b WHERE b.vendor_id IS NOT NULL AND b.is_deleted=false AND NOT EXISTS (SELECT 1 FROM vendors v WHERE v.id=b.vendor_id);
  _checks := _checks || jsonb_build_object('id','RC-007','category','Reference Integrity','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Bills referencing deleted vendors: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM invoices i WHERE i.customer_id IS NOT NULL AND i.is_deleted=false AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id=i.customer_id);
  _checks := _checks || jsonb_build_object('id','RC-008','category','Reference Integrity','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Invoices referencing deleted customers: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM expenses e WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id=e.user_id);
  _checks := _checks || jsonb_build_object('id','RC-009','category','Reference Integrity','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Expenses referencing non-existent profiles: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM journal_lines jl WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts coa WHERE coa.id=jl.gl_account_id);
  _checks := _checks || jsonb_build_object('id','RC-010','category','Reference Integrity','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Journal lines with orphan account references: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- CATEGORY 2: CROSS-TENANT ISOLATION
  SELECT count(*) INTO _count FROM (SELECT user_id FROM profiles GROUP BY user_id HAVING count(DISTINCT organization_id)>1) d;
  _checks := _checks || jsonb_build_object('id','RC-011','category','Cross-Tenant Isolation','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Users with profiles in multiple orgs: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM attendance_records ar JOIN profiles p ON p.user_id=ar.user_id WHERE ar.organization_id!=p.organization_id;
  _checks := _checks || jsonb_build_object('id','RC-012','category','Cross-Tenant Isolation','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Attendance records with mismatched org_id: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM payroll_records pr JOIN profiles p ON p.user_id=pr.user_id WHERE pr.organization_id!=p.organization_id;
  _checks := _checks || jsonb_build_object('id','RC-013','category','Cross-Tenant Isolation','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Payroll records with mismatched org_id: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM leave_requests lr JOIN profiles p ON p.user_id=lr.user_id WHERE lr.organization_id!=p.organization_id;
  _checks := _checks || jsonb_build_object('id','RC-014','category','Cross-Tenant Isolation','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Leave requests with org mismatch: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM goals g JOIN profiles p ON p.user_id=g.user_id WHERE g.organization_id!=p.organization_id;
  _checks := _checks || jsonb_build_object('id','RC-015','category','Cross-Tenant Isolation','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Goals with org mismatch: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  -- CATEGORY 3: DUPLICATE RECORDS
  SELECT count(*) INTO _count FROM (SELECT user_id,organization_id FROM profiles WHERE organization_id IS NOT NULL GROUP BY user_id,organization_id HAVING count(*)>1) d;
  _checks := _checks || jsonb_build_object('id','RC-016','category','Duplicate Records','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Duplicate profiles (same user+org): %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM (SELECT user_id,role,organization_id FROM user_roles GROUP BY user_id,role,organization_id HAVING count(*)>1) d;
  _checks := _checks || jsonb_build_object('id','RC-017','category','Duplicate Records','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Duplicate role assignments: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM (SELECT invoice_number,organization_id FROM invoices WHERE is_deleted=false GROUP BY invoice_number,organization_id HAVING count(*)>1) d;
  _checks := _checks || jsonb_build_object('id','RC-018','category','Duplicate Records','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Duplicate invoice numbers: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM (SELECT user_id,pay_period_start,pay_period_end FROM payroll_records GROUP BY user_id,pay_period_start,pay_period_end HAVING count(*)>1) d;
  _checks := _checks || jsonb_build_object('id','RC-019','category','Duplicate Records','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Duplicate payroll records: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM (SELECT bill_number,organization_id FROM bills WHERE is_deleted=false GROUP BY bill_number,organization_id HAVING count(*)>1) d;
  _checks := _checks || jsonb_build_object('id','RC-020','category','Duplicate Records','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Duplicate bill numbers per org: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM (SELECT user_id,date FROM attendance_records GROUP BY user_id,date HAVING count(*)>1) d;
  _checks := _checks || jsonb_build_object('id','RC-021','category','Duplicate Records','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Duplicate attendance records: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- CATEGORY 4: AUTH-PROFILE SYNC
  SELECT count(*) INTO _count FROM profiles p JOIN auth.users u ON u.id=p.user_id WHERE p.email IS NOT NULL AND u.email IS NOT NULL AND lower(p.email)!=lower(u.email);
  _checks := _checks || jsonb_build_object('id','RC-022','category','Auth-Profile Sync','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Profiles with email mismatch vs auth: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id=u.id);
  _checks := _checks || jsonb_build_object('id','RC-023','category','Auth-Profile Sync','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Auth users with no profile record: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM profiles WHERE email IS NULL OR email='';
  _checks := _checks || jsonb_build_object('id','RC-024','category','Auth-Profile Sync','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Ghost profiles (null/empty email): %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM profiles p JOIN auth.users u ON u.id=p.user_id WHERE p.status='inactive' AND u.banned_until IS NULL AND u.deleted_at IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-025','category','Auth-Profile Sync','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Inactive profiles with active auth: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- CATEGORY 5: RLS & ACCESS CONTROL
  SELECT count(*) INTO _count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=true AND NOT EXISTS (SELECT 1 FROM pg_policies pp WHERE pp.tablename=c.relname AND pp.schemaname='public');
  _checks := _checks || jsonb_build_object('id','RC-026','category','RLS & Access Control','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Tables with RLS but zero policies: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false AND c.relname NOT LIKE 'pg_%' AND c.relname NOT IN ('schema_migrations','spatial_ref_sys');
  _checks := _checks || jsonb_build_object('id','RC-027','category','RLS & Access Control','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Tables without RLS enabled: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM invoices i JOIN organizations o ON o.id=i.organization_id WHERE o.status IN ('suspended','locked','archived') AND i.created_at > o.updated_at;
  _checks := _checks || jsonb_build_object('id','RC-028','category','RLS & Access Control','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Records created in suspended orgs: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- CATEGORY 6: TRIGGER & SCHEMA SAFETY
  SELECT count(*) INTO _count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='handle_new_user' AND n.nspname='public' AND p.prosrc NOT LIKE '%NOT EXISTS%';
  _checks := _checks || jsonb_build_object('id','RC-029','category','Trigger & Schema Safety','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _count=0 THEN 'handle_new_user has duplication guard' ELSE 'handle_new_user MISSING guard' END,'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.tgenabled='D';
  _checks := _checks || jsonb_build_object('id','RC-030','category','Trigger & Schema Safety','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Disabled triggers: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM information_schema.columns WHERE table_schema='public' AND table_name='items' AND column_name='created_by';
  _checks := _checks || jsonb_build_object('id','RC-031','category','Trigger & Schema Safety','severity',CASE WHEN _count=0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count>0 THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _count>0 THEN 'items.created_by exists' ELSE 'items missing created_by' END,'auto_fix_possible',true,'affected_count',CASE WHEN _count=0 THEN 1 ELSE 0 END);

  SELECT count(*) INTO _count FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_orders' AND column_name='expected_date';
  _checks := _checks || jsonb_build_object('id','RC-032','category','Trigger & Schema Safety','severity',CASE WHEN _count=0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count>0 THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _count>0 THEN 'purchase_orders.expected_date exists' ELSE 'purchase_orders missing expected_date' END,'auto_fix_possible',true,'affected_count',CASE WHEN _count=0 THEN 1 ELSE 0 END);

  SELECT count(*) INTO _count FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_orders' AND column_name='expected_date';
  _checks := _checks || jsonb_build_object('id','RC-033','category','Trigger & Schema Safety','severity',CASE WHEN _count=0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count>0 THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _count>0 THEN 'sales_orders.expected_date exists' ELSE 'sales_orders missing expected_date' END,'auto_fix_possible',true,'affected_count',CASE WHEN _count=0 THEN 1 ELSE 0 END);

  SELECT count(*) INTO _count FROM information_schema.columns WHERE table_schema='public' AND column_name='organization_id' AND is_nullable='YES' AND table_name NOT IN ('integrity_audit_runs');
  _checks := _checks || jsonb_build_object('id','RC-034','category','Trigger & Schema Safety','severity',CASE WHEN _count>5 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Tables with nullable organization_id: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  _count := 0; _missing_cols := '';
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='items' AND indexdef LIKE '%sku%' AND indexdef LIKE '%organization_id%') THEN _count:=_count+1; _missing_cols:=_missing_cols||'items(sku+org), '; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='bills' AND indexdef LIKE '%bill_number%' AND indexdef LIKE '%organization_id%') THEN _count:=_count+1; _missing_cols:=_missing_cols||'bills(bill_number+org), '; END IF;
  _checks := _checks || jsonb_build_object('id','RC-035','category','Trigger & Schema Safety','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Missing unique constraints: %s — %s',_count,rtrim(_missing_cols,', ')),'auto_fix_possible',true,'affected_count',_count);

  -- CATEGORY 7: FINANCIAL HEALTH
  SELECT count(*) INTO _count FROM (SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id=je.id GROUP BY je.id HAVING abs(sum(jl.debit)-sum(jl.credit))>0.01) u;
  _checks := _checks || jsonb_build_object('id','RC-036','category','Financial Health','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Unbalanced journal entries: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM organizations o WHERE EXISTS (SELECT 1 FROM financial_records fr WHERE fr.organization_id=o.id) AND NOT EXISTS (SELECT 1 FROM chart_of_accounts coa WHERE coa.organization_id=o.id);
  _checks := _checks || jsonb_build_object('id','RC-037','category','Financial Health','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Orgs with financial data but no CoA: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM chart_of_accounts coa WHERE coa.is_active=false AND EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.gl_account_id=coa.id AND jl.created_at > now()-interval '90 days');
  _checks := _checks || jsonb_build_object('id','RC-038','category','Financial Health','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Inactive accounts with recent entries: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM (SELECT fp1.id FROM fiscal_periods fp1 JOIN fiscal_periods fp2 ON fp1.organization_id=fp2.organization_id AND fp1.id!=fp2.id AND fp1.start_date<=fp2.end_date AND fp1.end_date>=fp2.start_date WHERE fp1.status!='cancelled' AND fp2.status!='cancelled') ov;
  _checks := _checks || jsonb_build_object('id','RC-039','category','Financial Health','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Overlapping fiscal periods: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM financial_records fr JOIN fiscal_periods fp ON fr.organization_id=fp.organization_id AND fr.record_date BETWEEN fp.start_date AND fp.end_date WHERE fp.status='closed' AND fr.created_at > fp.updated_at;
  _checks := _checks || jsonb_build_object('id','RC-040','category','Financial Health','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Entries in closed fiscal periods: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM organizations o WHERE EXISTS (SELECT 1 FROM financial_records fr WHERE fr.organization_id=o.id) AND NOT EXISTS (SELECT 1 FROM fiscal_periods fp WHERE fp.organization_id=o.id);
  _checks := _checks || jsonb_build_object('id','RC-041','category','Financial Health','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Orgs with financial data but no fiscal periods: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM invoices WHERE amount<0 AND is_deleted=false;
  SELECT count(*) INTO _count2 FROM bills WHERE amount<0 AND is_deleted=false;
  _count := _count+_count2;
  _checks := _checks || jsonb_build_object('id','RC-042','category','Financial Health','severity',CASE WHEN _count>0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Negative amount invoices/bills: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM bills WHERE tds_rate IS NOT NULL AND tds_rate>100;
  _checks := _checks || jsonb_build_object('id','RC-043','category','Financial Health','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Bills with TDS rate > 100%%: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- CATEGORY 8: DATA LIFECYCLE
  SELECT count(*) INTO _count FROM invoices WHERE is_deleted=true AND deleted_at IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-044','category','Data Lifecycle','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Soft-deleted invoices missing deleted_at: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM bills WHERE is_deleted=true AND deleted_at IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-045','category','Data Lifecycle','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Soft-deleted bills missing deleted_at: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  -- CATEGORY 9: STATUS MACHINE VIOLATIONS
  SELECT count(*) INTO _count FROM invoices WHERE is_deleted=false AND status NOT IN ('draft','sent','partially_paid','paid','overdue','cancelled','void','written_off');
  _checks := _checks || jsonb_build_object('id','RC-046','category','Status Machine Violations','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Invoices in invalid status: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM payroll_runs WHERE status='draft' AND created_at < now()-interval '30 days';
  _checks := _checks || jsonb_build_object('id','RC-047','category','Status Machine Violations','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Payroll runs stuck in draft 30+ days: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM payroll_runs WHERE status='processing' AND created_at < now()-interval '24 hours';
  _checks := _checks || jsonb_build_object('id','RC-048','category','Status Machine Violations','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Stale payroll runs in processing: %s',_count),'auto_fix_possible',true,'affected_count',_count);

  SELECT count(*) INTO _count FROM work_orders WHERE status NOT IN ('draft','planned','in_progress','completed','cancelled','on_hold');
  _checks := _checks || jsonb_build_object('id','RC-049','category','Status Machine Violations','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Work orders in invalid status: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM purchase_orders WHERE status NOT IN ('draft','sent','confirmed','partially_received','received','cancelled','closed');
  _checks := _checks || jsonb_build_object('id','RC-050','category','Status Machine Violations','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('POs in invalid status: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- CATEGORY 10: TIMESTAMP ANOMALIES
  SELECT count(*) INTO _count FROM invoices WHERE created_at > now()+interval '1 hour' AND is_deleted=false;
  SELECT count(*) INTO _count2 FROM bills WHERE created_at > now()+interval '1 hour' AND is_deleted=false;
  SELECT count(*) INTO _count3 FROM expenses WHERE created_at > now()+interval '1 hour';
  _count := _count+_count2+_count3;
  _checks := _checks || jsonb_build_object('id','RC-051','category','Timestamp Anomalies','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Future created_at on financial records: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM invoices WHERE updated_at < created_at AND is_deleted=false;
  SELECT count(*) INTO _count2 FROM bills WHERE updated_at < created_at AND is_deleted=false;
  _count := _count+_count2;
  _checks := _checks || jsonb_build_object('id','RC-052','category','Timestamp Anomalies','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Records where updated_at < created_at: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- CATEGORY 11: SEEDING & ORG COMPLETENESS
  SELECT count(*) INTO _count FROM organizations o WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.organization_id=o.id);
  _checks := _checks || jsonb_build_object('id','RC-053','category','Seeding & Org Completeness','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Orgs with zero profiles: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM organizations o WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.organization_id=o.id) AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN profiles p2 ON p2.user_id=ur.user_id WHERE p2.organization_id=o.id);
  _checks := _checks || jsonb_build_object('id','RC-054','category','Seeding & Org Completeness','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Orgs with profiles but zero roles: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM organizations o WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.organization_id=o.id) AND NOT EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id=o.id);
  _checks := _checks || jsonb_build_object('id','RC-055','category','Seeding & Org Completeness','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Orgs with profiles but zero org_members: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM organizations o WHERE (SELECT count(*) FROM profiles p WHERE p.organization_id=o.id)>=5 AND (SELECT count(*) FROM profiles p2 WHERE p2.organization_id=o.id AND p2.manager_id IS NOT NULL)=0;
  _checks := _checks || jsonb_build_object('id','RC-056','category','Seeding & Org Completeness','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Orgs with 5+ employees but zero managers: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- CATEGORY 12: RPC & ENGINE HEALTH
  BEGIN PERFORM run_financial_verification(); _rpc_ok := true; EXCEPTION WHEN OTHERS THEN _rpc_ok := false; END;
  _checks := _checks || jsonb_build_object('id','RC-057','category','RPC & Engine Health','severity',CASE WHEN NOT _rpc_ok THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _rpc_ok THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _rpc_ok THEN 'run_financial_verification OK' ELSE 'run_financial_verification FAILED' END,'auto_fix_possible',false,'affected_count',CASE WHEN _rpc_ok THEN 0 ELSE 1 END);

  SELECT count(*) INTO _count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='run_root_cause_audit' AND n.nspname='public';
  _checks := _checks || jsonb_build_object('id','RC-058','category','RPC & Engine Health','severity',CASE WHEN _count=0 THEN 'CRITICAL' ELSE 'LOW' END,'status',CASE WHEN _count>0 THEN 'PASS' ELSE 'FAIL' END,'detail',CASE WHEN _count>0 THEN 'run_root_cause_audit RPC exists' ELSE 'run_root_cause_audit MISSING' END,'auto_fix_possible',false,'affected_count',CASE WHEN _count=0 THEN 1 ELSE 0 END);

  -- CATEGORY 13: PAYROLL & HR SYNC
  SELECT count(*) INTO _count FROM payroll_records pr WHERE NOT EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.user_id=pr.user_id AND extract(month FROM ar.date::date)=extract(month FROM pr.pay_period_start) AND extract(year FROM ar.date::date)=extract(year FROM pr.pay_period_start));
  _checks := _checks || jsonb_build_object('id','RC-059','category','Payroll & HR Sync','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Payroll records with zero attendance: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM payroll_runs pr WHERE pr.status IN ('completed','approved') AND NOT EXISTS (SELECT 1 FROM payroll_records prr WHERE prr.payroll_run_id=pr.id);
  _checks := _checks || jsonb_build_object('id','RC-060','category','Payroll & HR Sync','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Completed payroll runs with zero records: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM leave_balances WHERE balance<0;
  _checks := _checks || jsonb_build_object('id','RC-061','category','Payroll & HR Sync','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Negative leave balances: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- CATEGORY 14: INVENTORY & SUPPLY CHAIN
  SELECT count(*) INTO _count FROM items WHERE stock_on_hand<0;
  _checks := _checks || jsonb_build_object('id','RC-062','category','Inventory & Supply Chain','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Items with negative stock: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM purchase_orders WHERE status='confirmed' AND created_at < now()-interval '30 days' AND NOT EXISTS (SELECT 1 FROM goods_receipts gr WHERE gr.purchase_order_id=purchase_orders.id);
  _checks := _checks || jsonb_build_object('id','RC-063','category','Inventory & Supply Chain','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Confirmed POs 30+ days without receipt: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM sales_orders WHERE status='confirmed' AND created_at < now()-interval '30 days' AND NOT EXISTS (SELECT 1 FROM delivery_notes dn WHERE dn.sales_order_id=sales_orders.id);
  _checks := _checks || jsonb_build_object('id','RC-064','category','Inventory & Supply Chain','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Confirmed SOs 30+ days without delivery: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM work_orders wo WHERE wo.status='completed' AND NOT EXISTS (SELECT 1 FROM material_consumption mc WHERE mc.work_order_id=wo.id);
  _checks := _checks || jsonb_build_object('id','RC-065','category','Inventory & Supply Chain','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Completed work orders with zero consumption: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM bill_of_materials bom WHERE bom.status='active' AND NOT EXISTS (SELECT 1 FROM bom_lines bl WHERE bl.bom_id=bom.id);
  _checks := _checks || jsonb_build_object('id','RC-066','category','Inventory & Supply Chain','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Active BOMs with zero components: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM stock_adjustments WHERE quantity=0;
  _checks := _checks || jsonb_build_object('id','RC-067','category','Inventory & Supply Chain','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Stock adjustments with zero quantity: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- CATEGORY 15: AUDIT TRAIL INTEGRITY
  _count := 0;
  IF NOT EXISTS (SELECT 1 FROM audit_logs WHERE entity_type='invoice' LIMIT 1) THEN _count:=_count+1; END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_logs WHERE entity_type='bill' LIMIT 1) THEN _count:=_count+1; END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_logs WHERE entity_type='payroll' LIMIT 1) THEN _count:=_count+1; END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_logs WHERE entity_type='employee' LIMIT 1) THEN _count:=_count+1; END IF;
  _checks := _checks || jsonb_build_object('id','RC-068','category','Audit Trail Integrity','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Critical entity types missing from audit log: %s of 4',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM audit_logs WHERE actor_id IS NULL;
  _checks := _checks || jsonb_build_object('id','RC-069','category','Audit Trail Integrity','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Audit logs with NULL actor_id: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM organizations o WHERE o.status='active' AND EXISTS (SELECT 1 FROM audit_logs al WHERE al.organization_id=o.id) AND (SELECT max(created_at) FROM audit_logs al2 WHERE al2.organization_id=o.id) < now()-interval '7 days';
  _checks := _checks || jsonb_build_object('id','RC-070','category','Audit Trail Integrity','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Active orgs with no audit activity in 7+ days: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  -- RC-071: Safe check for connector_configs (may not exist)
  BEGIN
    SELECT count(*) INTO _count FROM connector_configs cc WHERE cc.is_active=true AND cc.last_sync_at < now()-interval '7 days';
  EXCEPTION WHEN undefined_table THEN
    _count := 0;
  END;
  _checks := _checks || jsonb_build_object('id','RC-071','category','Audit Trail Integrity','severity',CASE WHEN _count>0 THEN 'MEDIUM' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'WARNING' END,'detail',format('Active connectors with stale sync: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  SELECT count(*) INTO _count FROM approval_requests ar JOIN approval_workflows aw ON aw.id=ar.workflow_id WHERE aw.is_active=false AND ar.status='pending';
  _checks := _checks || jsonb_build_object('id','RC-072','category','Audit Trail Integrity','severity',CASE WHEN _count>0 THEN 'HIGH' ELSE 'LOW' END,'status',CASE WHEN _count=0 THEN 'PASS' ELSE 'FAIL' END,'detail',format('Pending approvals on disabled workflows: %s',_count),'auto_fix_possible',false,'affected_count',_count);

  RETURN jsonb_build_object(
    'engine','Root Cause Audit Engine v4',
    'run_at',now(),
    'org_filter',p_org_id,
    'total_checks',jsonb_array_length(_checks),
    'checks',_checks
  );
END;
$$;