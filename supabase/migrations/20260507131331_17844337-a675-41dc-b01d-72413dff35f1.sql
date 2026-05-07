DROP POLICY IF EXISTS "org_sl_select" ON public.stock_ledger;

CREATE POLICY "org_sl_select"
  ON public.stock_ledger FOR SELECT
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_stock_ledger_org_posted
  ON public.stock_ledger (organization_id, posted_at DESC);