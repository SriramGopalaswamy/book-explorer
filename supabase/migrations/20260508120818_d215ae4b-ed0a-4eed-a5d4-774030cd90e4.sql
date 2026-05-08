-- Performance indexes for hot list queries (organization_id + sort key)
CREATE INDEX IF NOT EXISTS idx_sales_orders_org_created ON public.sales_orders (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_orders_org_status ON public.sales_orders (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_items_org_name ON public.items (organization_id, name);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_org_created ON public.stock_adjustments (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_e_invoices_org_created ON public.e_invoices (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bill_of_materials_org_created ON public.bill_of_materials (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_orders_org_created ON public.work_orders (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_orders_org_status ON public.work_orders (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_org_created ON public.approval_workflows (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_org_created ON public.approval_requests (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_org_status ON public.approval_requests (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_org_created ON public.stock_transfers (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_picking_lists_org_created ON public.picking_lists (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_org_created ON public.inventory_counts (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_org_eff ON public.exchange_rates (organization_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_org_date ON public.bank_transactions (organization_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_eway_bills_org_created ON public.eway_bills (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_org_posted ON public.stock_ledger (organization_id, posted_at DESC);