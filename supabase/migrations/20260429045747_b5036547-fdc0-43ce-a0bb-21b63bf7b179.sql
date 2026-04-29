CREATE OR REPLACE FUNCTION public.trg_fn_recalc_attendance_on_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org_id UUID; v_date DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN v_org_id := OLD.organization_id; v_date := OLD.date;
  ELSE v_org_id := NEW.organization_id; v_date := NEW.date; END IF;
  IF v_org_id IS NULL OR v_date IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  BEGIN PERFORM public.recalculate_attendance(v_org_id, v_date, v_date);
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'recalc failed for org=% date=%: %', v_org_id, v_date, SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_recalc_attendance_on_change ON public.attendance_records;
CREATE TRIGGER trg_recalc_attendance_on_change
  AFTER INSERT OR UPDATE OF date, organization_id, status, check_in, check_out OR DELETE
  ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.trg_fn_recalc_attendance_on_change();