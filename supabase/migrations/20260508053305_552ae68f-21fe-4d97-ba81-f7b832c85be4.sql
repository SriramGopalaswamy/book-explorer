
-- ============================================================
-- T7: Attach status-transition trigger to header tables
-- ============================================================
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices','bills','sales_orders','purchase_orders','quotes',
    'credit_notes','delivery_notes','goods_receipts','journal_entries',
    'expenses','stock_adjustments','stock_transfers','picking_lists'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_log_status_transition ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_log_status_transition
         AFTER UPDATE OF status ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.log_status_transition()',
      t
    );
  END LOOP;
END
$do$;

-- ============================================================
-- T6: Bills RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_bill_with_lines(p_header jsonb, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_id uuid; v_line jsonb;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF jsonb_typeof(p_header) <> 'object' OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;

  INSERT INTO public.bills (
    organization_id, user_id, vendor_id, bill_number, vendor_name,
    amount, tax_amount, total_amount, bill_date, due_date, status,
    notes, currency_code, exchange_rate, tds_section, tds_rate,
    purchase_order_id, goods_receipt_id
  ) VALUES (
    v_org, auth.uid(),
    NULLIF(p_header->>'vendor_id','')::uuid,
    p_header->>'bill_number',
    p_header->>'vendor_name',
    COALESCE(NULLIF(p_header->>'amount','')::numeric, 0),
    COALESCE(NULLIF(p_header->>'tax_amount','')::numeric, 0),
    COALESCE(NULLIF(p_header->>'total_amount','')::numeric, 0),
    NULLIF(p_header->>'bill_date','')::date,
    NULLIF(p_header->>'due_date','')::date,
    COALESCE(p_header->>'status','draft'),
    p_header->>'notes',
    COALESCE(p_header->>'currency_code','INR'),
    COALESCE(NULLIF(p_header->>'exchange_rate','')::numeric, 1),
    p_header->>'tds_section',
    NULLIF(p_header->>'tds_rate','')::numeric,
    NULLIF(p_header->>'purchase_order_id','')::uuid,
    NULLIF(p_header->>'goods_receipt_id','')::uuid
  ) RETURNING id INTO v_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.bill_items (bill_id, description, quantity, rate, amount)
    VALUES (
      v_id, v_line->>'description',
      COALESCE(NULLIF(v_line->>'quantity','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'rate','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'amount','')::numeric, 0)
    );
  END LOOP;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_bill_with_lines(jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_bill_with_lines(
  p_bill_id uuid, p_header jsonb, p_lines jsonb, p_expected_version int DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_org_row uuid; v_ver int; v_line jsonb;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  SELECT organization_id, version INTO v_org_row, v_ver
    FROM public.bills WHERE id = p_bill_id;
  IF v_org_row IS NULL THEN RAISE EXCEPTION 'Bill % not found', p_bill_id; END IF;
  IF v_org_row <> v_org THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;
  IF p_expected_version IS NOT NULL AND v_ver IS NOT NULL AND p_expected_version <> v_ver THEN
    RAISE EXCEPTION 'Version conflict' USING ERRCODE = 'serialization_failure';
  END IF;

  UPDATE public.bills SET
    vendor_id      = COALESCE(NULLIF(p_header->>'vendor_id','')::uuid, vendor_id),
    bill_number    = COALESCE(p_header->>'bill_number', bill_number),
    vendor_name    = COALESCE(p_header->>'vendor_name', vendor_name),
    amount         = COALESCE(NULLIF(p_header->>'amount','')::numeric, amount),
    tax_amount     = COALESCE(NULLIF(p_header->>'tax_amount','')::numeric, tax_amount),
    total_amount   = COALESCE(NULLIF(p_header->>'total_amount','')::numeric, total_amount),
    bill_date      = COALESCE(NULLIF(p_header->>'bill_date','')::date, bill_date),
    due_date       = COALESCE(NULLIF(p_header->>'due_date','')::date, due_date),
    status         = COALESCE(p_header->>'status', status),
    notes          = COALESCE(p_header->>'notes', notes),
    currency_code  = COALESCE(p_header->>'currency_code', currency_code),
    exchange_rate  = COALESCE(NULLIF(p_header->>'exchange_rate','')::numeric, exchange_rate),
    updated_at     = now()
  WHERE id = p_bill_id;

  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    DELETE FROM public.bill_items WHERE bill_id = p_bill_id;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
      INSERT INTO public.bill_items (bill_id, description, quantity, rate, amount)
      VALUES (p_bill_id, v_line->>'description',
        COALESCE(NULLIF(v_line->>'quantity','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'rate','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'amount','')::numeric, 0));
    END LOOP;
  END IF;
  RETURN p_bill_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_bill_with_lines(uuid, jsonb, jsonb, int) TO authenticated;

-- ============================================================
-- T6: Sales Orders RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_sales_order_with_lines(p_header jsonb, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid()); v_id uuid; v_line jsonb;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  INSERT INTO public.sales_orders (
    organization_id, so_number, customer_id, customer_name,
    order_date, expected_delivery, expected_date, status,
    subtotal, tax_amount, total_amount, notes, created_by,
    quote_id, currency_code, exchange_rate
  ) VALUES (
    v_org, p_header->>'so_number',
    NULLIF(p_header->>'customer_id','')::uuid,
    p_header->>'customer_name',
    NULLIF(p_header->>'order_date','')::date,
    NULLIF(p_header->>'expected_delivery','')::date,
    NULLIF(p_header->>'expected_date','')::date,
    COALESCE(p_header->>'status','draft'),
    COALESCE(NULLIF(p_header->>'subtotal','')::numeric, 0),
    COALESCE(NULLIF(p_header->>'tax_amount','')::numeric, 0),
    COALESCE(NULLIF(p_header->>'total_amount','')::numeric, 0),
    p_header->>'notes', auth.uid(),
    NULLIF(p_header->>'quote_id','')::uuid,
    COALESCE(p_header->>'currency_code','INR'),
    COALESCE(NULLIF(p_header->>'exchange_rate','')::numeric, 1)
  ) RETURNING id INTO v_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.sales_order_items (
      sales_order_id, item_id, description, quantity, unit_price, tax_rate, amount
    ) VALUES (
      v_id, NULLIF(v_line->>'item_id','')::uuid,
      v_line->>'description',
      COALESCE(NULLIF(v_line->>'quantity','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'unit_price','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'tax_rate','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'amount','')::numeric, 0)
    );
  END LOOP;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_sales_order_with_lines(jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_sales_order_with_lines(
  p_so_id uuid, p_header jsonb, p_lines jsonb, p_expected_version int DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_org_row uuid; v_ver int; v_line jsonb;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  SELECT organization_id, version INTO v_org_row, v_ver FROM public.sales_orders WHERE id = p_so_id;
  IF v_org_row IS NULL THEN RAISE EXCEPTION 'SO % not found', p_so_id; END IF;
  IF v_org_row <> v_org THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;
  IF p_expected_version IS NOT NULL AND v_ver IS NOT NULL AND p_expected_version <> v_ver THEN
    RAISE EXCEPTION 'Version conflict' USING ERRCODE = 'serialization_failure';
  END IF;

  UPDATE public.sales_orders SET
    so_number       = COALESCE(p_header->>'so_number', so_number),
    customer_id     = COALESCE(NULLIF(p_header->>'customer_id','')::uuid, customer_id),
    customer_name   = COALESCE(p_header->>'customer_name', customer_name),
    order_date      = COALESCE(NULLIF(p_header->>'order_date','')::date, order_date),
    expected_delivery = COALESCE(NULLIF(p_header->>'expected_delivery','')::date, expected_delivery),
    expected_date   = COALESCE(NULLIF(p_header->>'expected_date','')::date, expected_date),
    status          = COALESCE(p_header->>'status', status),
    subtotal        = COALESCE(NULLIF(p_header->>'subtotal','')::numeric, subtotal),
    tax_amount      = COALESCE(NULLIF(p_header->>'tax_amount','')::numeric, tax_amount),
    total_amount    = COALESCE(NULLIF(p_header->>'total_amount','')::numeric, total_amount),
    notes           = COALESCE(p_header->>'notes', notes),
    currency_code   = COALESCE(p_header->>'currency_code', currency_code),
    exchange_rate   = COALESCE(NULLIF(p_header->>'exchange_rate','')::numeric, exchange_rate),
    updated_at      = now()
  WHERE id = p_so_id;

  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    DELETE FROM public.sales_order_items WHERE sales_order_id = p_so_id;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
      INSERT INTO public.sales_order_items (
        sales_order_id, item_id, description, quantity, unit_price, tax_rate, amount
      ) VALUES (
        p_so_id, NULLIF(v_line->>'item_id','')::uuid,
        v_line->>'description',
        COALESCE(NULLIF(v_line->>'quantity','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'unit_price','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'tax_rate','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'amount','')::numeric, 0)
      );
    END LOOP;
  END IF;
  RETURN p_so_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_sales_order_with_lines(uuid, jsonb, jsonb, int) TO authenticated;

-- ============================================================
-- T6: Purchase Orders RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_purchase_order_with_lines(p_header jsonb, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid()); v_id uuid; v_line jsonb;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  INSERT INTO public.purchase_orders (
    organization_id, po_number, vendor_id, vendor_name,
    order_date, expected_delivery, expected_date, status,
    subtotal, tax_amount, total_amount, notes, created_by,
    currency_code, exchange_rate
  ) VALUES (
    v_org, p_header->>'po_number',
    NULLIF(p_header->>'vendor_id','')::uuid,
    p_header->>'vendor_name',
    NULLIF(p_header->>'order_date','')::date,
    NULLIF(p_header->>'expected_delivery','')::date,
    NULLIF(p_header->>'expected_date','')::date,
    COALESCE(p_header->>'status','draft'),
    COALESCE(NULLIF(p_header->>'subtotal','')::numeric, 0),
    COALESCE(NULLIF(p_header->>'tax_amount','')::numeric, 0),
    COALESCE(NULLIF(p_header->>'total_amount','')::numeric, 0),
    p_header->>'notes', auth.uid(),
    COALESCE(p_header->>'currency_code','INR'),
    COALESCE(NULLIF(p_header->>'exchange_rate','')::numeric, 1)
  ) RETURNING id INTO v_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.purchase_order_items (
      purchase_order_id, item_id, description, quantity, unit_price, tax_rate, amount
    ) VALUES (
      v_id, NULLIF(v_line->>'item_id','')::uuid,
      v_line->>'description',
      COALESCE(NULLIF(v_line->>'quantity','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'unit_price','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'tax_rate','')::numeric, 0),
      COALESCE(NULLIF(v_line->>'amount','')::numeric, 0)
    );
  END LOOP;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_with_lines(jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_purchase_order_with_lines(
  p_po_id uuid, p_header jsonb, p_lines jsonb, p_expected_version int DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_org_row uuid; v_ver int; v_line jsonb;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  SELECT organization_id, version INTO v_org_row, v_ver FROM public.purchase_orders WHERE id = p_po_id;
  IF v_org_row IS NULL THEN RAISE EXCEPTION 'PO % not found', p_po_id; END IF;
  IF v_org_row <> v_org THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;
  IF p_expected_version IS NOT NULL AND v_ver IS NOT NULL AND p_expected_version <> v_ver THEN
    RAISE EXCEPTION 'Version conflict' USING ERRCODE = 'serialization_failure';
  END IF;

  UPDATE public.purchase_orders SET
    po_number       = COALESCE(p_header->>'po_number', po_number),
    vendor_id       = COALESCE(NULLIF(p_header->>'vendor_id','')::uuid, vendor_id),
    vendor_name     = COALESCE(p_header->>'vendor_name', vendor_name),
    order_date      = COALESCE(NULLIF(p_header->>'order_date','')::date, order_date),
    expected_delivery = COALESCE(NULLIF(p_header->>'expected_delivery','')::date, expected_delivery),
    expected_date   = COALESCE(NULLIF(p_header->>'expected_date','')::date, expected_date),
    status          = COALESCE(p_header->>'status', status),
    subtotal        = COALESCE(NULLIF(p_header->>'subtotal','')::numeric, subtotal),
    tax_amount      = COALESCE(NULLIF(p_header->>'tax_amount','')::numeric, tax_amount),
    total_amount    = COALESCE(NULLIF(p_header->>'total_amount','')::numeric, total_amount),
    notes           = COALESCE(p_header->>'notes', notes),
    currency_code   = COALESCE(p_header->>'currency_code', currency_code),
    exchange_rate   = COALESCE(NULLIF(p_header->>'exchange_rate','')::numeric, exchange_rate),
    updated_at      = now()
  WHERE id = p_po_id;

  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    DELETE FROM public.purchase_order_items WHERE purchase_order_id = p_po_id;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_id, description, quantity, unit_price, tax_rate, amount
      ) VALUES (
        p_po_id, NULLIF(v_line->>'item_id','')::uuid,
        v_line->>'description',
        COALESCE(NULLIF(v_line->>'quantity','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'unit_price','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'tax_rate','')::numeric, 0),
        COALESCE(NULLIF(v_line->>'amount','')::numeric, 0)
      );
    END LOOP;
  END IF;
  RETURN p_po_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_purchase_order_with_lines(uuid, jsonb, jsonb, int) TO authenticated;
