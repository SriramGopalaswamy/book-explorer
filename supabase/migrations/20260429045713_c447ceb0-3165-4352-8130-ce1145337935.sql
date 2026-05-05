CREATE OR REPLACE FUNCTION public.check_payroll_entry_org_matches_run()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_run_org UUID;
BEGIN
  SELECT organization_id INTO v_run_org FROM public.payroll_runs WHERE id = NEW.payroll_run_id;
  IF v_run_org IS NULL THEN RAISE EXCEPTION 'payroll_run % not found', NEW.payroll_run_id; END IF;
  IF NEW.organization_id IS DISTINCT FROM v_run_org THEN
    RAISE EXCEPTION 'payroll_entries.organization_id (%) does not match payroll_runs.organization_id (%) for run %', NEW.organization_id, v_run_org, NEW.payroll_run_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_payroll_entry_org_check ON public.payroll_entries;
CREATE TRIGGER trg_payroll_entry_org_check BEFORE INSERT OR UPDATE OF organization_id, payroll_run_id ON public.payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.check_payroll_entry_org_matches_run();

CREATE OR REPLACE FUNCTION public.refresh_payroll_run_totals()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_run_id UUID;
BEGIN
  v_run_id := COALESCE(NEW.payroll_run_id, OLD.payroll_run_id);
  IF v_run_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE public.payroll_runs SET
    total_gross = COALESCE((SELECT SUM(gross_earnings) FROM public.payroll_entries WHERE payroll_run_id = v_run_id), 0),
    total_deductions = COALESCE((SELECT SUM(total_deductions) FROM public.payroll_entries WHERE payroll_run_id = v_run_id), 0),
    total_net = COALESCE((SELECT SUM(net_pay) FROM public.payroll_entries WHERE payroll_run_id = v_run_id), 0),
    employee_count = (SELECT COUNT(*) FROM public.payroll_entries WHERE payroll_run_id = v_run_id),
    updated_at = NOW()
  WHERE id = v_run_id;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_refresh_payroll_run_totals ON public.payroll_entries;
CREATE TRIGGER trg_refresh_payroll_run_totals AFTER INSERT OR UPDATE OF gross_earnings, total_deductions, net_pay OR DELETE ON public.payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.refresh_payroll_run_totals();