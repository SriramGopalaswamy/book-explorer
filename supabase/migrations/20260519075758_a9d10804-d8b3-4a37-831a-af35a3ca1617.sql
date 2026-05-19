
-- Align DN RPC with frontend DN_TRANSITIONS
CREATE OR REPLACE FUNCTION public.update_delivery_note_status(
  p_dn_id uuid,
  p_new_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_current_status text;
  v_so_id uuid;
  v_allowed text[];
  v_warehouse_id uuid;
  v_so_status text;
  v_item RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT organization_id INTO v_org_id FROM public.profiles WHERE user_id = v_user_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization not found'; END IF;

  SELECT status, sales_order_id INTO v_current_status, v_so_id
    FROM public.delivery_notes
   WHERE id = p_dn_id AND organization_id = v_org_id;

  IF v_current_status IS NULL THEN RAISE EXCEPTION 'Delivery note not found in your organization'; END IF;

  v_allowed := CASE v_current_status
    WHEN 'draft'      THEN ARRAY['dispatched','cancelled']
    WHEN 'dispatched' THEN ARRAY['in_transit','delivered']
    WHEN 'in_transit' THEN ARRAY['delivered','returned']
    WHEN 'delivered'  THEN ARRAY['returned']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (p_new_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Cannot transition DN from "%" to "%"', v_current_status, p_new_status;
  END IF;

  UPDATE public.delivery_notes
     SET status = p_new_status, updated_at = now()
   WHERE id = p_dn_id AND organization_id = v_org_id;

  IF p_new_status = 'delivered' THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
     WHERE organization_id = v_org_id ORDER BY created_at LIMIT 1;
    IF v_warehouse_id IS NOT NULL THEN
      FOR v_item IN
        SELECT item_id, COALESCE(shipped_quantity, quantity) AS qty
          FROM public.delivery_note_items
         WHERE delivery_note_id = p_dn_id AND item_id IS NOT NULL
      LOOP
        INSERT INTO public.stock_ledger (
          item_id, warehouse_id, quantity, entry_type,
          reference_type, reference_id, notes, organization_id, created_by
        ) VALUES (
          v_item.item_id, v_warehouse_id, v_item.qty::numeric, 'out',
          'delivery_note', p_dn_id,
          'Auto stock-out from DN ' || substr(p_dn_id::text, 1, 8),
          v_org_id, v_user_id
        );
        UPDATE public.items
           SET current_stock = COALESCE(current_stock, 0) - v_item.qty::numeric
         WHERE id = v_item.item_id;
      END LOOP;
    END IF;
  END IF;

  IF v_so_id IS NOT NULL THEN
    IF p_new_status = 'delivered' THEN
      UPDATE public.sales_orders SET status = 'delivered'
       WHERE id = v_so_id AND organization_id = v_org_id;
    ELSIF p_new_status = 'returned' THEN
      UPDATE public.sales_orders SET status = 'returned'
       WHERE id = v_so_id AND organization_id = v_org_id;
    ELSIF p_new_status = 'dispatched' THEN
      SELECT status INTO v_so_status FROM public.sales_orders
       WHERE id = v_so_id AND organization_id = v_org_id;
      IF v_so_status IN ('processing','confirmed') THEN
        UPDATE public.sales_orders SET status = 'shipped'
         WHERE id = v_so_id AND organization_id = v_org_id;
      END IF;
    END IF;
  END IF;
END;
$$;

-- GBC-? : atomic GR status flip + stock-in on accept
CREATE OR REPLACE FUNCTION public.update_goods_receipt_status(
  p_gr_id uuid,
  p_new_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_current_status text;
  v_po_id uuid;
  v_allowed text[];
  v_warehouse_id uuid;
  v_item RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT organization_id INTO v_org_id FROM public.profiles WHERE user_id = v_user_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization not found'; END IF;

  SELECT status, purchase_order_id INTO v_current_status, v_po_id
    FROM public.goods_receipts
   WHERE id = p_gr_id AND organization_id = v_org_id;
  IF v_current_status IS NULL THEN RAISE EXCEPTION 'Goods receipt not found in your organization'; END IF;

  v_allowed := CASE v_current_status
    WHEN 'draft'        THEN ARRAY['inspecting','accepted','cancelled']
    WHEN 'inspecting'   THEN ARRAY['accepted','rejected']
    WHEN 'accepted'     THEN ARRAY['bill_created']
    ELSE ARRAY[]::text[]
  END;
  IF NOT (p_new_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Cannot transition GR from "%" to "%"', v_current_status, p_new_status;
  END IF;

  UPDATE public.goods_receipts SET status = p_new_status
   WHERE id = p_gr_id AND organization_id = v_org_id;

  IF p_new_status = 'accepted' THEN
    SELECT warehouse_id INTO v_warehouse_id FROM public.purchase_orders
     WHERE id = v_po_id AND organization_id = v_org_id;
    IF v_warehouse_id IS NULL THEN
      SELECT id INTO v_warehouse_id FROM public.warehouses
       WHERE organization_id = v_org_id ORDER BY created_at LIMIT 1;
    END IF;
    IF v_warehouse_id IS NOT NULL THEN
      FOR v_item IN
        SELECT item_id, quantity_received
          FROM public.goods_receipt_items
         WHERE goods_receipt_id = p_gr_id AND item_id IS NOT NULL
      LOOP
        INSERT INTO public.stock_ledger (
          item_id, warehouse_id, quantity, entry_type,
          reference_type, reference_id, notes, organization_id, created_by
        ) VALUES (
          v_item.item_id, v_warehouse_id, v_item.quantity_received::numeric, 'in',
          'goods_receipt', p_gr_id,
          'Auto stock-in from GR ' || substr(p_gr_id::text, 1, 8),
          v_org_id, v_user_id
        );
        UPDATE public.items
           SET current_stock = COALESCE(current_stock, 0) + v_item.quantity_received::numeric
         WHERE id = v_item.item_id;
      END LOOP;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_goods_receipt_status(uuid, text) TO authenticated;
