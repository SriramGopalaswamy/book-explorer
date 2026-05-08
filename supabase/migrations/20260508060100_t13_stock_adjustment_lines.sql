-- ══════════════════════════════════════════════════════════════════════
-- GBC-58 / T13: stock_adjustment_lines table + posting trigger
--
-- The stock_adjustments table today only has header columns (warehouse,
-- reason, status). The screen captures a header but no items, so saving an
-- adjustment never actually adjusts stock. This migration adds:
--
--   1. stock_adjustment_lines child table (item_id, quantity_delta, unit_cost,
--      reason_code).
--   2. RLS policies — read/write scoped to org membership; insert/update
--      restricted to admin/finance to match stock_adjustments.
--   3. Trigger fn_post_stock_adjustment_lines: when a stock_adjustment moves
--      to status 'posted', stream each line into stock_ledger with
--      transaction_type 'adjustment'. Idempotent via reference_type +
--      reference_id check.
--
-- The corresponding UI change is in src/pages/inventory/StockAdjustments.tsx
-- (added Line Items table, calls useCreateStockAdjustmentWithLines).
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.stock_adjustment_lines (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_adjustment_id   UUID NOT NULL REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
  organization_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id               UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity_delta        NUMERIC NOT NULL,
  unit_cost             NUMERIC NOT NULL DEFAULT 0,
  reason_code           TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (quantity_delta <> 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustment_lines_adjustment
  ON public.stock_adjustment_lines (stock_adjustment_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_lines_org_item
  ON public.stock_adjustment_lines (organization_id, item_id);

-- Backfill organization_id from parent on insert. Mirrors the
-- _sync_org_id_from_parent pattern shipped by Lovable in 20260508051836.
CREATE OR REPLACE FUNCTION public._stock_adjustment_lines_sync_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _parent_org UUID;
BEGIN
  SELECT organization_id INTO _parent_org
  FROM public.stock_adjustments
  WHERE id = NEW.stock_adjustment_id;
  IF _parent_org IS NULL THEN
    RAISE EXCEPTION 'parent stock_adjustments row % not found', NEW.stock_adjustment_id;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := _parent_org;
  ELSIF NEW.organization_id <> _parent_org THEN
    RAISE EXCEPTION 'cross-tenant access denied (line vs parent)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_adjustment_lines_sync_org ON public.stock_adjustment_lines;
CREATE TRIGGER trg_stock_adjustment_lines_sync_org
  BEFORE INSERT OR UPDATE ON public.stock_adjustment_lines
  FOR EACH ROW
  EXECUTE FUNCTION public._stock_adjustment_lines_sync_org();

ALTER TABLE public.stock_adjustment_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read stock_adjustment_lines" ON public.stock_adjustment_lines;
CREATE POLICY "Org members read stock_adjustment_lines"
  ON public.stock_adjustment_lines
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Admin/finance manage stock_adjustment_lines" ON public.stock_adjustment_lines;
CREATE POLICY "Admin/finance manage stock_adjustment_lines"
  ON public.stock_adjustment_lines
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid())
         AND public.is_admin_or_finance(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid())
              AND public.is_admin_or_finance(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────
-- Posting trigger: on stock_adjustments.status -> 'posted',
-- stream each child line into stock_ledger with transaction_type 'adjustment'.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_post_stock_adjustment_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _line RECORD;
  _bal_qty   NUMERIC;
  _bal_value NUMERIC;
  _existing_count INT;
BEGIN
  IF NEW.status <> 'posted' THEN RETURN NEW; END IF;
  IF OLD.status = 'posted' THEN RETURN NEW; END IF;

  -- Idempotency
  SELECT COUNT(*) INTO _existing_count
  FROM public.stock_ledger
  WHERE organization_id = NEW.organization_id
    AND reference_type = 'stock_adjustment'
    AND reference_id = NEW.id;
  IF _existing_count > 0 THEN RETURN NEW; END IF;

  FOR _line IN
    SELECT sal.id, sal.item_id, sal.quantity_delta, sal.unit_cost, sal.notes
    FROM public.stock_adjustment_lines sal
    WHERE sal.stock_adjustment_id = NEW.id
  LOOP
    SELECT COALESCE(balance_qty, 0), COALESCE(balance_value, 0)
      INTO _bal_qty, _bal_value
    FROM public.stock_ledger
    WHERE organization_id = NEW.organization_id
      AND item_id = _line.item_id
      AND warehouse_id = NEW.warehouse_id
    ORDER BY posted_at DESC
    LIMIT 1;

    _bal_qty   := COALESCE(_bal_qty, 0)   + _line.quantity_delta;
    _bal_value := COALESCE(_bal_value, 0) + _line.quantity_delta * COALESCE(_line.unit_cost, 0);

    INSERT INTO public.stock_ledger
      (organization_id, item_id, warehouse_id, transaction_type, quantity,
       rate, value, balance_qty, balance_value,
       reference_type, reference_id, notes, posted_by)
    VALUES
      (NEW.organization_id, _line.item_id, NEW.warehouse_id,
       'adjustment', _line.quantity_delta,
       COALESCE(_line.unit_cost, 0),
       _line.quantity_delta * COALESCE(_line.unit_cost, 0),
       _bal_qty, _bal_value,
       'stock_adjustment', NEW.id,
       COALESCE(_line.notes, NEW.reason),
       COALESCE(NEW.approved_by, auth.uid()));
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_adjustment_post ON public.stock_adjustments;
CREATE TRIGGER trg_stock_adjustment_post
  AFTER UPDATE OF status ON public.stock_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_post_stock_adjustment_lines();

-- ─────────────────────────────────────────────────────────────────────
-- create_stock_adjustment_with_lines RPC — atomic header+lines insert,
-- mirrors the create_*_with_lines pattern in 20260508052947 / 20260508053305.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_stock_adjustment_with_lines(
  p_header jsonb,
  p_lines  jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_id  uuid;
  v_line jsonb;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    RAISE EXCEPTION 'p_header must be a JSON object';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'p_lines must be a JSON array';
  END IF;

  INSERT INTO public.stock_adjustments
    (organization_id, adjustment_number, warehouse_id, adjustment_date,
     reason, status, notes, created_by)
  VALUES
    (v_org,
     p_header->>'adjustment_number',
     (p_header->>'warehouse_id')::uuid,
     COALESCE(NULLIF(p_header->>'adjustment_date','')::date, CURRENT_DATE),
     p_header->>'reason',
     COALESCE(p_header->>'status', 'draft'),
     p_header->>'notes',
     auth.uid())
  RETURNING id INTO v_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO public.stock_adjustment_lines
      (stock_adjustment_id, organization_id, item_id, quantity_delta,
       unit_cost, reason_code, notes)
    VALUES
      (v_id, v_org,
       (v_line->>'item_id')::uuid,
       COALESCE(NULLIF(v_line->>'quantity_delta','')::numeric, 0),
       COALESCE(NULLIF(v_line->>'unit_cost','')::numeric, 0),
       v_line->>'reason_code',
       v_line->>'notes');
  END LOOP;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_stock_adjustment_with_lines(jsonb, jsonb) TO authenticated;
