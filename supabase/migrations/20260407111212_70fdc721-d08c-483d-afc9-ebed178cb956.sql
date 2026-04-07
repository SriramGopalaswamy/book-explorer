
DO $$
DECLARE
  org_id UUID := '00000000-0000-0000-0000-000000000001';
  r RECORD;
  tbl_list TEXT[] := ARRAY[
    'journal_lines','journal_entries','invoices','bills','expenses','financial_records','credit_notes','vendor_credits','vendor_payments',
    'payment_receipts','sales_orders','sales_returns','delivery_notes','purchase_orders','purchase_returns','goods_receipts','quotes',
    'assets','bank_transactions','payroll_records','payroll_runs','stock_adjustments','stock_transfers','work_orders','leave_requests',
    'customers','vendors','attendance_records','attendance_daily','attendance_punches','attendance_shifts','memos','goals',
    'compensation_revision_requests','reimbursement_requests','items','warehouses','bin_locations','inventory_counts',
    'picking_lists','employee_details','employee_documents','finished_goods_entries','material_consumption',
    'bill_of_materials','stock_ledger','asset_depreciation_entries','bom_lines','inventory_count_items',
    'purchase_return_items','sales_return_items','stock_transfer_items','gl_accounts','payroll_entries',
    'employee_code_mappings','employee_tax_settings','form16_records','investment_declarations',
    'payslip_disputes','compensation_structures','leave_balances','goal_plans'
  ];
