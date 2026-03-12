-- ═══════════════════════════════════════════════════════════════════════
-- FIX: WH1_WAREHOUSE_BINS (WARNING, LOW) — va9Jt
-- Create a default bin_location for every active warehouse that has none.
--
-- Root cause: 1 active warehouse exists without any bin_locations.
-- The WH1 check counts active warehouses with no child bin_locations.
--
-- Fix: Insert a canonical 'DEFAULT' bin for each affected warehouse.
-- This does NOT alter existing warehouses or bins — idempotent.
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO public.bin_locations (
  id,
  organization_id,
  warehouse_id,
  bin_code,
  zone,
  notes,
  is_active
)
SELECT
  gen_random_uuid()     AS id,
  w.organization_id     AS organization_id,
  w.id                  AS warehouse_id,
  'DEFAULT'             AS bin_code,
  'GENERAL'             AS zone,
  'Auto-created default bin (WH1 remediation)'  AS notes,
  true                  AS is_active
FROM public.warehouses w
WHERE w.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.bin_locations bl
    WHERE bl.warehouse_id = w.id
  );

-- Verification hint:
-- After applying, the following query should return 0:
--
--   SELECT count(*) FROM public.warehouses w
--   LEFT JOIN public.bin_locations bl ON bl.warehouse_id = w.id
--   WHERE bl.id IS NULL AND w.is_active = true;
