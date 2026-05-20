
-- ============================================================
-- GBC-106: Link bin locations to goods receipts, stock transfers, and picking lists
-- ============================================================

-- 1. Add bin_location_id to goods_receipt_items so each received line can be
--    directed to a specific bin.
ALTER TABLE public.goods_receipt_items
  ADD COLUMN IF NOT EXISTS bin_location_id uuid REFERENCES public.bin_locations(id);

-- 2. accept_goods_receipt
--    Atomically marks a GR as accepted and increments bin current_units for
--    each line item that has a bin assigned.
CREATE OR REPLACE FUNCTION public.accept_goods_receipt(
  p_receipt_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_org_id   uuid;
  v_status   text;
  v_item     RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id INTO v_org_id FROM public.profiles WHERE user_id = v_user_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization not found'; END IF;

  -- Lock and verify
  SELECT status INTO v_status
  FROM public.goods_receipts
  WHERE id = p_receipt_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goods receipt not found in your organization';
  END IF;
  IF v_status NOT IN ('draft', 'inspecting') THEN
    RAISE EXCEPTION 'Goods receipt has already been accepted or cancelled (status: %)', v_status;
  END IF;

  -- Mark accepted
  UPDATE public.goods_receipts
     SET status = 'accepted', updated_at = now()
   WHERE id = p_receipt_id AND organization_id = v_org_id;

  -- Increment bin current_units for each item that has a bin assigned
  FOR v_item IN
    SELECT quantity_received, bin_location_id
      FROM public.goods_receipt_items
     WHERE goods_receipt_id = p_receipt_id
       AND bin_location_id IS NOT NULL
  LOOP
    UPDATE public.bin_locations
       SET current_units = current_units + v_item.quantity_received
     WHERE id = v_item.bin_location_id
       AND organization_id = v_org_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_goods_receipt(uuid) TO authenticated;

-- 3. update_stock_transfer_status — extend to update bin counts on receive.
--    Replaces the existing function entirely (same signature).
CREATE OR REPLACE FUNCTION public.update_stock_transfer_status(
  p_transfer_id uuid,
  p_new_status  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_org_id        uuid;
  v_current_status text;
  v_from_wh       uuid;
  v_to_wh         uuid;
  v_allowed       text[];
  v_item          RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT organization_id INTO v_org_id FROM public.profiles WHERE user_id = v_user_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization not found'; END IF;

  SELECT status, from_warehouse_id, to_warehouse_id
    INTO v_current_status, v_from_wh, v_to_wh
  FROM public.stock_transfers
  WHERE id = p_transfer_id AND organization_id = v_org_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Stock transfer not found in your organization';
  END IF;

  v_allowed := CASE v_current_status
    WHEN 'draft'      THEN ARRAY['in_transit','cancelled']
    WHEN 'in_transit' THEN ARRAY['received','cancelled']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (p_new_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Cannot change transfer from "%" to "%"', v_current_status, p_new_status;
  END IF;

  UPDATE public.stock_transfers
     SET status = p_new_status, updated_at = now()
   WHERE id = p_transfer_id AND organization_id = v_org_id;

  IF p_new_status = 'received' THEN
    FOR v_item IN
      SELECT id, item_id, quantity, from_bin_id, to_bin_id
        FROM public.stock_transfer_items
       WHERE transfer_id = p_transfer_id
    LOOP
      IF v_item.item_id IS NULL THEN
        RAISE EXCEPTION 'Cannot receive: a transfer line has no catalog item linked.';
      END IF;

      PERFORM public.process_stock_transfer(
        v_org_id, v_item.item_id, v_from_wh, v_to_wh,
        v_item.quantity::numeric, v_user_id, p_transfer_id
      );

      -- Move units between bins when both sides are specified
      IF v_item.from_bin_id IS NOT NULL THEN
        UPDATE public.bin_locations
           SET current_units = GREATEST(0, current_units - v_item.quantity)
         WHERE id = v_item.from_bin_id AND organization_id = v_org_id;
      END IF;

      IF v_item.to_bin_id IS NOT NULL THEN
        UPDATE public.bin_locations
           SET current_units = current_units + v_item.quantity
         WHERE id = v_item.to_bin_id AND organization_id = v_org_id;
      END IF;
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_stock_transfer_status(uuid, text) TO authenticated;

-- 4. confirm_pick — extend to accept optional bin_id per confirmation row and
--    decrement current_units for the source bin when items are picked.
--    Replaces the existing function (same signature).
CREATE OR REPLACE FUNCTION public.confirm_pick(
  p_picking_list_id uuid,
  p_org_id          uuid,
  p_confirmations   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  elem            jsonb;
  v_item_id       uuid;
  v_bin_id        uuid;
  v_ordered       numeric;
  v_picked        numeric;
  v_warehouse     uuid;
  v_so_id         uuid;
  v_actor         uuid := auth.uid();
  v_rate          numeric;
  v_current       numeric;
  v_balance_qty   numeric;
  v_discrepancies int := 0;
  v_lines         int := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.get_user_org(v_actor) IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'Not authorised to confirm picks for this organization';
  END IF;
  IF jsonb_typeof(p_confirmations) <> 'array' THEN
    RAISE EXCEPTION 'confirmations must be a json array';
  END IF;

  SELECT warehouse_id, sales_order_id INTO v_warehouse, v_so_id
  FROM public.picking_lists
  WHERE id = p_picking_list_id AND organization_id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Picking list not found';
  END IF;

  FOR elem IN SELECT * FROM jsonb_array_elements(p_confirmations)
  LOOP
    v_item_id := NULLIF(elem->>'item_id', '')::uuid;
    v_bin_id  := NULLIF(elem->>'bin_id',  '')::uuid;
    v_ordered := COALESCE(NULLIF(elem->>'ordered_qty', '')::numeric, 0);
    v_picked  := COALESCE(NULLIF(elem->>'picked_qty',  '')::numeric, 0);
    v_lines   := v_lines + 1;

    IF v_picked < 0 THEN
      RAISE EXCEPTION 'picked_qty cannot be negative';
    END IF;

    IF v_picked < v_ordered THEN
      v_discrepancies := v_discrepancies + 1;
    END IF;

    IF v_item_id IS NOT NULL AND v_picked > 0 THEN
      SELECT COALESCE(current_stock, 0), COALESCE(purchase_price, 0)
        INTO v_current, v_rate
      FROM public.items
      WHERE id = v_item_id AND organization_id = p_org_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % not found', v_item_id;
      END IF;
      IF v_current < v_picked THEN
        RAISE EXCEPTION 'Insufficient stock for item %: requested %, available %', v_item_id, v_picked, v_current;
      END IF;

      v_balance_qty := v_current - v_picked;
      UPDATE public.items
        SET current_stock = v_balance_qty, updated_at = now()
      WHERE id = v_item_id;

      INSERT INTO public.stock_ledger (
        organization_id, item_id, warehouse_id, transaction_type,
        quantity, rate, value, balance_qty, balance_value,
        reference_type, reference_id, posted_by, notes
      ) VALUES (
        p_org_id, v_item_id, v_warehouse, 'pick',
        -v_picked, v_rate, -v_picked * v_rate, v_balance_qty, v_balance_qty * v_rate,
        'picking_list', p_picking_list_id, v_actor,
        CASE WHEN v_picked < v_ordered
             THEN 'Pick (short: ' || v_picked || ' of ' || v_ordered || ')'
             ELSE 'Pick (full)' END
      );

      -- Decrement source bin when specified
      IF v_bin_id IS NOT NULL THEN
        UPDATE public.bin_locations
           SET current_units = GREATEST(0, current_units - v_picked)
         WHERE id = v_bin_id AND organization_id = p_org_id;
      END IF;
    END IF;

    UPDATE public.picking_list_items
      SET picked_quantity = v_picked,
          status = CASE
            WHEN v_picked >= v_ordered AND v_picked > 0 THEN 'picked'
            WHEN v_picked > 0                           THEN 'short'
            ELSE                                             'pending'
          END
    WHERE picking_list_id = p_picking_list_id
      AND item_id = v_item_id;
  END LOOP;

  UPDATE public.picking_lists
     SET status = CASE
           WHEN v_discrepancies > 0 THEN 'completed'
           ELSE 'completed'
         END,
         updated_at = now()
   WHERE id = p_picking_list_id;

  RETURN jsonb_build_object(
    'lines', v_lines,
    'discrepancies', v_discrepancies
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_pick(uuid, uuid, jsonb) TO authenticated;
