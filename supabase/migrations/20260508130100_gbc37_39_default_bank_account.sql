-- ══════════════════════════════════════════════════════════════════════
-- GBC-37 / GBC-39 — auto-pick org's default bank account in RPCs
--
-- mark_expense_paid, approve_reimbursement, record_payment_receipt,
-- record_vendor_payment all require a bank_account_id. The Expenses /
-- Reimbursements UI doesn't (and shouldn't, per audit decision) expose a
-- bank-account picker. This migration:
--
--   1. Defines `_resolve_default_bank_account(p_org_id)` — returns the
--      first ACTIVE bank_account for the org by `created_at`. No
--      `is_default` flag exists on the table, so first-created-active is
--      the deterministic rule.
--   2. Re-declares the 4 affected RPCs so `p_bank_account_id` is
--      NULLABLE; if NULL the helper is called inside the function and
--      the resolved id is used for the bank_transactions insert.
--      If the org has zero active bank_accounts the RPC raises a clear
--      error instead of inserting NULL into bank_transactions.account_id.
--
-- The helper is SECURITY DEFINER so it can read bank_accounts past RLS
-- on behalf of the calling RPC (which itself enforces org context via
-- public.get_user_organization_id(auth.uid())).
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._resolve_default_bank_account(p_org_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT id
  FROM public.bank_accounts
  WHERE organization_id = p_org_id
    AND status = 'Active'
  ORDER BY created_at ASC
  LIMIT 1
$$;

-- ── mark_expense_paid: make p_bank_account_id optional ────────────────
CREATE OR REPLACE FUNCTION public.mark_expense_paid(
  p_expense_id      uuid,
  p_payment_method  text,
  p_bank_account_id uuid DEFAULT NULL,
  p_reference       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org    uuid := public.get_user_organization_id(auth.uid());
  v_exp    RECORD;
  v_bank   uuid := p_bank_account_id;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;

  SELECT * INTO v_exp FROM public.expenses WHERE id = p_expense_id;
  IF v_exp.id IS NULL THEN RAISE EXCEPTION 'Expense % not found', p_expense_id; END IF;
  IF v_exp.organization_id IS NOT NULL AND v_exp.organization_id <> v_org THEN
    RAISE EXCEPTION 'Cross-tenant access denied';
  END IF;
  IF v_exp.status = 'paid' THEN RETURN p_expense_id; END IF;

  IF v_bank IS NULL THEN
    v_bank := public._resolve_default_bank_account(v_org);
    IF v_bank IS NULL THEN
      RAISE EXCEPTION 'No active bank account in this organization. Configure one in Settings → Banking.';
    END IF;
  END IF;

  UPDATE public.expenses
     SET status = 'paid', updated_at = now()
   WHERE id = p_expense_id;

  INSERT INTO public.bank_transactions
    (organization_id, user_id, account_id, transaction_date, transaction_type,
     amount, description, category, reference)
  VALUES
    (v_org, COALESCE(v_exp.user_id, auth.uid()), v_bank, CURRENT_DATE, 'debit',
     v_exp.amount, COALESCE('Expense paid: ' || v_exp.description, 'Expense payment'),
     COALESCE(v_exp.category, 'Expense'),
     COALESCE(p_reference, p_expense_id::text));

  RETURN p_expense_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_expense_paid(uuid, text, uuid, text) TO authenticated;

-- ── approve_reimbursement: make p_bank_account_id optional ────────────
-- Accepts optional p_finance_notes and p_category so the dialog inputs
-- (finance reviewer's note, optional reclassification) are persisted on
-- both the reimbursement_requests row and the derived expense row.
CREATE OR REPLACE FUNCTION public.approve_reimbursement(
  p_reimbursement_id uuid,
  p_bank_account_id  uuid DEFAULT NULL,
  p_reference        text DEFAULT NULL,
  p_finance_notes    text DEFAULT NULL,
  p_category         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org    uuid := public.get_user_organization_id(auth.uid());
  v_req    RECORD;
  v_exp_id uuid;
  v_bank   uuid := p_bank_account_id;
  v_cat    text;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;

  SELECT * INTO v_req FROM public.reimbursement_requests WHERE id = p_reimbursement_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Reimbursement % not found', p_reimbursement_id; END IF;
  IF v_req.status = 'paid' THEN RETURN p_reimbursement_id; END IF;

  IF v_bank IS NULL THEN
    v_bank := public._resolve_default_bank_account(v_org);
    IF v_bank IS NULL THEN
      RAISE EXCEPTION 'No active bank account in this organization. Configure one in Settings → Banking.';
    END IF;
  END IF;

  v_cat := COALESCE(NULLIF(p_category, ''), v_req.category, 'Reimbursement');

  -- 1. Create the derived expense row (so it shows in HRMS expenses list).
  INSERT INTO public.expenses
    (user_id, organization_id, category, amount, description, expense_date, status, notes)
  VALUES
    (v_req.user_id, v_org, v_cat, v_req.amount,
     COALESCE(v_req.description, v_req.vendor_name, 'Reimbursement'),
     COALESCE(v_req.expense_date, CURRENT_DATE), 'paid',
     p_finance_notes)
  RETURNING id INTO v_exp_id;

  -- 2. Mark the reimbursement paid + record reviewer metadata.
  UPDATE public.reimbursement_requests
     SET status = 'paid',
         expense_id = v_exp_id,
         finance_notes = COALESCE(p_finance_notes, finance_notes),
         finance_reviewed_at = now(),
         finance_reviewed_by = auth.uid(),
         updated_at = now()
   WHERE id = p_reimbursement_id;

  -- 3. Cash leg.
  INSERT INTO public.bank_transactions
    (organization_id, user_id, account_id, transaction_date, transaction_type,
     amount, description, category, reference)
  VALUES
    (v_org, v_req.user_id, v_bank, CURRENT_DATE, 'debit',
     v_req.amount, 'Reimbursement: ' || COALESCE(v_req.vendor_name, 'employee'),
     v_cat,
     COALESCE(p_reference, v_exp_id::text));

  RETURN p_reimbursement_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_reimbursement(uuid, uuid, text, text, text) TO authenticated;

-- ── record_payment_receipt / record_vendor_payment: make p_bank_account_id optional ──
CREATE OR REPLACE FUNCTION public.record_payment_receipt(
  p_invoice_id      uuid,
  p_amount          numeric,
  p_payment_method  text,
  p_bank_account_id uuid DEFAULT NULL,
  p_reference       text DEFAULT NULL,
  p_payment_date    date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org         uuid := public.get_user_organization_id(auth.uid());
  v_inv         RECORD;
  v_receipt_id  uuid;
  v_receipt_num text;
  v_paid_total  numeric;
  v_bank        uuid := p_bank_account_id;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.organization_id <> v_org THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;

  v_paid_total := COALESCE(
    (SELECT SUM(amount) FROM public.payment_receipts
      WHERE organization_id = v_org AND invoice_id = p_invoice_id
        AND status NOT IN ('cancelled', 'reversed')), 0);
  IF v_paid_total + p_amount > COALESCE(v_inv.total_amount, v_inv.amount, 0) + 0.01 THEN
    RAISE EXCEPTION 'Overpayment: invoice total %, already paid %, attempted %',
      v_inv.total_amount, v_paid_total, p_amount;
  END IF;

  IF v_bank IS NULL THEN
    v_bank := public._resolve_default_bank_account(v_org);
    IF v_bank IS NULL THEN
      RAISE EXCEPTION 'No active bank account in this organization. Configure one in Settings → Banking.';
    END IF;
  END IF;

  v_receipt_num := 'PR-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' ||
                   substring(replace(p_invoice_id::text, '-', '') from 1 for 6);

  INSERT INTO public.payment_receipts
    (organization_id, receipt_number, customer_id, customer_name, invoice_id,
     payment_date, amount, payment_method, reference_number, bank_account_id,
     status, created_by)
  VALUES
    (v_org, v_receipt_num, v_inv.customer_id,
     COALESCE(v_inv.client_name, 'Customer'), p_invoice_id,
     p_payment_date, p_amount, p_payment_method, p_reference,
     v_bank, 'received', auth.uid())
  RETURNING id INTO v_receipt_id;

  UPDATE public.invoices SET
    status = CASE
      WHEN v_paid_total + p_amount >= COALESCE(total_amount, amount, 0) THEN 'paid'
      ELSE 'partially_paid'
    END,
    updated_at = now()
   WHERE id = p_invoice_id;

  INSERT INTO public.bank_transactions
    (organization_id, user_id, account_id, transaction_date, transaction_type,
     amount, description, category, reference)
  VALUES
    (v_org, auth.uid(), v_bank, p_payment_date, 'credit',
     p_amount, 'Receipt for ' || v_inv.invoice_number,
     'Invoice Payment',
     COALESCE(p_reference, v_receipt_num));

  RETURN v_receipt_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_payment_receipt(uuid, numeric, text, uuid, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_vendor_payment(
  p_bill_id         uuid,
  p_amount          numeric,
  p_payment_method  text,
  p_bank_account_id uuid DEFAULT NULL,
  p_reference       text DEFAULT NULL,
  p_payment_date    date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org        uuid := public.get_user_organization_id(auth.uid());
  v_bill       RECORD;
  v_pay_id     uuid;
  v_pay_num    text;
  v_paid_total numeric;
  v_bank       uuid := p_bank_account_id;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

  SELECT * INTO v_bill FROM public.bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL THEN RAISE EXCEPTION 'Bill % not found', p_bill_id; END IF;
  IF v_bill.organization_id <> v_org THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;

  v_paid_total := COALESCE(
    (SELECT SUM(amount) FROM public.vendor_payments
      WHERE organization_id = v_org AND bill_id = p_bill_id
        AND status NOT IN ('cancelled', 'reversed')), 0);
  IF v_paid_total + p_amount > COALESCE(v_bill.total_amount, v_bill.amount, 0) + 0.01 THEN
    RAISE EXCEPTION 'Overpayment: bill total %, already paid %, attempted %',
      v_bill.total_amount, v_paid_total, p_amount;
  END IF;

  IF v_bank IS NULL THEN
    v_bank := public._resolve_default_bank_account(v_org);
    IF v_bank IS NULL THEN
      RAISE EXCEPTION 'No active bank account in this organization. Configure one in Settings → Banking.';
    END IF;
  END IF;

  v_pay_num := 'VP-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' ||
               substring(replace(p_bill_id::text, '-', '') from 1 for 6);

  INSERT INTO public.vendor_payments
    (organization_id, payment_number, vendor_id, vendor_name, bill_id,
     payment_date, amount, payment_method, reference_number, bank_account_id,
     status, created_by)
  VALUES
    (v_org, v_pay_num, v_bill.vendor_id,
     COALESCE(v_bill.vendor_name, 'Vendor'), p_bill_id,
     p_payment_date, p_amount, p_payment_method, p_reference,
     v_bank, 'paid', auth.uid())
  RETURNING id INTO v_pay_id;

  UPDATE public.bills SET
    status = CASE
      WHEN v_paid_total + p_amount >= COALESCE(total_amount, amount, 0) THEN 'paid'
      ELSE 'partially_paid'
    END,
    updated_at = now()
   WHERE id = p_bill_id;

  INSERT INTO public.bank_transactions
    (organization_id, user_id, account_id, transaction_date, transaction_type,
     amount, description, category, reference)
  VALUES
    (v_org, auth.uid(), v_bank, p_payment_date, 'debit',
     p_amount, 'Vendor payment for ' || v_bill.bill_number,
     'Bill Payment',
     COALESCE(p_reference, v_pay_num));

  RETURN v_pay_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_vendor_payment(uuid, numeric, text, uuid, text, date) TO authenticated;
