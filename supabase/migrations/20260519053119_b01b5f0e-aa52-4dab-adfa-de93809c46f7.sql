
CREATE OR REPLACE FUNCTION public.convert_quote_to_sales_order(p_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_user uuid := auth.uid();
  v_quote RECORD;
  v_so_id uuid;
  v_so_number text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO v_org FROM public.profiles WHERE user_id = v_user;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organization not found for caller' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quote FROM public.quotes
  WHERE id = p_quote_id AND organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found in your organization' USING ERRCODE = 'P0002';
  END IF;

  IF v_quote.status IN ('converted','rejected') THEN
    RAISE EXCEPTION 'Quote is % and cannot be converted', v_quote.status USING ERRCODE = '22023';
  END IF;

  v_so_number := 'SO-' || upper(to_hex(extract(epoch from now())::bigint));

  INSERT INTO public.sales_orders (
    so_number, customer_name, customer_id, order_date, expected_delivery,
    notes, subtotal, tax_amount, total_amount, created_by, organization_id,
    status, quote_id
  ) VALUES (
    v_so_number,
    v_quote.client_name,
    v_quote.customer_id,
    CURRENT_DATE,
    v_quote.due_date,
    v_quote.notes,
    COALESCE(v_quote.subtotal, v_quote.amount, 0),
    COALESCE(v_quote.cgst_total,0) + COALESCE(v_quote.sgst_total,0) + COALESCE(v_quote.igst_total,0),
    COALESCE(v_quote.total_amount, v_quote.amount, 0),
    v_user,
    v_org,
    'draft',
    v_quote.id
  )
  RETURNING id INTO v_so_id;

  INSERT INTO public.sales_order_items (
    sales_order_id, description, quantity, unit_price, tax_rate, amount,
    item_id, organization_id
  )
  SELECT v_so_id,
         qi.description,
         qi.quantity,
         qi.rate,
         COALESCE(qi.cgst_rate,0) + COALESCE(qi.sgst_rate,0) + COALESCE(qi.igst_rate,0),
         qi.amount,
         NULL,
         v_org
  FROM public.quote_items qi
  WHERE qi.quote_id = p_quote_id;

  UPDATE public.quotes SET status = 'converted', updated_at = now()
  WHERE id = p_quote_id AND organization_id = v_org;

  RETURN v_so_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_quote_to_sales_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_sales_order(uuid) TO authenticated;