BEGIN
  FOR r IN SELECT DISTINCT tgrelid::regclass::text AS tbl, tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text = ANY(tbl_list) LOOP
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER %I', r.tbl, r.tgname);
  END LOOP;

  UPDATE quotes SET converted_invoice_id = NULL WHERE organization_id = org_id AND converted_invoice_id IS NOT NULL;
  UPDATE assets SET assigned_to = NULL, bill_id = NULL, vendor_id = NULL WHERE organization_id = org_id;

  -- Line items
  DELETE FROM delivery_note_items WHERE delivery_note_id IN (SELECT id FROM delivery_notes WHERE organization_id = org_id);
  DELETE FROM goods_receipt_items WHERE goods_receipt_id IN (SELECT id FROM goods_receipts WHERE organization_id = org_id);
  DELETE FROM sales_return_items WHERE sales_return_id IN (SELECT id FROM sales_returns WHERE organization_id = org_id);
  DELETE FROM purchase_return_items WHERE purchase_return_id IN (SELECT id FROM purchase_returns WHERE organization_id = org_id);
  DELETE FROM sales_order_items WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE organization_id = org_id);
  DELETE FROM purchase_order_items WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE organization_id = org_id);
  DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE organization_id = org_id);
  DELETE FROM bill_items WHERE bill_id IN (SELECT id FROM bills WHERE organization_id = org_id);
  DELETE FROM quote_items WHERE quote_id IN (SELECT id FROM quotes WHERE organization_id = org_id);
  DELETE FROM picking_list_items WHERE picking_list_id IN (SELECT id FROM picking_lists WHERE organization_id = org_id);
  DELETE FROM stock_adjustment_items WHERE adjustment_id IN (SELECT id FROM stock_adjustments WHERE organization_id = org_id);
  DELETE FROM stock_transfer_items WHERE transfer_id IN (SELECT id FROM stock_transfers WHERE organization_id = org_id);
  DELETE FROM inventory_count_items WHERE count_id IN (SELECT id FROM inventory_counts WHERE organization_id = org_id);
  DELETE FROM bom_lines WHERE bom_id IN (SELECT id FROM bill_of_materials WHERE organization_id = org_id);
  DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE organization_id = org_id);

  -- Financial
  DELETE FROM e_invoices WHERE organization_id = org_id;
  DELETE FROM eway_bills WHERE organization_id = org_id;
  DELETE FROM payment_receipts WHERE organization_id = org_id;
  DELETE FROM credit_notes WHERE organization_id = org_id;
  DELETE FROM vendor_payments WHERE organization_id = org_id;
  DELETE FROM vendor_credits WHERE organization_id = org_id;
  DELETE FROM asset_depreciation_entries WHERE organization_id = org_id;
  DELETE FROM assets WHERE organization_id = org_id;
  DELETE FROM journal_entries WHERE organization_id = org_id;
  DELETE FROM invoices WHERE organization_id = org_id;
  DELETE FROM bills WHERE organization_id = org_id;
  DELETE FROM sales_returns WHERE organization_id = org_id;
  DELETE FROM delivery_notes WHERE organization_id = org_id;
  DELETE FROM picking_lists WHERE organization_id = org_id;
  DELETE FROM sales_orders WHERE organization_id = org_id;
  DELETE FROM quotes WHERE organization_id = org_id;
  DELETE FROM purchase_returns WHERE organization_id = org_id;
  DELETE FROM goods_receipts WHERE organization_id = org_id;
  DELETE FROM purchase_orders WHERE organization_id = org_id;
  DELETE FROM expenses WHERE organization_id = org_id;
  DELETE FROM reimbursement_requests WHERE organization_id = org_id;
  DELETE FROM financial_records WHERE organization_id = org_id;
  DELETE FROM credit_card_transactions WHERE organization_id = org_id;
  DELETE FROM credit_cards WHERE organization_id = org_id;
  DELETE FROM bank_transactions WHERE organization_id = org_id;
  DELETE FROM bank_transfer_batches WHERE organization_id = org_id;
  DELETE FROM bank_accounts WHERE organization_id = org_id;
  DELETE FROM scheduled_payments WHERE organization_id = org_id;
  DELETE FROM recurring_transactions WHERE organization_id = org_id;
  DELETE FROM subledger_reconciliation_log WHERE organization_id = org_id;
  DELETE FROM period_close_logs WHERE organization_id = org_id;
  DELETE FROM budgets WHERE organization_id = org_id;
  DELETE FROM exchange_rates WHERE organization_id = org_id;
  DELETE FROM gst_filing_status WHERE organization_id = org_id;
  DELETE FROM invoice_settings WHERE organization_id = org_id;
  DELETE FROM fiscal_periods WHERE organization_id = org_id;
  DELETE FROM financial_years WHERE organization_id = org_id;
  DELETE FROM integrity_audit_runs WHERE organization_id = org_id;

  -- Manufacturing & Inventory
  DELETE FROM material_consumption WHERE organization_id = org_id;
  DELETE FROM finished_goods_entries WHERE organization_id = org_id;
  DELETE FROM work_orders WHERE organization_id = org_id;
  DELETE FROM bill_of_materials WHERE organization_id = org_id;
  DELETE FROM stock_transfers WHERE organization_id = org_id;
  DELETE FROM inventory_counts WHERE organization_id = org_id;
  DELETE FROM stock_adjustments WHERE organization_id = org_id;
  DELETE FROM stock_ledger WHERE organization_id = org_id;
  DELETE FROM bin_locations WHERE organization_id = org_id;
  DELETE FROM warehouses WHERE organization_id = org_id;
  DELETE FROM items WHERE organization_id = org_id;
  DELETE FROM units_of_measure WHERE organization_id = org_id;
  DELETE FROM customers WHERE organization_id = org_id;
  DELETE FROM vendors WHERE organization_id = org_id;

  -- HR (all profile-linked data)
  DELETE FROM payslip_disputes WHERE organization_id = org_id;
  DELETE FROM payroll_entries WHERE organization_id = org_id;
  DELETE FROM payroll_records WHERE organization_id = org_id;
  DELETE FROM payroll_runs WHERE organization_id = org_id;
  DELETE FROM form16_records WHERE organization_id = org_id;
  DELETE FROM investment_declarations WHERE organization_id = org_id;
  DELETE FROM employee_tax_settings WHERE organization_id = org_id;
  DELETE FROM employee_documents WHERE organization_id = org_id;
  DELETE FROM employee_details WHERE organization_id = org_id;
  DELETE FROM employee_code_mappings WHERE organization_id = org_id;
  DELETE FROM compensation_revision_requests WHERE organization_id = org_id;
  DELETE FROM compensation_structures WHERE organization_id = org_id;
  DELETE FROM leave_balances WHERE organization_id = org_id;
  DELETE FROM leave_requests WHERE organization_id = org_id;
  DELETE FROM goal_plans WHERE organization_id = org_id;
  DELETE FROM goals WHERE organization_id = org_id;
  DELETE FROM memos WHERE organization_id = org_id;
  DELETE FROM profile_change_requests WHERE organization_id = org_id;
  DELETE FROM consent_records WHERE organization_id = org_id;
  DELETE FROM data_erasure_requests WHERE organization_id = org_id;
  DELETE FROM data_breach_log WHERE organization_id = org_id;
  DELETE FROM data_export_requests WHERE organization_id = org_id;
  DELETE FROM attendance_correction_requests WHERE organization_id = org_id;
  DELETE FROM attendance_daily WHERE organization_id = org_id;
  DELETE FROM attendance_punches WHERE organization_id = org_id;
  DELETE FROM attendance_records WHERE organization_id = org_id;
  DELETE FROM attendance_upload_logs WHERE organization_id = org_id;
  DELETE FROM attendance_parse_diagnostics WHERE organization_id = org_id;

  -- Operational
  DELETE FROM notifications WHERE organization_id = org_id;
  DELETE FROM bulk_upload_history WHERE organization_id = org_id;
  DELETE FROM connector_logs WHERE organization_id = org_id;
  DELETE FROM workflow_events WHERE organization_id = org_id;
  DELETE FROM workflow_runs WHERE organization_id = org_id;
  DELETE FROM workflows WHERE organization_id = org_id;
  DELETE FROM approval_requests WHERE organization_id = org_id;
  DELETE FROM document_sequences WHERE organization_id = org_id;
  DELETE FROM onboarding_snapshots WHERE organization_id = org_id;
  DELETE FROM session_policies WHERE organization_id = org_id;
  DELETE FROM control_account_overrides WHERE organization_id = org_id;
  DELETE FROM shopify_orders WHERE organization_id = org_id;
  DELETE FROM shopify_customers WHERE organization_id = org_id;
  DELETE FROM shopify_products WHERE organization_id = org_id;
  DELETE FROM subscription_redemptions WHERE organization_id = org_id;
  DELETE FROM wage_payment_deadlines WHERE organization_id = org_id;

  FOR r IN SELECT DISTINCT tgrelid::regclass::text AS tbl, tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text = ANY(tbl_list) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER %I', r.tbl, r.tgname);
  END LOOP;
END $$;
