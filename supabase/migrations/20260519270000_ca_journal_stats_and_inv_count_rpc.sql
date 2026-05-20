BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- GBC-133: CADashboard.tsx downloads all journal entries into browser
-- memory and computes manual-journal ratio + backdated-entry count in JS.
-- Move both calculations to the DB so the browser only receives 3 numbers.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_ca_journal_stats(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total',          COUNT(*),
    'manual_count',   COUNT(*) FILTER (WHERE source_type = 'manual'),
    'manual_ratio',   CASE WHEN COUNT(*) > 0
                        THEN ROUND(
                          (COUNT(*) FILTER (WHERE source_type = 'manual'))::numeric
                          / COUNT(*) * 100, 1)
                        ELSE 0
                      END,
    'backdated_count', COUNT(*) FILTER (
      WHERE (created_at::date - entry_date::date) > 7
    )
  )
  FROM journal_entries
  WHERE organization_id = p_org_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_ca_journal_stats(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- GBC-69: usePostInventoryCount runs N sequential single-row inserts
-- into stock_ledger + N separate UPDATE items calls in a JS loop.
-- Any network drop between iterations leaves the ledger partially posted.
-- Replace with a single atomic SECURITY DEFINER RPC.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.post_inventory_variances(
  p_count_id uuid,
  p_org_id   uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count      RECORD;
  v_line       RECORD;
  v_prev_bal   numeric;
  v_new_bal    numeric;
  v_rate       numeric;
BEGIN
  SELECT status, warehouse_id
    INTO v_count
    FROM inventory_counts
   WHERE id = p_count_id AND organization_id = p_org_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COUNT_NOT_FOUND: %', p_count_id;
  END IF;
  IF v_count.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved counts can be posted (current status: %)', v_count.status;
  END IF;

  FOR v_line IN
    SELECT icl.item_id,
           icl.item_name,
           icl.variance,
           COALESCE(i.purchase_price, i.selling_price, 0) AS unit_rate
      FROM inventory_count_lines icl
      LEFT JOIN items i ON i.id = icl.item_id
     WHERE icl.count_id = p_count_id
       AND icl.item_id IS NOT NULL
       AND COALESCE(icl.variance, 0) <> 0
  LOOP
    -- Latest running balance for this item+warehouse
    SELECT COALESCE(balance_qty, 0)
      INTO v_prev_bal
      FROM stock_ledger
     WHERE organization_id = p_org_id
       AND item_id        = v_line.item_id
       AND warehouse_id   = v_count.warehouse_id
     ORDER BY posted_at DESC
     LIMIT 1;

    v_prev_bal := COALESCE(v_prev_bal, 0);
    v_new_bal  := v_prev_bal + v_line.variance;
    v_rate     := COALESCE(v_line.unit_rate, 0);

    INSERT INTO stock_ledger (
      organization_id, item_id, warehouse_id,
      transaction_type, quantity, rate, value,
      balance_qty, balance_value,
      reference_type, reference_id, notes,
      posted_by, posted_at
    ) VALUES (
      p_org_id, v_line.item_id, v_count.warehouse_id,
      'adjustment', v_line.variance, v_rate, v_line.variance * v_rate,
      v_new_bal, v_new_bal * v_rate,
      'inventory_count', p_count_id,
      'Inventory count variance: ' || v_line.item_name,
      auth.uid(), now()
    );

    UPDATE items
       SET current_stock = COALESCE(current_stock, 0) + v_line.variance
     WHERE id = v_line.item_id;
  END LOOP;

  UPDATE inventory_counts
     SET status = 'posted'
   WHERE id = p_count_id AND organization_id = p_org_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.post_inventory_variances(uuid, uuid) TO authenticated;

COMMIT;
