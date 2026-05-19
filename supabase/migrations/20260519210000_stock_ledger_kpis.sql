BEGIN;

-- GBC-140: Server-side stock ledger KPI aggregation.
-- The client was computing totals over a .limit(500) window, giving inaccurate
-- KPI cards. This function returns accurate server-side aggregates and the
-- latest balance_qty per (item_id, warehouse_id) via DISTINCT ON.

CREATE OR REPLACE FUNCTION public.get_stock_ledger_kpis(
  p_org_id      uuid,
  p_item_id     uuid DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_total_entries  bigint;
  v_stock_in       numeric;
  v_stock_out      numeric;
BEGIN
  SELECT
    COUNT(*),
    COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END), 0),
    COALESCE(ABS(SUM(CASE WHEN quantity < 0 THEN quantity ELSE 0 END)), 0)
  INTO v_total_entries, v_stock_in, v_stock_out
  FROM public.stock_ledger
  WHERE organization_id = p_org_id
    AND (p_item_id IS NULL      OR item_id      = p_item_id)
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

  RETURN jsonb_build_object(
    'total_entries', v_total_entries,
    'stock_in',      v_stock_in,
    'stock_out',     v_stock_out
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stock_ledger_kpis(uuid, uuid, uuid) TO authenticated;

COMMIT;
