
-- ============================================================
-- GBC-67: process_stock_transfer
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_stock_transfer(
  p_org_id uuid,
  p_item_id uuid,
  p_from_warehouse uuid,
  p_to_warehouse uuid,
  p_quantity numeric,
  p_initiated_by uuid,
  p_transfer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stock numeric := 0;
  v_reserved numeric := 0;
  v_available numeric := 0;
  v_rate numeric := 0;
  v_balance_qty numeric := 0;
  v_balance_value numeric := 0;
BEGIN
  IF p_from_warehouse = p_to_warehouse THEN
    RAISE EXCEPTION 'Source and destination warehouses must differ';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  -- Authorize: caller must belong to this org
  IF public.get_user_org(p_initiated_by) IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'Not authorised to transfer stock for this organization';
  END IF;

  -- Lock the item row so two concurrent transfers cannot both pass the check
  SELECT COALESCE(current_stock, 0), COALESCE(purchase_price, 0)
    INTO v_current_stock, v_rate
  FROM public.items
  WHERE id = p_item_id AND organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  -- Active reservations against this item (not warehouse-scoped — best signal we have)
  SELECT COALESCE(SUM(reserved_qty), 0)
    INTO v_reserved
  FROM public.inventory_reservations
  WHERE item_id = p_item_id
    AND organization_id = p_org_id
    AND status = 'active';

  v_available := v_current_stock - v_reserved;

  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Insufficient available stock: % requested, % available (current: %, reserved: %)',
      p_quantity, v_available, v_current_stock, v_reserved;
  END IF;

  -- Stock total is org-wide; record paired ledger entries so warehouse balances stay correct.
  -- OUT from source
  v_balance_qty := v_current_stock - p_quantity;
  v_balance_value := v_balance_qty * v_rate;
  INSERT INTO public.stock_ledger (
    organization_id, item_id, warehouse_id, transaction_type,
    quantity, rate, value, balance_qty, balance_value,
    reference_type, reference_id, posted_by, notes
  ) VALUES (
    p_org_id, p_item_id, p_from_warehouse, 'transfer_out',
    -p_quantity, v_rate, -p_quantity * v_rate, v_balance_qty, v_balance_value,
    'stock_transfer', p_transfer_id, p_initiated_by, 'Stock transfer out'
  );

  -- IN to destination
  v_balance_qty := v_balance_qty + p_quantity;
  v_balance_value := v_balance_qty * v_rate;
  INSERT INTO public.stock_ledger (
    organization_id, item_id, warehouse_id, transaction_type,
    quantity, rate, value, balance_qty, balance_value,
    reference_type, reference_id, posted_by, notes
  ) VALUES (
    p_org_id, p_item_id, p_to_warehouse, 'transfer_in',
    p_quantity, v_rate, p_quantity * v_rate, v_balance_qty, v_balance_value,
    'stock_transfer', p_transfer_id, p_initiated_by, 'Stock transfer in'
  );

  -- Org-wide stock total is unchanged by an internal transfer; touch updated_at only.
  UPDATE public.items SET updated_at = now() WHERE id = p_item_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'item_id', p_item_id,
    'quantity', p_quantity,
    'available_after', v_available - p_quantity
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_stock_transfer(uuid, uuid, uuid, uuid, numeric, uuid, uuid) TO authenticated;

-- ============================================================
-- GBC-68: confirm_pick
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_pick(
  p_picking_list_id uuid,
  p_org_id uuid,
  p_confirmations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  elem jsonb;
  v_item_id uuid;
  v_ordered numeric;
  v_picked numeric;
  v_warehouse uuid;
  v_so_id uuid;
  v_actor uuid := auth.uid();
  v_rate numeric;
  v_current numeric;
  v_balance_qty numeric;
  v_discrepancies int := 0;
  v_lines int := 0;
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
    v_ordered := COALESCE(NULLIF(elem->>'ordered_qty', '')::numeric, 0);
    v_picked := COALESCE(NULLIF(elem->>'picked_qty', '')::numeric, 0);
    v_lines := v_lines + 1;

    IF v_picked < 0 THEN
      RAISE EXCEPTION 'picked_qty cannot be negative';
    END IF;

    IF v_picked < v_ordered THEN
      v_discrepancies := v_discrepancies + 1;
    END IF;

    IF v_item_id IS NOT NULL AND v_picked > 0 THEN
      -- Lock and deduct only the actual picked qty
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
    END IF;

    -- Update line status & picked qty
    UPDATE public.picking_list_items
      SET picked_quantity = v_picked,
          status = CASE
            WHEN v_picked >= v_ordered AND v_picked > 0 THEN 'picked'
            WHEN v_picked > 0 THEN 'short'
            ELSE 'pending'
          END
    WHERE picking_list_id = p_picking_list_id
      AND (
        (v_item_id IS NOT NULL AND item_id = v_item_id)
        OR (v_item_id IS NULL AND item_id IS NULL)
      );
  END LOOP;

  -- Mark picking list completed
  UPDATE public.picking_lists
    SET status = 'completed', updated_at = now()
  WHERE id = p_picking_list_id AND organization_id = p_org_id;

  -- Release active reservations for the linked sales order
  IF v_so_id IS NOT NULL THEN
    UPDATE public.inventory_reservations
      SET status = 'fulfilled', released_at = now()
    WHERE sales_order_id = v_so_id
      AND organization_id = p_org_id
      AND status = 'active';
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'lines_processed', v_lines,
    'discrepancies', v_discrepancies
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_pick(uuid, uuid, jsonb) TO authenticated;

-- ============================================================
-- GBC-76: Lock down profile self-elevation + audit trigger
-- ============================================================

-- Trigger 1: block non-HR/Admin from changing job_title / department / status / employee_id / manager_id / organization_id
CREATE OR REPLACE FUNCTION public.profiles_block_self_elevation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_privileged boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW; -- service role / system path
  END IF;

  v_is_privileged := public.is_org_admin_or_hr(v_actor, OLD.organization_id)
                  OR public.is_super_admin(v_actor);

  IF NOT v_is_privileged THEN
    IF NEW.job_title IS DISTINCT FROM OLD.job_title THEN
      RAISE EXCEPTION 'Only HR or Admin can change job title. Submit a profile change request.';
    END IF;
    IF NEW.department IS DISTINCT FROM OLD.department THEN
      RAISE EXCEPTION 'Only HR or Admin can change department. Submit a profile change request.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Only HR or Admin can change employment status.';
    END IF;
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
      RAISE EXCEPTION 'Only HR or Admin can change employee ID.';
    END IF;
    IF NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN
      RAISE EXCEPTION 'Only HR or Admin can change reporting manager.';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Organization cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_block_self_elevation ON public.profiles;
CREATE TRIGGER trg_profiles_block_self_elevation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_block_self_elevation();

-- Trigger 2: audit every profile UPDATE with old_data / new_data
CREATE OR REPLACE FUNCTION public.profiles_audit_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
BEGIN
  -- Skip no-op updates
  IF row_to_json(OLD)::jsonb = row_to_json(NEW)::jsonb THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_actor_name
  FROM public.profiles
  WHERE user_id = v_actor
  LIMIT 1;

  INSERT INTO public.audit_logs (
    actor_id, actor_name, action, entity_type, entity_id,
    target_user_id, target_name, organization_id,
    table_name, old_data, new_data, is_system_operation
  ) VALUES (
    v_actor, v_actor_name, 'UPDATE', 'profile', NEW.id,
    NEW.user_id, NEW.full_name, NEW.organization_id,
    'profiles', to_jsonb(OLD), to_jsonb(NEW),
    v_actor IS NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_audit_change ON public.profiles;
CREATE TRIGGER trg_profiles_audit_change
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_audit_change();
