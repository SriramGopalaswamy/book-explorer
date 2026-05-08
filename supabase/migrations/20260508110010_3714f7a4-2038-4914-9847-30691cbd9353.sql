CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $perf$
DECLARE
  list_tables  text[] := ARRAY[
    'invoices','bills','assets','eway_bills','bank_transactions','expenses',
    'journal_entries','audit_logs','notifications','sales_orders',
    'purchase_orders','goods_receipts','delivery_notes','credit_notes',
    'payment_receipts','payroll_records','payroll_entries','reimbursement_requests',
    'leave_requests','attendance_records','memos','goals','approval_requests',
    'background_jobs','job_queue','e_invoices','sales_returns','purchase_returns',
    'work_orders','material_consumption','finished_goods_entries','stock_movements',
    'stock_transfers','picking_lists','inventory_counts','customers','vendors',
    'items','warehouses','connector_logs','integrations','data_export_requests',
    'data_erasure_requests','employee_documents','compensation_revision_requests',
    'investment_declarations','attendance_correction_requests','financial_records',
    'journal_lines','exchange_rates','recurring_transactions'
  ];
  status_tables text[] := ARRAY[
    'invoices','bills','assets','eway_bills','sales_orders','purchase_orders',
    'goods_receipts','delivery_notes','credit_notes','payment_receipts',
    'payroll_records','payroll_entries','reimbursement_requests','leave_requests',
    'attendance_records','memos','goals','approval_requests','background_jobs',
    'job_queue','e_invoices','work_orders','inventory_counts','customers','vendors',
    'connector_logs','integrations','data_export_requests','data_erasure_requests',
    'compensation_revision_requests','investment_declarations',
    'attendance_correction_requests','journal_entries','fiscal_periods',
    'organizations','bank_accounts','credit_cards',
    'credit_card_transactions','attendance_upload_logs','attendance_daily',
    'gst_filing_status','audit_compliance_runs','audit_compliance_checks',
    'audit_pack_exports','audit_ifc_assessments','data_breach_log','goal_plans',
    'bill_of_materials'
  ];
  fk_table_col text[][] := ARRAY[
    ['attendance_records','profile_id'],
    ['attendance_daily','profile_id'],
    ['attendance_punches','profile_id'],
    ['attendance_correction_requests','profile_id'],
    ['payroll_records','profile_id'],
    ['payroll_entries','profile_id'],
    ['leave_requests','profile_id'],
    ['leave_balances','profile_id'],
    ['employee_details','profile_id'],
    ['employee_documents','profile_id'],
    ['employee_tax_settings','profile_id'],
    ['employee_code_mappings','profile_id'],
    ['compensation_structures','profile_id'],
    ['compensation_revision_requests','profile_id'],
    ['investment_declarations','profile_id'],
    ['form16_records','profile_id'],
    ['goal_plans','profile_id'],
    ['expenses','profile_id'],
    ['payroll_attendance_summary','profile_id'],
    ['invoices','customer_id'],
    ['credit_notes','customer_id'],
    ['delivery_notes','customer_id'],
    ['payment_receipts','customer_id'],
    ['ai_customer_profiles','customer_id'],
    ['bills','vendor_id'],
    ['goods_receipts','vendor_id'],
    ['assets','vendor_id'],
    ['ai_vendor_profiles','vendor_id'],
    ['invoice_items','invoice_id'],
    ['credit_notes','invoice_id'],
    ['eway_bills','invoice_id'],
    ['e_invoices','invoice_id'],
    ['payment_receipts','invoice_id'],
    ['bill_items','bill_id'],
    ['assets','bill_id'],
    ['delivery_notes','sales_order_id'],
    ['eway_bills','sales_order_id'],
    ['invoices','sales_order_id'],
    ['bills','purchase_order_id'],
    ['goods_receipts','purchase_order_id'],
    ['delivery_note_items','item_id'],
    ['goods_receipt_items','item_id'],
    ['inventory_count_items','item_id'],
    ['inventory_count_lines','item_id'],
    ['material_consumption','item_id'],
    ['finished_goods_entries','item_id'],
    ['bom_lines','item_id'],
    ['delivery_note_items','warehouse_id'],
    ['goods_receipt_items','warehouse_id'],
    ['inventory_counts','warehouse_id'],
    ['finished_goods_entries','warehouse_id'],
    ['material_consumption','warehouse_id'],
    ['bin_locations','warehouse_id']
  ];
  trgm_pairs text[][] := ARRAY[
    ['invoices','invoice_number'],
    ['bills','bill_number'],
    ['sales_orders','order_number'],
    ['purchase_orders','order_number'],
    ['eway_bills','eway_bill_number'],
    ['assets','asset_code'],
    ['assets','name'],
    ['items','item_code'],
    ['items','name'],
    ['customers','name'],
    ['vendors','name'],
    ['delivery_notes','delivery_note_number'],
    ['goods_receipts','grn_number'],
    ['credit_notes','credit_note_number']
  ];
  t  text;
  c  text;
  idx_name text;
BEGIN
  FOREACH t IN ARRAY list_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='organization_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='created_at')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t AND table_type='BASE TABLE') THEN
      idx_name := 'idx_' || t || '_org_created_desc';
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (organization_id, created_at DESC)', idx_name, t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY status_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='status')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t AND table_type='BASE TABLE') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='organization_id') THEN
        idx_name := 'idx_' || t || '_org_status';
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (organization_id, status)', idx_name, t);
      ELSE
        idx_name := 'idx_' || t || '_status';
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (status)', idx_name, t);
      END IF;
    END IF;
  END LOOP;

  FOR i IN 1 .. array_length(fk_table_col, 1) LOOP
    t := fk_table_col[i][1];
    c := fk_table_col[i][2];
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name=c)
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t AND table_type='BASE TABLE') THEN
      idx_name := 'idx_' || t || '_' || c;
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', idx_name, t, c);
    END IF;
  END LOOP;

  FOR i IN 1 .. array_length(trgm_pairs, 1) LOOP
    t := trgm_pairs[i][1];
    c := trgm_pairs[i][2];
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name=c)
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t AND table_type='BASE TABLE') THEN
      idx_name := 'idx_' || t || '_' || c || '_trgm';
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I USING GIN (%I gin_trgm_ops)', idx_name, t, c);
    END IF;
  END LOOP;

  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tt
      ON tt.table_schema=c.table_schema AND tt.table_name=c.table_name
    WHERE c.table_schema='public' AND c.column_name='is_deleted' AND tt.table_type='BASE TABLE'
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='organization_id') THEN
      idx_name := 'idx_' || t || '_org_active';
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (organization_id) WHERE is_deleted = false', idx_name, t);
    END IF;
  END LOOP;
END
$perf$;

CREATE OR REPLACE FUNCTION public.get_user_org(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_user_org(uuid) TO authenticated;

ANALYZE;