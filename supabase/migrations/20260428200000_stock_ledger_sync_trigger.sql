-- Item 27: Trigger on stock_ledger that keeps items.current_stock in sync.
--
-- stock_ledger does NOT carry a bin_location_id FK, so bin_locations.current_units
-- cannot be maintained from this trigger. That column must be updated via
-- stock_transfers or warehouse-specific adjustment flows.
--
-- Logic:
--   items.current_stock = SUM(quantity) for all stock_ledger rows for that item
--   where transaction_type is an inbound type (purchase, transfer_in, production_in,
--   opening, return) minus outbound types (sale, transfer_out, production_out,
--   adjustment with negative qty).
--
-- Simpler and more robust: re-sum ALL rows for the item after any change, using
-- signed quantities. Inbound txn_types carry positive quantity; outbound carry
-- negative quantity — the application is expected to record outbound rows with
-- a positive quantity and the sign is implied by the type. We read `quantity` as
-- stored (positive = in, negative = out) based on the existing data contract.

CREATE OR REPLACE FUNCTION public.trg_fn_sync_item_current_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id UUID;
BEGIN
  v_item_id := COALESCE(NEW.item_id, OLD.item_id);
  IF v_item_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Re-derive current_stock as the running sum of signed quantities.
  -- Inbound types: purchase, transfer_in, production_in, opening, return → positive
  -- Outbound types: sale, transfer_out, production_out, adjustment → negative (qty stored negative by convention)
  -- adjustment can be positive or negative — use quantity as-is.
  UPDATE public.items
  SET
    current_stock = COALESCE((
      SELECT SUM(
        CASE
          WHEN sl.transaction_type IN ('purchase', 'transfer_in', 'production_in', 'opening', 'return')
          THEN  sl.quantity
          WHEN sl.transaction_type IN ('sale', 'transfer_out', 'production_out')
          THEN -sl.quantity
          ELSE  sl.quantity   -- 'adjustment': quantity carries its own sign
        END
      )
      FROM public.stock_ledger sl
      WHERE sl.item_id = v_item_id
    ), 0),
    updated_at = NOW()
  WHERE id = v_item_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_item_current_stock ON public.stock_ledger;
CREATE TRIGGER trg_sync_item_current_stock
  AFTER INSERT OR UPDATE OF item_id, quantity, transaction_type
  OR DELETE
  ON public.stock_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_sync_item_current_stock();
