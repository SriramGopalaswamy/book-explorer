
CREATE OR REPLACE FUNCTION public.guard_vendor_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bills    int;
  v_pos      int;
BEGIN
  SELECT count(*) INTO v_bills FROM public.bills WHERE vendor_id = OLD.id;
  SELECT count(*) INTO v_pos   FROM public.purchase_orders WHERE vendor_id = OLD.id;

  IF v_bills > 0 OR v_pos > 0 THEN
    RAISE EXCEPTION
      'Cannot delete vendor "%": has % bill(s) and % purchase order(s). Mark the vendor inactive instead.',
      OLD.name, v_bills, v_pos
    USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_vendor_delete ON public.vendors;
CREATE TRIGGER trg_guard_vendor_delete
  BEFORE DELETE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_delete();
