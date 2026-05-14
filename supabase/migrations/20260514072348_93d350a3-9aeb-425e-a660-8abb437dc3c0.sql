-- =====================================================================
-- GBC-88: Vendor credits — remaining balance + applications
-- =====================================================================
ALTER TABLE public.vendor_credits
  ADD COLUMN IF NOT EXISTS remaining_amount numeric;

UPDATE public.vendor_credits
   SET remaining_amount = amount
 WHERE remaining_amount IS NULL;

ALTER TABLE public.vendor_credits
  ALTER COLUMN remaining_amount SET DEFAULT 0,
  ALTER COLUMN remaining_amount SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.vendor_credit_applications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vendor_credit_id  uuid NOT NULL REFERENCES public.vendor_credits(id) ON DELETE RESTRICT,
  bill_id           uuid NOT NULL REFERENCES public.bills(id) ON DELETE RESTRICT,
  applied_amount    numeric NOT NULL CHECK (applied_amount > 0),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  applied_by        uuid,
  applied_at        timestamptz NOT NULL DEFAULT now(),
  reversed_by       uuid,
  reversed_at       timestamptz,
  notes             text
);
CREATE INDEX IF NOT EXISTS idx_vca_org_bill ON public.vendor_credit_applications (organization_id, bill_id);
CREATE INDEX IF NOT EXISTS idx_vca_credit ON public.vendor_credit_applications (vendor_credit_id);

ALTER TABLE public.vendor_credit_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org finance manage vca" ON public.vendor_credit_applications;
CREATE POLICY "Org finance manage vca" ON public.vendor_credit_applications
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

-- RPC: list available credits for a vendor
CREATE OR REPLACE FUNCTION public.get_vendor_available_credits(
  p_vendor_id uuid,
  p_org_id    uuid
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_available', COALESCE(SUM(remaining_amount), 0),
    'credits', COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'vendor_credit_number', vendor_credit_number,
        'issue_date', issue_date,
        'amount', amount,
        'remaining_amount', remaining_amount,
        'reason', reason
      ) ORDER BY issue_date), '[]'::jsonb)
  )
  FROM vendor_credits
  WHERE organization_id = p_org_id
    AND vendor_id = p_vendor_id
    AND status IN ('issued','applied')
    AND COALESCE(remaining_amount, 0) > 0;
$$;
GRANT EXECUTE ON FUNCTION public.get_vendor_available_credits(uuid, uuid) TO authenticated;

