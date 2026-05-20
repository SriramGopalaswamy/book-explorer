
CREATE OR REPLACE FUNCTION public.enforce_payroll_run_has_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  child_count INT;
BEGIN
  IF NEW.status IN ('processed','approved','completed','paid')
     AND COALESCE(NEW.employee_count,0) > 0 THEN
    SELECT COUNT(*) INTO child_count
    FROM public.payroll_entries
    WHERE payroll_run_id = NEW.id;

    IF child_count = 0 THEN
      RAISE EXCEPTION
        'payroll_runs.% cannot be % with employee_count=% and zero payroll_entries',
        NEW.id, NEW.status, NEW.employee_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_payroll_run_has_entries ON public.payroll_runs;
CREATE CONSTRAINT TRIGGER trg_enforce_payroll_run_has_entries
AFTER INSERT OR UPDATE ON public.payroll_runs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_payroll_run_has_entries();
