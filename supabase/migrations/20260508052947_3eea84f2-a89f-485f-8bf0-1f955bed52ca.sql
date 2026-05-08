
CREATE OR REPLACE FUNCTION public.create_invoice_with_lines(
  p_header jsonb,
  p_lines  jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_id uuid;
  v_line jsonb;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    RAISE EXCEPTION 'p_header must be a JSON object';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'p_lines must be a JSON array';
  END IF;

  INSERT INTO public.invoices (
    organization_id, user_id, invoice_number, client_name, client_email,
    customer_id, customer_gstin, place_of_supply, payment_terms,
    invoice_date, due_date, currency_code, exchange_rate,
    subtotal, cgst_total, sgst_total, igst_total, total_amount, amount,
    notes, status
  )
  VALUES (
    v_org, auth.uid(),
    p_header->>'invoice_number',
    p_header->>'client_name',
    p_header->>'client_email',
    NULLIF(p_header->>'customer_id','')::uuid,
    p_header->>'customer_gstin',
    p_header->>'place_of_supply',
    p_header->>'payment_terms',
    NULLIF(p_header->>'invoice_date','')::date,
    NULLIF(p_header->>'due_date','')::date,
    COALESCE(p_header->>'currency_code','INR'),
    COALESCE(NULLIF(p_header->>'exchange_rate','')::numeric, 1),
    COALESCE(NULLIF(p_header->>'subtotal','')::numeric, 0),
    COALESCE(NULLIF(p_header->>'cgst_total','')::numeric, 0),
    COALESCE(NULLIF(p_header->>'sgst_total','')::numeric, 0),
    COALESCE(NULLIF(p_header->>'igst_total','')::numeric, 0),
    COALESCE(NULLIF(p_header->>'total_amount','')::numeric, 0),
    COALESCE(NULLIF(p_header->>'total_amount','')::numeric, 0),
    p_header->>'notes',
    COALESCE(p_header->>'status','draft')
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id, description, quantity, rate, amount,
      hsn_sac, cgst_rate, sgst_rate, igst_rate,
      cgst_amount, sgst_amount, igst_amount
    ) VALUES (
      v_id,
      v_line->>'description',
      COALESCE(NULLIF(v_line->>'quantity','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'rate','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'amount','')::numeric, 0),
      v_line->>'hsn_sac',
      COALESCE(NULLIF(v_line->>'cgst_rate','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'sgst_rate','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'igst_rate','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'cgst_amount','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'sgst_amount','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'igst_amount','')::numeric, 0)
    );
  END LOOP;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_invoice_with_lines(jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_invoice_with_lines(
  p_invoice_id uuid,
  p_header jsonb,
  p_lines jsonb,
  p_expected_version int DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_current_version int;
  v_inv_org uuid;
  v_line jsonb;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;

  SELECT organization_id, version INTO v_inv_org, v_current_version
    FROM public.invoices WHERE id = p_invoice_id;

  IF v_inv_org IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;
  IF v_inv_org <> v_org THEN
    RAISE EXCEPTION 'Cross-tenant access denied';
  END IF;
  IF p_expected_version IS NOT NULL AND v_current_version IS NOT NULL
     AND p_expected_version <> v_current_version THEN
    RAISE EXCEPTION 'Version conflict (expected %, found %)', p_expected_version, v_current_version
      USING ERRCODE = 'serialization_failure';
  END IF;

  UPDATE public.invoices SET
    invoice_number = COALESCE(p_header->>'invoice_number', invoice_number),
    client_name    = COALESCE(p_header->>'client_name', client_name),
    client_email   = COALESCE(p_header->>'client_email', client_email),
    customer_id    = COALESCE(NULLIF(p_header->>'customer_id','')::uuid, customer_id),
    customer_gstin = COALESCE(p_header->>'customer_gstin', customer_gstin),
    place_of_supply= COALESCE(p_header->>'place_of_supply', place_of_supply),
    payment_terms  = COALESCE(p_header->>'payment_terms', payment_terms),
    invoice_date   = COALESCE(NULLIF(p_header->>'invoice_date','')::date, invoice_date),
    due_date       = COALESCE(NULLIF(p_header->>'due_date','')::date, due_date),
    currency_code  = COALESCE(p_header->>'currency_code', currency_code),
    exchange_rate  = COALESCE(NULLIF(p_header->>'exchange_rate','')::numeric, exchange_rate),
    subtotal       = COALESCE(NULLIF(p_header->>'subtotal','')::numeric, subtotal),
    cgst_total     = COALESCE(NULLIF(p_header->>'cgst_total','')::numeric, cgst_total),
    sgst_total     = COALESCE(NULLIF(p_header->>'sgst_total','')::numeric, sgst_total),
    igst_total     = COALESCE(NULLIF(p_header->>'igst_total','')::numeric, igst_total),
    total_amount   = COALESCE(NULLIF(p_header->>'total_amount','')::numeric, total_amount),
    amount         = COALESCE(NULLIF(p_header->>'total_amount','')::numeric, amount),
    notes          = COALESCE(p_header->>'notes', notes),
    status         = COALESCE(p_header->>'status', status),
    updated_at     = now()
  WHERE id = p_invoice_id;

  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO public.invoice_items (
        invoice_id, description, quantity, rate, amount,
        hsn_sac, cgst_rate, sgst_rate, igst_rate,
        cgst_amount, sgst_amount, igst_amount
      ) VALUES (
        p_invoice_id,
        v_line->>'description',
        COALESCE(NULLIF(v_line->>'quantity','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'rate','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'amount','')::numeric, 0),
        v_line->>'hsn_sac',
        COALESCE(NULLIF(v_line->>'cgst_rate','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'sgst_rate','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'igst_rate','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'cgst_amount','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'sgst_amount','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'igst_amount','')::numeric, 0)
      );
    END LOOP;
  END IF;

  RETURN p_invoice_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_invoice_with_lines(uuid, jsonb, jsonb, int) TO authenticated;
