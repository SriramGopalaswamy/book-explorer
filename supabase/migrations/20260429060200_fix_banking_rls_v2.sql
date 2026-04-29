-- Corrective migration for banking RLS.
--
-- 20260429060000 dropped the wrong policy names (the original 20260206 names).
-- Migration 20260221134748 had already replaced those with:
--   "Org finance can manage <table>"  — FOR ALL, is_org_admin_or_finance ✓
--   "Users can manage own <table>"    — FOR ALL, auth.uid() = user_id   ✗
-- The second policy remained in force, allowing any user to INSERT/UPDATE/DELETE
-- their own banking rows — defeating the intended finance-only write restriction.
--
-- This migration drops all residual banking policies from both 20260221 and
-- 20260429060000, then creates a clean authoritative set.

-- ── bank_accounts ─────────────────────────────────────────────────────────────

-- From 20260221134748 (not dropped by 20260429060000)
DROP POLICY IF EXISTS "Org finance can manage bank accounts"   ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can manage own bank accounts"     ON public.bank_accounts;

-- From 20260429060000 (added on top, now superseded)
DROP POLICY IF EXISTS "Org members can view bank accounts"            ON public.bank_accounts;
DROP POLICY IF EXISTS "Org admin or finance can insert bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Org admin or finance can update bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Org admin or finance can delete bank accounts" ON public.bank_accounts;

CREATE POLICY "Org members can view bank accounts"
  ON public.bank_accounts FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org admin or finance can write bank accounts"
  ON public.bank_accounts FOR ALL
  USING (is_admin_or_finance_in_org(auth.uid(), organization_id))
  WITH CHECK (is_admin_or_finance_in_org(auth.uid(), organization_id));

-- ── bank_transactions ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Org finance can manage bank transactions"   ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can manage own bank transactions"     ON public.bank_transactions;

DROP POLICY IF EXISTS "Org members can view bank transactions"            ON public.bank_transactions;
DROP POLICY IF EXISTS "Org admin or finance can insert bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Org admin or finance can update bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Org admin or finance can delete bank transactions" ON public.bank_transactions;

CREATE POLICY "Org members can view bank transactions"
  ON public.bank_transactions FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org admin or finance can write bank transactions"
  ON public.bank_transactions FOR ALL
  USING (is_admin_or_finance_in_org(auth.uid(), organization_id))
  WITH CHECK (is_admin_or_finance_in_org(auth.uid(), organization_id));

-- ── scheduled_payments ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Org finance can manage scheduled payments"   ON public.scheduled_payments;
DROP POLICY IF EXISTS "Users can manage own scheduled payments"     ON public.scheduled_payments;

DROP POLICY IF EXISTS "Org members can view scheduled payments"            ON public.scheduled_payments;
DROP POLICY IF EXISTS "Org admin or finance can insert scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Org admin or finance can update scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Org admin or finance can delete scheduled payments" ON public.scheduled_payments;

CREATE POLICY "Org members can view scheduled payments"
  ON public.scheduled_payments FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org admin or finance can write scheduled payments"
  ON public.scheduled_payments FOR ALL
  USING (is_admin_or_finance_in_org(auth.uid(), organization_id))
  WITH CHECK (is_admin_or_finance_in_org(auth.uid(), organization_id));
