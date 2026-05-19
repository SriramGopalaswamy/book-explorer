
-- 1. Atomic credit note generation from sales return
CREATE OR REPLACE FUNCTION public.generate_credit_note_from_sales_return(p_return_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ret RECORD;
  v_org uuid;
  v_user uuid := auth.uid();
  v_cn_id uuid;
  v_cn_number text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT organization_id INTO v_org FROM profiles WHERE user_id = v_user;
  IF v_org IS NULL THEN RAISE EXCEPTION 'NO_ORG_FOR_USER'; END IF;

  SELECT * INTO v_ret FROM sales_returns
   WHERE id = p_return_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALES_RETURN_NOT_FOUND'; END IF;
  IF v_ret.status <> 'approved' THEN
    RAISE EXCEPTION 'SALES_RETURN_NOT_APPROVED: status=%', v_ret.status;
  END IF;
  IF v_ret.credit_note_id IS NOT NULL THEN
    RAISE EXCEPTION 'CREDIT_NOTE_ALREADY_EXISTS';
  END IF;

  v_cn_number := 'CN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  INSERT INTO credit_notes (
    credit_note_number, client_name, customer_id, amount, reason,
    status, issue_date, user_id, organization_id
  ) VALUES (
    v_cn_number, v_ret.customer_name, v_ret.customer_id, v_ret.total_amount,
    'Credit for sales return ' || v_ret.return_number,
    'issued', CURRENT_DATE, v_user, v_org
  ) RETURNING id INTO v_cn_id;

  UPDATE sales_returns SET credit_note_id = v_cn_id, updated_at = now()
   WHERE id = p_return_id;

  RETURN v_cn_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_credit_note_from_sales_return(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.generate_credit_note_from_sales_return(uuid) TO authenticated;

-- 2. Atomic vendor credit generation from purchase return
CREATE OR REPLACE FUNCTION public.generate_vendor_credit_from_purchase_return(p_return_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ret RECORD;
  v_org uuid;
  v_user uuid := auth.uid();
  v_vc_id uuid;
  v_vc_number text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT organization_id INTO v_org FROM profiles WHERE user_id = v_user;
  IF v_org IS NULL THEN RAISE EXCEPTION 'NO_ORG_FOR_USER'; END IF;

  SELECT * INTO v_ret FROM purchase_returns
   WHERE id = p_return_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_RETURN_NOT_FOUND'; END IF;
  IF v_ret.status <> 'approved' THEN
    RAISE EXCEPTION 'PURCHASE_RETURN_NOT_APPROVED: status=%', v_ret.status;
  END IF;
  IF v_ret.vendor_credit_id IS NOT NULL THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_ALREADY_EXISTS';
  END IF;

  v_vc_number := 'VC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  INSERT INTO vendor_credits (
    vendor_credit_number, vendor_name, vendor_id, amount, reason,
    status, issue_date, user_id, organization_id, remaining_amount
  ) VALUES (
    v_vc_number, v_ret.vendor_name, v_ret.vendor_id, v_ret.total_amount,
    'Vendor credit for purchase return ' || v_ret.return_number,
    'issued', CURRENT_DATE, v_user, v_org, v_ret.total_amount
  ) RETURNING id INTO v_vc_id;

  UPDATE purchase_returns SET vendor_credit_id = v_vc_id, updated_at = now()
   WHERE id = p_return_id;

  RETURN v_vc_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_vendor_credit_from_purchase_return(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.generate_vendor_credit_from_purchase_return(uuid) TO authenticated;

-- 3. Bulk vendor payment: one vendor_payment row + N bill_payment_lines, atomic
CREATE OR REPLACE FUNCTION public.process_bulk_vendor_payment(
  p_vendor_id uuid,
  p_payment_date date,
  p_payment_method text,
  p_bank_account_id uuid,
  p_reference_number text,
  p_notes text,
  p_lines jsonb -- [{ bill_id: uuid, amount_applied: numeric }, ...]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_org uuid;
  v_payment_id uuid;
  v_payment_number text;
  v_total numeric := 0;
  v_vendor_name text;
  v_line jsonb;
  v_bill RECORD;
  v_applied numeric;
  v_remaining numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT organization_id INTO v_org FROM profiles WHERE user_id = v_user;
  IF v_org IS NULL THEN RAISE EXCEPTION 'NO_ORG_FOR_USER'; END IF;
  IF p_vendor_id IS NULL THEN RAISE EXCEPTION 'VENDOR_REQUIRED'; END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'NO_LINES';
  END IF;

  SELECT name INTO v_vendor_name FROM vendors
   WHERE id = p_vendor_id AND organization_id = v_org;
  IF v_vendor_name IS NULL THEN RAISE EXCEPTION 'VENDOR_NOT_FOUND'; END IF;

  -- Pre-validate every line belongs to this vendor + org, sum total
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_applied := (v_line->>'amount_applied')::numeric;
    IF v_applied IS NULL OR v_applied <= 0 THEN
      RAISE EXCEPTION 'INVALID_AMOUNT_APPLIED';
    END IF;

    SELECT b.id, b.total_amount, b.status, b.vendor_id,
           COALESCE((SELECT SUM(amount_applied) FROM bill_payment_lines bpl WHERE bpl.bill_id = b.id), 0)
              + COALESCE((SELECT SUM(amount) FROM vendor_payments vp
                          WHERE vp.bill_id = b.id AND vp.status = 'paid'), 0) AS already_paid
      INTO v_bill
      FROM bills b
     WHERE b.id = (v_line->>'bill_id')::uuid
       AND b.organization_id = v_org
       AND b.is_deleted = false;
    IF v_bill.id IS NULL THEN RAISE EXCEPTION 'BILL_NOT_FOUND: %', v_line->>'bill_id'; END IF;
    IF v_bill.vendor_id IS DISTINCT FROM p_vendor_id THEN
      RAISE EXCEPTION 'BILL_VENDOR_MISMATCH: bill %', v_bill.id;
    END IF;
    IF v_bill.status = 'paid' THEN
      RAISE EXCEPTION 'BILL_ALREADY_PAID: %', v_bill.id;
    END IF;
    v_remaining := v_bill.total_amount - v_bill.already_paid;
    IF v_applied > v_remaining + 0.01 THEN
      RAISE EXCEPTION 'BILL_OVERPAID: bill % remaining % applied %', v_bill.id, v_remaining, v_applied;
    END IF;
    v_total := v_total + v_applied;
  END LOOP;

  v_payment_number := 'VP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  INSERT INTO vendor_payments (
    payment_number, vendor_id, vendor_name, payment_date, amount,
    payment_method, reference_number, bank_account_id, notes,
    status, created_by, organization_id
  ) VALUES (
    v_payment_number, p_vendor_id, v_vendor_name, p_payment_date, v_total,
    COALESCE(p_payment_method, 'bank_transfer'), p_reference_number, p_bank_account_id, p_notes,
    'paid', v_user, v_org
  ) RETURNING id INTO v_payment_id;

  -- Insert lines + flip bills to paid where fully covered
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_applied := (v_line->>'amount_applied')::numeric;
    INSERT INTO bill_payment_lines (organization_id, vendor_payment_id, bill_id, amount_applied)
    VALUES (v_org, v_payment_id, (v_line->>'bill_id')::uuid, v_applied);

    SELECT b.total_amount,
           COALESCE((SELECT SUM(amount_applied) FROM bill_payment_lines bpl WHERE bpl.bill_id = b.id), 0)
              + COALESCE((SELECT SUM(amount) FROM vendor_payments vp
                          WHERE vp.bill_id = b.id AND vp.status = 'paid'), 0) AS total_paid
      INTO v_bill
      FROM bills b WHERE b.id = (v_line->>'bill_id')::uuid;

    IF v_bill.total_paid >= v_bill.total_amount - 0.01 THEN
      UPDATE bills SET status = 'paid', updated_at = now()
       WHERE id = (v_line->>'bill_id')::uuid;
    ELSIF v_bill.total_paid > 0 THEN
      UPDATE bills SET status = 'partial', updated_at = now()
       WHERE id = (v_line->>'bill_id')::uuid AND status <> 'paid';
    END IF;
  END LOOP;

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.process_bulk_vendor_payment(uuid,date,text,uuid,text,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.process_bulk_vendor_payment(uuid,date,text,uuid,text,text,jsonb) TO authenticated;
