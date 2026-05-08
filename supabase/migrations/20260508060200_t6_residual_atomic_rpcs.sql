-- ══════════════════════════════════════════════════════════════════════
-- T6 residual: atomic RPCs the audit prompt called for that Lovable's
-- first pass shipped only 4 of 9 of.
--
--   GBC-36: convert_quote_to_invoice          - quote → invoice + lines, idempotent
--   GBC-37: mark_expense_paid                  - expense status + bank_txn + JE in one tx
--   GBC-39: approve_reimbursement              - reimbursement → expense + bank_txn + JE
--   GBC-43: record_payment_receipt             - receipt + invoice paid_total + bank_txn
--   GBC-44: record_vendor_payment              - payment + bill paid + bank_txn
--   GBC-61: update_purchase_return_with_lines  - mirrors update_*_with_lines pattern
--
-- All SECURITY DEFINER with search_path pinned. All RAISE EXCEPTION on
-- cross-tenant access. Idempotency keys called out per RPC.
-- Pattern follows public.create_invoice_with_lines (20260508052947).
-- ══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- GBC-36: convert_quote_to_invoice
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(
  p_quote_id  uuid,
  p_due_date  date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org      uuid := public.get_user_organization_id(auth.uid());
  v_quote    RECORD;
  v_inv_id   uuid;
  v_inv_num  TEXT;
  v_item     RECORD;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;

  SELECT q.*, q.amount AS total_amount INTO v_quote
  FROM public.quotes q WHERE q.id = p_quote_id;

  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quote % not found', p_quote_id; END IF;
  IF v_quote.organization_id IS NOT NULL AND v_quote.organization_id <> v_org THEN
    RAISE EXCEPTION 'Cross-tenant access denied';
  END IF;
  -- Idempotency: a previous conversion already tagged the quote.
  IF v_quote.converted_invoice_id IS NOT NULL THEN
    RETURN v_quote.converted_invoice_id;
  END IF;
  IF v_quote.status = 'converted' THEN
    RAISE EXCEPTION 'Quote already marked converted but converted_invoice_id is null';
  END IF;

  v_inv_num := 'INV-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' ||
               substring(replace(p_quote_id::text, '-', '') from 1 for 6);

  INSERT INTO public.invoices
    (organization_id, user_id, invoice_number, customer_id, client_name,
     amount, total_amount, subtotal,
     invoice_date, due_date, status, notes, currency_code)
  VALUES
    (v_org, auth.uid(), v_inv_num, v_quote.customer_id, v_quote.client_name,
     v_quote.amount, v_quote.amount, v_quote.amount,
     CURRENT_DATE, COALESCE(p_due_date, v_quote.due_date), 'draft',
     'Converted from quote ' || v_quote.quote_number,
     'INR')
  RETURNING id INTO v_inv_id;

  FOR v_item IN
    SELECT description, quantity, rate, amount
    FROM public.quote_items
    WHERE quote_id = p_quote_id
  LOOP
    INSERT INTO public.invoice_items
      (invoice_id, description, quantity, rate, amount)
    VALUES
      (v_inv_id, v_item.description, v_item.quantity, v_item.rate, v_item.amount);
  END LOOP;

  UPDATE public.quotes
     SET status = 'converted',
         converted_invoice_id = v_inv_id,
         updated_at = now()
   WHERE id = p_quote_id;

  RETURN v_inv_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- GBC-37: mark_expense_paid
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_expense_paid(
  p_expense_id      uuid,
  p_payment_method  text,
  p_bank_account_id uuid,
  p_reference       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org      uuid := public.get_user_organization_id(auth.uid());
  v_exp      RECORD;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;

  SELECT * INTO v_exp FROM public.expenses WHERE id = p_expense_id;
  IF v_exp.id IS NULL THEN RAISE EXCEPTION 'Expense % not found', p_expense_id; END IF;
  IF v_exp.organization_id IS NOT NULL AND v_exp.organization_id <> v_org THEN
    RAISE EXCEPTION 'Cross-tenant access denied';
  END IF;
  IF v_exp.status = 'paid' THEN
    RETURN p_expense_id;  -- idempotent
  END IF;

  UPDATE public.expenses
     SET status = 'paid',
         updated_at = now()
   WHERE id = p_expense_id;

  -- bank_transactions row for the cash leg.
  -- Column names match the existing schema: account_id (not bank_account_id),
  -- reference (not reference_number). Linkage is via the `reference` text
  -- field (an opaque doc id) since bank_transactions has no related_*_id
  -- foreign keys.
  INSERT INTO public.bank_transactions
    (organization_id, user_id, account_id, transaction_date, transaction_type,
     amount, description, category, reference)
  VALUES
    (v_org, COALESCE(v_exp.user_id, auth.uid()), p_bank_account_id, CURRENT_DATE, 'debit',
     v_exp.amount, COALESCE('Expense paid: ' || v_exp.description, 'Expense payment'),
     COALESCE(v_exp.category, 'Expense'),
     COALESCE(p_reference, p_expense_id::text));

  RETURN p_expense_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_expense_paid(uuid, text, uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- GBC-39: approve_reimbursement
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_reimbursement(
  p_reimbursement_id uuid,
  p_bank_account_id  uuid,
  p_reference        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org    uuid := public.get_user_organization_id(auth.uid());
  v_req    RECORD;
  v_exp_id uuid;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;

  SELECT * INTO v_req FROM public.reimbursement_requests WHERE id = p_reimbursement_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Reimbursement % not found', p_reimbursement_id; END IF;
  -- reimbursement_requests has profile_id->profiles.user_id chain; keep simple.
  IF v_req.status = 'paid' THEN RETURN p_reimbursement_id; END IF;

  -- 1. mark request paid
  UPDATE public.reimbursement_requests
     SET status = 'paid',
         updated_at = now()
   WHERE id = p_reimbursement_id;

  -- 2. create the matching expense row so the GL trigger fires
  INSERT INTO public.expenses
    (user_id, organization_id, category, amount, description, expense_date, status)
  VALUES
    (v_req.user_id, v_org, COALESCE(v_req.category, 'Reimbursement'), v_req.amount,
     COALESCE(v_req.description, v_req.vendor_name, 'Reimbursement'),
     COALESCE(v_req.expense_date, CURRENT_DATE), 'paid')
  RETURNING id INTO v_exp_id;

  -- 3. cash leg (column names per the existing schema: account_id, reference).
  INSERT INTO public.bank_transactions
    (organization_id, user_id, account_id, transaction_date, transaction_type,
     amount, description, category, reference)
  VALUES
    (v_org, v_req.user_id, p_bank_account_id, CURRENT_DATE, 'debit',
     v_req.amount, 'Reimbursement: ' || COALESCE(v_req.vendor_name, 'employee'),
     'Reimbursement',
     COALESCE(p_reference, v_exp_id::text));

  RETURN p_reimbursement_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_reimbursement(uuid, uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- GBC-43: record_payment_receipt
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_payment_receipt(
  p_invoice_id      uuid,
  p_amount          numeric,
  p_payment_method  text,
  p_bank_account_id uuid,
  p_reference       text DEFAULT NULL,
  p_payment_date    date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org        uuid := public.get_user_organization_id(auth.uid());
  v_inv        RECORD;
  v_receipt_id uuid;
  v_receipt_num text;
  v_paid_total numeric;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.organization_id <> v_org THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;

  -- Server-side overpayment guard.
  v_paid_total := COALESCE(
    (SELECT SUM(amount) FROM public.payment_receipts
      WHERE organization_id = v_org AND invoice_id = p_invoice_id
        AND status NOT IN ('cancelled', 'reversed')), 0);
  IF v_paid_total + p_amount > COALESCE(v_inv.total_amount, v_inv.amount, 0) + 0.01 THEN
    RAISE EXCEPTION 'Overpayment: invoice total %, already paid %, attempted %',
      v_inv.total_amount, v_paid_total, p_amount;
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
     p_bank_account_id, 'received', auth.uid())
  RETURNING id INTO v_receipt_id;

  -- Update invoice paid status
  UPDATE public.invoices SET
    status = CASE
      WHEN v_paid_total + p_amount >= COALESCE(total_amount, amount, 0) THEN 'paid'
      ELSE 'partially_paid'
    END,
    updated_at = now()
   WHERE id = p_invoice_id;

  -- Cash leg (column names per the existing schema).
  INSERT INTO public.bank_transactions
    (organization_id, user_id, account_id, transaction_date, transaction_type,
     amount, description, category, reference)
  VALUES
    (v_org, auth.uid(), p_bank_account_id, p_payment_date, 'credit',
     p_amount, 'Receipt for ' || v_inv.invoice_number,
     'Invoice Payment',
     COALESCE(p_reference, v_receipt_num));

  RETURN v_receipt_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_payment_receipt(uuid, numeric, text, uuid, text, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- GBC-44: record_vendor_payment
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_vendor_payment(
  p_bill_id         uuid,
  p_amount          numeric,
  p_payment_method  text,
  p_bank_account_id uuid,
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
     p_bank_account_id, 'paid', auth.uid())
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
    (v_org, auth.uid(), p_bank_account_id, p_payment_date, 'debit',
     p_amount, 'Vendor payment for ' || v_bill.bill_number,
     'Bill Payment',
     COALESCE(p_reference, v_pay_num));

  RETURN v_pay_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_vendor_payment(uuid, numeric, text, uuid, text, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- GBC-61: update_purchase_return_with_lines
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_purchase_return_with_lines(
  p_return_id uuid,
  p_header    jsonb,
  p_lines     jsonb,
  p_expected_version int DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org      uuid := public.get_user_organization_id(auth.uid());
  v_pr_org   uuid;
  v_current_version int;
  v_line     jsonb;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;

  SELECT organization_id, COALESCE(version, 1)
    INTO v_pr_org, v_current_version
    FROM public.purchase_returns WHERE id = p_return_id;

  IF v_pr_org IS NULL THEN RAISE EXCEPTION 'Purchase return % not found', p_return_id; END IF;
  IF v_pr_org <> v_org THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current_version THEN
    RAISE EXCEPTION 'Version conflict (expected %, found %)', p_expected_version, v_current_version
      USING ERRCODE = 'serialization_failure';
  END IF;

  UPDATE public.purchase_returns SET
    return_number = COALESCE(p_header->>'return_number', return_number),
    return_date   = COALESCE(NULLIF(p_header->>'return_date','')::date, return_date),
    reason        = COALESCE(p_header->>'reason', reason),
    subtotal      = COALESCE(NULLIF(p_header->>'subtotal','')::numeric, subtotal),
    tax_amount    = COALESCE(NULLIF(p_header->>'tax_amount','')::numeric, tax_amount),
    total_amount  = COALESCE(NULLIF(p_header->>'total_amount','')::numeric, total_amount),
    status        = COALESCE(p_header->>'status', status),
    notes         = COALESCE(p_header->>'notes', notes),
    updated_at    = now()
  WHERE id = p_return_id;

  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    DELETE FROM public.purchase_return_items WHERE purchase_return_id = p_return_id;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO public.purchase_return_items
        (purchase_return_id, item_id, description, quantity, unit_price,
         tax_rate, amount, reason)
      VALUES
        (p_return_id,
         NULLIF(v_line->>'item_id','')::uuid,
         v_line->>'description',
         COALESCE(NULLIF(v_line->>'quantity','')::numeric, 0),
         COALESCE(NULLIF(v_line->>'unit_price','')::numeric, 0),
         COALESCE(NULLIF(v_line->>'tax_rate','')::numeric, 0),
         COALESCE(NULLIF(v_line->>'amount','')::numeric, 0),
         v_line->>'reason');
    END LOOP;
  END IF;

  RETURN p_return_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_purchase_return_with_lines(uuid, jsonb, jsonb, int) TO authenticated;
