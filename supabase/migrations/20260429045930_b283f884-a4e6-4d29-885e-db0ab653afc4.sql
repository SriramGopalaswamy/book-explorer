CREATE TABLE IF NOT EXISTS public.shopify_invoice_map (
  shopify_order_id TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced','error','skipped')),
  sync_error TEXT,
  PRIMARY KEY (shopify_order_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_invoice_map_invoice ON public.shopify_invoice_map(invoice_id);

ALTER TABLE public.shopify_invoice_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view shopify_invoice_map" ON public.shopify_invoice_map;
CREATE POLICY "org members can view shopify_invoice_map" ON public.shopify_invoice_map FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

INSERT INTO public.shopify_invoice_map (shopify_order_id, invoice_id, organization_id, synced_at, sync_status)
SELECT so.shopify_order_id, i.id, so.organization_id, GREATEST(so.synced_at, i.created_at), 'synced'
FROM public.shopify_orders so
JOIN public.invoices i ON i.organization_id = so.organization_id AND i.invoice_number = so.order_number
WHERE so.order_number IS NOT NULL
ON CONFLICT (shopify_order_id, organization_id) DO NOTHING;