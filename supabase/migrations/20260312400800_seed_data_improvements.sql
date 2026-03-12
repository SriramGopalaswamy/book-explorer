-- ═══════════════════════════════════════════════════════════════════════
-- SEED DATA IMPROVEMENTS
--
-- Adds reference data for ERP modules:
--   1. seed_erp_inventory(p_org_id) — 5 items with SKU + valid item_type
--   2. seed_erp_warehouses(p_org_id) — 2 warehouses × 3 bin locations
--   3. seed_erp_bom(p_org_id)  — BOM components + WO material consumption
--
-- Functions use ON CONFLICT DO NOTHING so they are safe to call
-- multiple times (idempotent).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Inventory seed function ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_erp_inventory(p_org_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_uom_id UUID;
BEGIN
  -- Try to find a base UOM (pieces/units); fall back to NULL if none exists
  SELECT id INTO v_uom_id
  FROM   public.units_of_measure
  WHERE  organization_id = p_org_id
    AND  (abbreviation ILIKE 'pc%' OR abbreviation ILIKE 'unit%' OR name ILIKE '%piece%')
  LIMIT  1;

  INSERT INTO public.items
    (organization_id, name, sku, description, category, item_type,
     purchase_price, selling_price, tax_rate, hsn_code,
     reorder_level, reorder_quantity, opening_stock, current_stock, stock_value,
     valuation_method, is_active, uom_id)
  VALUES
    (p_org_id, 'Office Chair',        'SKU-CHAIR-001',  'Ergonomic office chair',         'Furniture',     'goods',     3500,  5500,  18, '9401',  5,  10, 20, 20, 70000,  'fifo',             TRUE, v_uom_id),
    (p_org_id, 'A4 Paper Ream',       'SKU-PAPER-002',  '500 sheets 75 GSM A4',           'Stationery',    'inventory', 200,   280,   5,  '4802', 10,  50, 100,100, 20000,  'weighted_average', TRUE, v_uom_id),
    (p_org_id, 'Software License',    'SKU-SOFT-003',   'Annual SaaS subscription',       'Software',      'service',   0,     12000, 18, '9983',  0,   0,   0,  0, 0,      'fifo',             TRUE, v_uom_id),
    (p_org_id, 'Server Rack Unit',    'SKU-RACK-004',   '42U data-center server rack',    'IT Equipment',  'asset',     45000, 60000, 18, '8517',  2,   5,   4,  4, 180000, 'fifo',             TRUE, v_uom_id),
    (p_org_id, 'Industrial Solvent',  'SKU-SOLV-005',   'Cleaning solvent 5L can',        'Consumables',   'raw_material', 850, 1100, 12, '3814', 20, 100, 50, 50, 42500,  'fifo',             TRUE, v_uom_id)
  ON CONFLICT (organization_id, sku) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── 2. Warehouse + bin location seed function ─────────────────────────
CREATE OR REPLACE FUNCTION public.seed_erp_warehouses(p_org_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wh1_id UUID;
  v_wh2_id UUID;
  v_count  INTEGER := 0;
BEGIN
  -- Warehouse 1: Main Store
  INSERT INTO public.warehouses
    (organization_id, name, code, address, city, state, is_active)
  VALUES
    (p_org_id, 'Main Warehouse', 'WH-MAIN', '12 Industrial Estate, Phase I', 'Bengaluru', 'Karnataka', TRUE)
  ON CONFLICT (organization_id, code) DO NOTHING
  RETURNING id INTO v_wh1_id;

  -- If insert was skipped (conflict), look up existing id
  IF v_wh1_id IS NULL THEN
    SELECT id INTO v_wh1_id FROM public.warehouses
    WHERE organization_id = p_org_id AND code = 'WH-MAIN';
  END IF;

  -- Warehouse 2: Secondary Store
  INSERT INTO public.warehouses
    (organization_id, name, code, address, city, state, is_active)
  VALUES
    (p_org_id, 'Secondary Warehouse', 'WH-SEC', '7 Trade Park, MIDC', 'Mumbai', 'Maharashtra', TRUE)
  ON CONFLICT (organization_id, code) DO NOTHING
  RETURNING id INTO v_wh2_id;

  IF v_wh2_id IS NULL THEN
    SELECT id INTO v_wh2_id FROM public.warehouses
    WHERE organization_id = p_org_id AND code = 'WH-SEC';
  END IF;

  -- 3 bin locations per warehouse
  IF v_wh1_id IS NOT NULL THEN
    INSERT INTO public.bin_locations
      (warehouse_id, organization_id, bin_code, row_no, rack_no, level_no, is_active)
    VALUES
      (v_wh1_id, p_org_id, 'WH-MAIN-A1', 'A', '1', '1', TRUE),
      (v_wh1_id, p_org_id, 'WH-MAIN-A2', 'A', '1', '2', TRUE),
      (v_wh1_id, p_org_id, 'WH-MAIN-B1', 'B', '1', '1', TRUE)
    ON CONFLICT (warehouse_id, bin_code) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  IF v_wh2_id IS NOT NULL THEN
    INSERT INTO public.bin_locations
      (warehouse_id, organization_id, bin_code, row_no, rack_no, level_no, is_active)
    VALUES
      (v_wh2_id, p_org_id, 'WH-SEC-A1', 'A', '1', '1', TRUE),
      (v_wh2_id, p_org_id, 'WH-SEC-A2', 'A', '1', '2', TRUE),
      (v_wh2_id, p_org_id, 'WH-SEC-B1', 'B', '1', '1', TRUE)
    ON CONFLICT (warehouse_id, bin_code) DO NOTHING;
    GET DIAGNOSTICS v_count = v_count + ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$$;

-- ── 3. BOM + WO material consumption trigger ──────────────────────────
-- Trigger: when a work_order transitions to 'completed', automatically
-- consume (deduct) BOM components from stock.

CREATE OR REPLACE FUNCTION public.consume_bom_on_wo_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _comp  RECORD;
  _qty   NUMERIC;
BEGIN
  -- Fire only when status moves to 'completed'
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Find BOM components for the finished item
  FOR _comp IN
    SELECT bc.component_item_id, bc.quantity_per_unit
    FROM   public.bom_components bc
    WHERE  bc.bom_id IN (
             SELECT id FROM public.bill_of_materials
             WHERE  item_id = NEW.item_id
               AND  organization_id = NEW.organization_id
               AND  is_active = TRUE
             LIMIT 1
           )
  LOOP
    _qty := _comp.quantity_per_unit * NEW.quantity;

    -- Deduct from current_stock
    UPDATE public.items
    SET    current_stock = GREATEST(0, current_stock - _qty),
           stock_value   = GREATEST(0, stock_value - (_qty * purchase_price)),
           updated_at    = now()
    WHERE  id              = _comp.component_item_id
      AND  organization_id = NEW.organization_id;

    -- Write stock ledger entry
    INSERT INTO public.stock_ledger
      (organization_id, item_id, transaction_type, quantity,
       reference_type, reference_id, notes, transaction_date)
    VALUES
      (NEW.organization_id, _comp.component_item_id,
       'consumption', -_qty,
       'work_order', NEW.id,
       'Auto-consumed on WO completion',
       CURRENT_DATE)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wo_bom_consumption ON public.work_orders;

CREATE TRIGGER trg_wo_bom_consumption
  AFTER UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.consume_bom_on_wo_completion();

-- ── Verification hint ─────────────────────────────────────────────────
-- SELECT seed_erp_inventory('<org_id>');    -- inserts up to 5 items
-- SELECT seed_erp_warehouses('<org_id>');   -- inserts 2 warehouses + 6 bins
-- UPDATE work_orders SET status = 'completed' WHERE id = '<wo_id>';
-- → should auto-consume BOM components from stock
