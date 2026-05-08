
-- Trigram indexes for PO ILIKE searches (mirror of invoice trigram indexes from phase 1)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number_trgm
  ON public.purchase_orders USING gin (po_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_name_trgm
  ON public.purchase_orders USING gin (vendor_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_status
  ON public.purchase_orders (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_created
  ON public.purchase_orders (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number_trgm
  ON public.invoices USING gin (invoice_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoices_client_name_trgm
  ON public.invoices USING gin (client_name gin_trgm_ops);

-- KPI aggregator: computes totals over the FULL invoice history for a tenant
-- without dragging rows to the client. Effectively-overdue = sent/overdue past due_date.
CREATE OR REPLACE FUNCTION public.get_invoice_kpis(p_org_id uuid)
RETURNS TABLE (
  total_outstanding numeric,
  total_paid numeric,
  overdue_count bigint,
  draft_count bigint,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(amount) FILTER (
      WHERE status IN ('sent','overdue')
         OR (status NOT IN ('paid','draft','cancelled') AND due_date < CURRENT_DATE)
    ), 0)::numeric AS total_outstanding,
    COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::numeric AS total_paid,
    COUNT(*) FILTER (
      WHERE status = 'overdue'
         OR (status IN ('sent','acknowledged','dispute') AND due_date < CURRENT_DATE)
    )::bigint AS overdue_count,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint AS draft_count,
    COUNT(*)::bigint AS total_count
  FROM public.invoices
  WHERE organization_id = p_org_id
    AND organization_id = public.get_user_org(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_kpis(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_purchase_order_kpis(p_org_id uuid)
RETURNS TABLE (
  total_count bigint,
  draft_count bigint,
  submitted_count bigint,
  received_count bigint,
  total_value numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_count,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint AS draft_count,
    COUNT(*) FILTER (WHERE status = 'submitted')::bigint AS submitted_count,
    COUNT(*) FILTER (WHERE status IN ('received','partially_received'))::bigint AS received_count,
    COALESCE(SUM(total_amount), 0)::numeric AS total_value
  FROM public.purchase_orders
  WHERE organization_id = p_org_id
    AND organization_id = public.get_user_org(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_purchase_order_kpis(uuid) TO authenticated;
