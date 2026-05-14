DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'invoices','bills','expenses','bank_transactions','payroll_records',
    'profiles','journal_entries','financial_records','chart_of_accounts',
    'invoice_items','scheduled_payments'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS exclude_soft_deleted ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY exclude_soft_deleted ON public.%I AS RESTRICTIVE FOR SELECT USING (deleted_at IS NULL)',
        t
      );
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_org_date_active
  ON public.invoices (organization_id, invoice_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_tx_org_date_type_active
  ON public.bank_transactions (organization_id, transaction_date, transaction_type)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_org_date_active
  ON public.expenses (organization_id, expense_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_org_status_active
  ON public.profiles (organization_id, status)
  WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_items_org_active
  ON public.items (organization_id, is_active);

CREATE OR REPLACE FUNCTION public.get_org_kpi_stats(
  p_org_id uuid, p_period_start date, p_period_end date
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_invoiced', (
      SELECT COALESCE(SUM(COALESCE(total_amount, amount, 0)), 0) FROM invoices
      WHERE organization_id = p_org_id AND deleted_at IS NULL
        AND invoice_date BETWEEN p_period_start AND p_period_end
        AND status <> 'draft'
    ),
    'cash_collected', (
      SELECT COALESCE(SUM(amount), 0) FROM bank_transactions
      WHERE organization_id = p_org_id AND deleted_at IS NULL
        AND transaction_date BETWEEN p_period_start AND p_period_end
        AND transaction_type IN ('credit','deposit','receipt')
    ),
    'total_expenses', (
      SELECT COALESCE(SUM(amount), 0) FROM expenses
      WHERE organization_id = p_org_id AND deleted_at IS NULL
        AND expense_date BETWEEN p_period_start AND p_period_end
    ),
    'reimbursements_paid', (
      SELECT COALESCE(SUM(amount), 0) FROM reimbursement_requests
      WHERE organization_id = p_org_id
        AND status IN ('paid','reimbursed','approved')
        AND expense_date BETWEEN p_period_start AND p_period_end
    ),
    'outstanding_payables', (
      SELECT COALESCE(SUM(COALESCE(total_amount, amount, 0)), 0) FROM bills
      WHERE organization_id = p_org_id AND deleted_at IS NULL
        AND status IN ('pending','approved','partial','overdue','unpaid')
    ),
    'active_employees', (
      SELECT COUNT(*) FROM profiles
      WHERE organization_id = p_org_id AND deleted_at IS NULL AND status = 'active'
    ),
    'pending_leaves', (
      SELECT COUNT(*) FROM leave_requests
      WHERE organization_id = p_org_id AND status = 'pending'
    ),
    'payroll_this_month', (
      SELECT COALESCE(SUM(net_pay), 0) FROM payroll_entries
      WHERE organization_id = p_org_id
        AND created_at >= date_trunc('month', current_date)
        AND created_at <  date_trunc('month', current_date) + interval '1 month'
    ),
    'total_sku_count', (
      SELECT COUNT(*) FROM items WHERE organization_id = p_org_id AND is_active = true
    ),
    'low_stock_count', (
      SELECT COUNT(*) FROM items
      WHERE organization_id = p_org_id AND is_active = true
        AND COALESCE(reorder_level, 0) > 0
        AND COALESCE(current_stock, 0) <= COALESCE(reorder_level, 0)
    ),
    'computed_at', now()
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_org_kpi_stats(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_finance_kpi_stats(
  p_org_id uuid, p_period_start date, p_period_end date
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'invoiced', (
      SELECT COALESCE(SUM(COALESCE(total_amount, amount, 0)), 0) FROM invoices
      WHERE organization_id = p_org_id AND deleted_at IS NULL
        AND invoice_date BETWEEN p_period_start AND p_period_end
        AND status <> 'draft'
    ),
    'collected', (
      SELECT COALESCE(SUM(amount), 0) FROM bank_transactions
      WHERE organization_id = p_org_id AND deleted_at IS NULL
        AND transaction_date BETWEEN p_period_start AND p_period_end
        AND transaction_type IN ('credit','deposit','receipt')
    ),
    'expenses', (
      SELECT COALESCE(SUM(amount), 0) FROM expenses
      WHERE organization_id = p_org_id AND deleted_at IS NULL
        AND expense_date BETWEEN p_period_start AND p_period_end
    ),
    'payables', (
      SELECT COALESCE(SUM(COALESCE(total_amount, amount, 0)), 0) FROM bills
      WHERE organization_id = p_org_id AND deleted_at IS NULL
        AND status IN ('pending','approved','partial','overdue','unpaid')
    ),
    'overdue_invoices', (
      SELECT COUNT(*) FROM invoices
      WHERE organization_id = p_org_id AND deleted_at IS NULL AND status = 'overdue'
    ),
    'computed_at', now()
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_finance_kpi_stats(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_inventory_kpi_stats(p_org_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_skus', (SELECT COUNT(*) FROM items WHERE organization_id = p_org_id AND is_active = true),
    'low_stock', (
      SELECT COUNT(*) FROM items
      WHERE organization_id = p_org_id AND is_active = true
        AND COALESCE(reorder_level, 0) > 0
        AND COALESCE(current_stock, 0) <= COALESCE(reorder_level, 0)
    ),
    'out_of_stock', (
      SELECT COUNT(*) FROM items
      WHERE organization_id = p_org_id AND is_active = true
        AND COALESCE(current_stock, 0) <= 0
    ),
    'stock_value', (
      SELECT COALESCE(SUM(COALESCE(current_stock,0) * COALESCE(selling_price,0)), 0)
      FROM items WHERE organization_id = p_org_id AND is_active = true
    ),
    'computed_at', now()
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_inventory_kpi_stats(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_hrms_kpi_stats(p_org_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'active_employees', (
      SELECT COUNT(*) FROM profiles
      WHERE organization_id = p_org_id AND deleted_at IS NULL AND status = 'active'
    ),
    'on_leave_today', (
      SELECT COUNT(*) FROM leave_requests
      WHERE organization_id = p_org_id AND status = 'approved'
        AND current_date BETWEEN from_date AND to_date
    ),
    'pending_leaves', (
      SELECT COUNT(*) FROM leave_requests
      WHERE organization_id = p_org_id AND status = 'pending'
    ),
    'payroll_this_month', (
      SELECT COALESCE(SUM(net_pay), 0) FROM payroll_entries
      WHERE organization_id = p_org_id
        AND created_at >= date_trunc('month', current_date)
        AND created_at <  date_trunc('month', current_date) + interval '1 month'
    ),
    'computed_at', now()
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_hrms_kpi_stats(uuid) TO authenticated;