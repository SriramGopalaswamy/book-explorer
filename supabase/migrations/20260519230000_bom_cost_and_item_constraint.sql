BEGIN;

-- GBC-152: calculate_bom_cost — pushes BOM cost aggregation to the DB.
-- The hook was computing totalMaterialCost client-side by joining bom_lines to
-- items.purchase_price in JS; now the DB does the join and sum.

CREATE OR REPLACE FUNCTION public.calculate_bom_cost(
  p_bom_id uuid,
  p_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_org uuid;
BEGIN
  -- Verify the BOM belongs to the caller's org
  SELECT organization_id INTO v_org
  FROM public.bill_of_materials
  WHERE id = p_bom_id;

  IF v_org IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN (
    WITH line_costs AS (
      SELECT
        bl.id,
        bl.material_name,
        bl.quantity,
        COALESCE(bl.wastage_pct, 0)                                   AS wastage_pct,
        COALESCE(i.purchase_price, bl.est_cost, 0)                    AS unit_cost,
        bl.quantity * COALESCE(i.purchase_price, bl.est_cost, 0)      AS base_cost,
        bl.quantity
          * COALESCE(i.purchase_price, bl.est_cost, 0)
          * (1 + COALESCE(bl.wastage_pct, 0) / 100.0)                 AS effective_cost
      FROM public.bom_lines bl
      LEFT JOIN public.items i
        ON i.id = bl.item_id AND i.organization_id = p_org_id
      WHERE bl.bom_id = p_bom_id
      ORDER BY bl.sort_order
    )
    SELECT jsonb_build_object(
      'bom_id',             p_bom_id,
      'total_material_cost', ROUND(COALESCE(SUM(base_cost),      0)::numeric, 2),
      'total_with_wastage',  ROUND(COALESCE(SUM(effective_cost), 0)::numeric, 2),
      'line_count',          COUNT(id),
      'line_details',        COALESCE(jsonb_agg(jsonb_build_object(
        'material_name', material_name,
        'quantity',      quantity,
        'unit_cost',     ROUND(unit_cost::numeric, 2),
        'wastage_pct',   wastage_pct,
        'effective_cost',ROUND(effective_cost::numeric, 2)
      ) ORDER BY ctid), '[]'::jsonb)
    )
    FROM line_costs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_bom_cost(uuid, uuid) TO authenticated;

-- GBC-150: Enforce item_id on new bom_lines (NOT VALID so existing NULL rows
-- are not rejected — validate separately once backfilled).
ALTER TABLE public.bom_lines
  ADD CONSTRAINT bom_lines_item_id_required
  CHECK (item_id IS NOT NULL)
  NOT VALID;

COMMIT;
