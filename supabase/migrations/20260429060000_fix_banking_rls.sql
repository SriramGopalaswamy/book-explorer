-- Fix banking RLS: bank_accounts, bank_transactions, scheduled_payments were
-- created (20260206) with user-scoped RLS (auth.uid() = user_id).
-- organization_id was added and backfilled in 20260220 but RLS was never updated.
-- Finance and admin staff access these as company accounts, so RLS must be
-- org-scoped, not user-scoped.

-- ── bank_accounts ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view their own bank accounts"   ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can create their own bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can update their own bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can delete their own bank accounts" ON public.bank_accounts;

CREATE POLICY "Org members can view bank accounts"
  ON public.bank_accounts FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org admin or finance can insert bank accounts"
  ON public.bank_accounts FOR INSERT
  WITH CHECK (is_admin_or_finance_in_org(auth.uid(), organization_id));

CREATE POLICY "Org admin or finance can update bank accounts"
  ON public.bank_accounts FOR UPDATE
  USING (is_admin_or_finance_in_org(auth.uid(), organization_id));

CREATE POLICY "Org admin or finance can delete bank accounts"
  ON public.bank_accounts FOR DELETE
  USING (is_admin_or_finance_in_org(auth.uid(), organization_id));

-- ── bank_transactions ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view their own transactions"   ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can create their own transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can update their own transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can delete their own transactions" ON public.bank_transactions;

CREATE POLICY "Org members can view bank transactions"
  ON public.bank_transactions FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org admin or finance can insert bank transactions"
  ON public.bank_transactions FOR INSERT
  WITH CHECK (is_admin_or_finance_in_org(auth.uid(), organization_id));

CREATE POLICY "Org admin or finance can update bank transactions"
  ON public.bank_transactions FOR UPDATE
  USING (is_admin_or_finance_in_org(auth.uid(), organization_id));

CREATE POLICY "Org admin or finance can delete bank transactions"
  ON public.bank_transactions FOR DELETE
  USING (is_admin_or_finance_in_org(auth.uid(), organization_id));

-- ── scheduled_payments ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view their own scheduled payments"   ON public.scheduled_payments;
DROP POLICY IF EXISTS "Users can create their own scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Users can update their own scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Users can delete their own scheduled payments" ON public.scheduled_payments;

CREATE POLICY "Org members can view scheduled payments"
  ON public.scheduled_payments FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org admin or finance can insert scheduled payments"
  ON public.scheduled_payments FOR INSERT
  WITH CHECK (is_admin_or_finance_in_org(auth.uid(), organization_id));

CREATE POLICY "Org admin or finance can update scheduled payments"
  ON public.scheduled_payments FOR UPDATE
  USING (is_admin_or_finance_in_org(auth.uid(), organization_id));

CREATE POLICY "Org admin or finance can delete scheduled payments"
  ON public.scheduled_payments FOR DELETE
  USING (is_admin_or_finance_in_org(auth.uid(), organization_id));

-- ── Backfill sentinel org_id rows ────────────────────────────────────────────
-- Any rows whose organization_id is still the sentinel from the 20260220 backfill
-- need to be corrected to the real org. The sentinel UUID resolves to the only
-- org created in that migration (GRX10 Solutions, same UUID), so existing data
-- is already correct for single-org deployments. No action needed here until
-- multi-org support is added.
