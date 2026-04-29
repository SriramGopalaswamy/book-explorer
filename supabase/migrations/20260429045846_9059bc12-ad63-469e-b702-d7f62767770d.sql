CREATE OR REPLACE FUNCTION public.trg_fn_sync_item_current_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item_id UUID;
BEGIN
  v_item_id := COALESCE(NEW.item_id, OLD.item_id);
  IF v_item_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE public.items SET
    current_stock = COALESCE((
      SELECT SUM(CASE
        WHEN sl.transaction_type IN ('purchase','transfer_in','production_in','opening','return') THEN sl.quantity
        WHEN sl.transaction_type IN ('sale','transfer_out','production_out') THEN -sl.quantity
        ELSE sl.quantity
      END)
      FROM public.stock_ledger sl WHERE sl.item_id = v_item_id
    ), 0),
    updated_at = NOW()
  WHERE id = v_item_id;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_sync_item_current_stock ON public.stock_ledger;
CREATE TRIGGER trg_sync_item_current_stock
  AFTER INSERT OR UPDATE OF item_id, quantity, transaction_type OR DELETE
  ON public.stock_ledger FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_item_current_stock();