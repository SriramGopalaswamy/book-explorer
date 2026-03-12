-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Inventory items.item_type CHECK constraint
--
-- Root cause: items_item_type_check only allows:
--   ('product', 'service', 'raw_material', 'finished_good', 'consumable')
--
-- Simulation and seed code use: 'goods', 'inventory', 'asset'
-- which are rejected by the constraint → inventory items cannot be created.
--
-- Fix: Expand the allowed set to include all ERP-grade item types:
--   inventory  — generic stock items
--   goods      — physical trade goods
--   asset      — capital/fixed-asset items tracked in inventory
-- ═══════════════════════════════════════════════════════════════════════

-- Drop and recreate the CHECK constraint with the expanded value set
ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_item_type_check;

ALTER TABLE public.items
  ADD CONSTRAINT items_item_type_check
  CHECK (item_type IN (
    'product',       -- finished sellable product
    'service',       -- service line item
    'raw_material',  -- input to manufacturing
    'finished_good', -- manufactured output
    'consumable',    -- internal-use supplies
    'inventory',     -- generic stocked item
    'goods',         -- physical trade goods
    'asset'          -- capital asset tracked via inventory
  ));

-- ── Also update the column default to a universally valid value ───────
-- 'product' is kept as the default (already valid, no change needed)

-- ── Verification hint ─────────────────────────────────────────────────
-- INSERT INTO public.items (organization_id, name, sku, category, item_type, ...)
-- VALUES (..., 'goods')    -- now valid
-- VALUES (..., 'inventory') -- now valid
-- VALUES (..., 'asset')     -- now valid
