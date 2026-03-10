
-- Create a SECURITY DEFINER function to force-delete sandbox data
-- This bypasses terminal state triggers by disabling them temporarily
CREATE OR REPLACE FUNCTION public.sandbox_force_reset_tables(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl text;
  trigger_tables text[] := ARRAY[
    'invoices', 'bills', 'purchase_orders', 'sales_orders',
    'delivery_notes', 'goods_receipts', 'work_orders',
    'stock_transfers', 'purchase_returns', 'sales_returns',
    'vendor_payments', 'payment_receipts', 'payroll_runs',
    'stock_adjustments'
  ];
  cleanup_tables text[] := ARRAY[
    'payslip_disputes', 'payroll_records', 'payroll_runs',
    'reimbursement_requests',
    'goal_plans', 'memos', 'notifications',
    'attendance_daily', 'attendance_punches', 'attendance_records',
    'attendance_correction_requests',
    'leave_requests', 'leave_balances', 'investment_declarations', 'employee_documents',
    'asset_depreciation_entries',
    'quote_items', 'quotes',
    'invoice_items', 'invoices',
    'bill_items', 'bills',
    'vendor_credits', 'credit_notes',
    'bank_transactions', 'bank_accounts', 'expenses', 'budgets',
    'financial_records', 'assets', 'audit_logs',
    'compensation_revision_requests', 'compensation_components', 'compensation_structures',
    'holidays', 'user_roles', 'organization_members',
    'profile_change_requests',
    'chart_of_accounts',
    'picking_list_items', 'picking_lists',
    'stock_transfer_items', 'stock_transfers',
    'inventory_count_items', 'inventory_counts',
    'material_consumption',
    'work_orders', 'bom_lines', 'bill_of_materials',
    'delivery_note_items', 'delivery_notes',
    'goods_receipt_items', 'goods_receipts',
    'purchase_return_items', 'purchase_returns',
    'sales_return_items', 'sales_returns',
    'sales_order_items', 'sales_orders',
    'purchase_order_items', 'purchase_orders',
    'stock_adjustment_items', 'stock_adjustments', 'stock_ledger',
    'bin_locations', 'warehouses',
    'items',
    'connector_logs', 'connectors'
  ];
BEGIN
  -- Verify this is a sandbox org
  IF NOT EXISTS (
    SELECT 1 FROM organizations WHERE id = _org_id AND environment_type = 'sandbox'
  ) THEN
    RAISE EXCEPTION 'sandbox_force_reset_tables: org % is not a sandbox', _org_id;
  END IF;

  -- Disable terminal state triggers
  FOREACH tbl IN ARRAY trigger_tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER trg_enforce_terminal_state', tbl);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  -- Also disable validation triggers for cleanup
  BEGIN ALTER TABLE public.expenses DISABLE TRIGGER trg_validate_positive_amount; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.reimbursement_requests DISABLE TRIGGER trg_validate_positive_amount; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.payroll_records DISABLE TRIGGER trg_validate_payroll_record; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.leave_requests DISABLE TRIGGER trg_validate_leave_request; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Delete child items first (no org_id column)
  DELETE FROM public.invoice_items WHERE invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = _org_id);
  DELETE FROM public.bill_items WHERE bill_id IN (SELECT id FROM public.bills WHERE organization_id = _org_id);
  DELETE FROM public.stock_adjustment_items WHERE adjustment_id IN (SELECT id FROM public.stock_adjustments WHERE organization_id = _org_id);

  -- Delete all org-scoped tables
  FOREACH tbl IN ARRAY cleanup_tables LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', tbl) USING _org_id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  -- Re-enable triggers
  FOREACH tbl IN ARRAY trigger_tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER trg_enforce_terminal_state', tbl);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  BEGIN ALTER TABLE public.expenses ENABLE TRIGGER trg_validate_positive_amount; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.reimbursement_requests ENABLE TRIGGER trg_validate_positive_amount; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.payroll_records ENABLE TRIGGER trg_validate_payroll_record; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.leave_requests ENABLE TRIGGER trg_validate_leave_request; EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$$;