-- RPC: atomically apply a credit to a bill
CREATE OR REPLACE FUNCTION public.apply_vendor_credit_to_bill(
  p_credit_id uuid,
  p_bill_id   uuid,
  p_amount    numeric,
  p_org_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_credit  RECORD;
  v_bill    RECORD;
  v_app_id  uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: must be positive';
  END IF;

  -- Lock the credit row
  SELECT * INTO v_credit
  FROM vendor_credits
  WHERE id = p_credit_id AND organization_id = p_org_id
  FOR UPDATE;

  IF v_credit.id IS NULL THEN
    RAISE EXCEPTION 'CREDIT_NOT_FOUND';
  END IF;

  IF COALESCE(v_credit.remaining_amount, 0) < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDIT: only % remaining', v_credit.remaining_amount;
  END IF;

  SELECT * INTO v_bill FROM bills
  WHERE id = p_bill_id AND organization_id = p_org_id;
  IF v_bill.id IS NULL THEN
    RAISE EXCEPTION 'BILL_NOT_FOUND';
  END IF;
  IF v_bill.vendor_id IS DISTINCT FROM v_credit.vendor_id THEN
    RAISE EXCEPTION 'VENDOR_MISMATCH: credit belongs to a different vendor';
  END IF;

  INSERT INTO vendor_credit_applications (
    organization_id, vendor_credit_id, bill_id, applied_amount, applied_by
  ) VALUES (
    p_org_id, p_credit_id, p_bill_id, p_amount, auth.uid()
  ) RETURNING id INTO v_app_id;

  UPDATE vendor_credits
     SET remaining_amount = remaining_amount - p_amount,
         status = CASE WHEN remaining_amount - p_amount <= 0 THEN 'applied' ELSE status END,
         updated_at = now()
   WHERE id = p_credit_id;

  RETURN jsonb_build_object(
    'application_id', v_app_id,
    'credit_id', p_credit_id,
    'bill_id', p_bill_id,
    'applied_amount', p_amount,
    'remaining_after', v_credit.remaining_amount - p_amount
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.apply_vendor_credit_to_bill(uuid, uuid, numeric, uuid) TO authenticated;

-- =====================================================================
-- GBC-85: Inventory reservations on confirmed sales orders
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sales_order_id  uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  sales_order_item_id uuid REFERENCES public.sales_order_items(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  warehouse_id    uuid,
  reserved_qty    numeric(12,3) NOT NULL CHECK (reserved_qty >= 0),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','fulfilled','cancelled')),
  reserved_at     timestamptz NOT NULL DEFAULT now(),
  released_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_inv_res_org_so ON public.inventory_reservations (organization_id, sales_order_id);
CREATE INDEX IF NOT EXISTS idx_inv_res_item_active ON public.inventory_reservations (item_id) WHERE status = 'active';

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org users manage reservations" ON public.inventory_reservations;
CREATE POLICY "Org users manage reservations" ON public.inventory_reservations
  USING (organization_id = get_user_org(auth.uid()))
  WITH CHECK (organization_id = get_user_org(auth.uid()));

-- Trigger function: on sales_orders AFTER UPDATE
CREATE OR REPLACE FUNCTION public.fn_so_reserve_inventory()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_available numeric;
  v_already_reserved numeric;
BEGIN
  -- Confirm: reserve every line
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    FOR r IN
      SELECT soi.id AS soi_id, soi.item_id, soi.quantity, soi.organization_id
      FROM sales_order_items soi
      WHERE soi.sales_order_id = NEW.id AND soi.item_id IS NOT NULL
    LOOP
      -- Lock the inventory row
      PERFORM 1 FROM items WHERE id = r.item_id FOR UPDATE;

      SELECT COALESCE(SUM(reserved_qty), 0) INTO v_already_reserved
        FROM inventory_reservations
       WHERE item_id = r.item_id AND status = 'active';

      SELECT COALESCE(current_stock, 0) - v_already_reserved INTO v_available
        FROM items WHERE id = r.item_id;

      IF v_available < r.quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: item % has % available, % requested',
          r.item_id, v_available, r.quantity;
      END IF;

      INSERT INTO inventory_reservations (
        organization_id, sales_order_id, sales_order_item_id, item_id, reserved_qty
      ) VALUES (
        NEW.organization_id, NEW.id, r.soi_id, r.item_id, r.quantity
      );
    END LOOP;
  END IF;

  -- Cancel: release all active reservations for this SO
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    UPDATE inventory_reservations
       SET status = 'cancelled', released_at = now()
     WHERE sales_order_id = NEW.id AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_so_reserve_inventory ON public.sales_orders;
CREATE TRIGGER trg_so_reserve_inventory
  AFTER UPDATE OF status ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_so_reserve_inventory();

-- Trigger: edit sales_order_items quantity → adjust active reservation
CREATE OR REPLACE FUNCTION public.fn_soi_sync_reservation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_so_status text;
  v_existing_qty numeric;
  v_other_reserved numeric;
  v_available numeric;
BEGIN
  SELECT status INTO v_so_status FROM sales_orders WHERE id = NEW.sales_order_id;
  IF v_so_status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF NEW.item_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM items WHERE id = NEW.item_id FOR UPDATE;

  SELECT COALESCE(SUM(reserved_qty), 0) INTO v_existing_qty
    FROM inventory_reservations
   WHERE sales_order_item_id = NEW.id AND status = 'active';

  SELECT COALESCE(SUM(reserved_qty), 0) INTO v_other_reserved
    FROM inventory_reservations
   WHERE item_id = NEW.item_id AND status = 'active'
     AND (sales_order_item_id IS DISTINCT FROM NEW.id);

  SELECT COALESCE(current_stock, 0) - v_other_reserved INTO v_available
    FROM items WHERE id = NEW.item_id;

  IF NEW.quantity > v_available THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: item % has % available, % requested',
      NEW.item_id, v_available, NEW.quantity;
  END IF;

  IF v_existing_qty = 0 THEN
    INSERT INTO inventory_reservations (
      organization_id, sales_order_id, sales_order_item_id, item_id, reserved_qty
    ) VALUES (
      NEW.organization_id, NEW.sales_order_id, NEW.id, NEW.item_id, NEW.quantity
    );
  ELSE
    UPDATE inventory_reservations
       SET reserved_qty = NEW.quantity
     WHERE sales_order_item_id = NEW.id AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_soi_sync_reservation ON public.sales_order_items;
CREATE TRIGGER trg_soi_sync_reservation
  AFTER UPDATE OF quantity ON public.sales_order_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_soi_sync_reservation();

-- =====================================================================
-- GBC-87: Payroll readiness
-- =====================================================================
CREATE OR REPLACE FUNCTION public.check_payroll_readiness(
  p_org_id       uuid,
  p_period_start date
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH missing AS (
    SELECT p.id, p.full_name, p.employee_id, p.email
    FROM profiles p
    WHERE p.organization_id = p_org_id
      AND p.deleted_at IS NULL
      AND p.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM compensation_structures cs
        WHERE cs.profile_id = p.id
          AND cs.organization_id = p_org_id
          AND cs.is_active = true
          AND cs.effective_from <= p_period_start
          AND (cs.effective_to IS NULL OR cs.effective_to >= p_period_start)
      )
  )
  SELECT jsonb_build_object(
    'ready', NOT EXISTS (SELECT 1 FROM missing),
    'missing_count', (SELECT COUNT(*) FROM missing),
    'missing_employees', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'profile_id', id,
        'full_name', full_name,
        'employee_id', employee_id,
        'email', email
      ) ORDER BY full_name) FROM missing),
      '[]'::jsonb
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public.check_payroll_readiness(uuid, date) TO authenticated;