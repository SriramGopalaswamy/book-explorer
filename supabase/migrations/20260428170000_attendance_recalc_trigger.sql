-- Item 21: Trigger on attendance_records that invokes recalculate_attendance
-- for the affected employee's date whenever a row is inserted, updated, or deleted.
--
-- recalculate_attendance(_org_id, _start_date, _end_date) is SECURITY DEFINER
-- and is safe to call from a trigger. We call it in a WARNING-guarded block so
-- a recalculation failure never rolls back the original DML.

CREATE OR REPLACE FUNCTION public.trg_fn_recalc_attendance_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_date   DATE;
BEGIN
  -- Determine affected org and date from whichever row is available
  IF TG_OP = 'DELETE' THEN
    v_org_id := OLD.organization_id;
    v_date   := OLD.date;
  ELSE
    v_org_id := NEW.organization_id;
    v_date   := NEW.date;
  END IF;

  IF v_org_id IS NULL OR v_date IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    PERFORM public.recalculate_attendance(v_org_id, v_date, v_date);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_fn_recalc_attendance_on_change: recalculate_attendance failed for org=% date=%: %',
      v_org_id, v_date, SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_attendance_on_change ON public.attendance_records;
CREATE TRIGGER trg_recalc_attendance_on_change
  AFTER INSERT OR UPDATE OF date, organization_id, status, check_in, check_out, hours_worked
  OR DELETE
  ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_recalc_attendance_on_change();
