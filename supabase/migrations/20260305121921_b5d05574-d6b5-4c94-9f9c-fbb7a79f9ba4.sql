
-- 6. BILLS: Cap TDS rate at 100%
CREATE OR REPLACE FUNCTION public.validate_bill_tds_rate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tds_rate IS NOT NULL AND NEW.tds_rate > 100 THEN
    RAISE EXCEPTION 'TDS rate cannot exceed 100 percent (got: %)', NEW.tds_rate;
  END IF;
  IF NEW.tds_rate IS NOT NULL AND NEW.tds_rate < 0 THEN
    RAISE EXCEPTION 'TDS rate cannot be negative (got: %)', NEW.tds_rate;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.validate_bill_tds_rate() SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_bill_tds ON public.bills;
CREATE TRIGGER trg_validate_bill_tds
  BEFORE INSERT OR UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.validate_bill_tds_rate();

-- 7. GOAL PLANS: Validate total weightage <= 100
CREATE OR REPLACE FUNCTION public.validate_goal_plan_weightage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total numeric := 0;
  v_item jsonb;
BEGIN
  IF NEW.items IS NOT NULL AND jsonb_typeof(NEW.items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      v_total := v_total + COALESCE((v_item->>'weightage')::numeric, 0);
    END LOOP;

    IF v_total > 100 THEN
      RAISE EXCEPTION 'Goal plan total weightage cannot exceed 100 percent (got: %)', v_total;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.validate_goal_plan_weightage() SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_goal_weightage ON public.goal_plans;
CREATE TRIGGER trg_validate_goal_weightage
  BEFORE INSERT OR UPDATE ON public.goal_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_goal_plan_weightage();

-- 8. JOURNAL ENTRIES: Validate balance on INSERT when posted
CREATE OR REPLACE FUNCTION public.validate_journal_balance_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  total_debit numeric;
  total_credit numeric;
BEGIN
  IF NEW.is_posted = true THEN
    SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
    INTO total_debit, total_credit
    FROM public.journal_entry_lines
    WHERE journal_entry_id = NEW.id;

    IF ABS(total_debit - total_credit) > 0.01 THEN
      RAISE EXCEPTION 'Cannot create posted journal entry with imbalanced lines: debit=% credit=%', total_debit, total_credit;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.validate_journal_balance_on_insert() SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_journal_balance_insert ON public.journal_entries;
CREATE TRIGGER trg_validate_journal_balance_insert
  AFTER INSERT ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_journal_balance_on_insert();

-- 9. PAYROLL: Prevent duplicate active payroll records in same period
CREATE OR REPLACE FUNCTION public.validate_payroll_no_duplicate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.payroll_records
    WHERE profile_id = NEW.profile_id
      AND pay_period = NEW.pay_period
      AND organization_id = NEW.organization_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status NOT IN ('superseded', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Duplicate active payroll record exists for employee in period %', NEW.pay_period;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.validate_payroll_no_duplicate() SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_payroll_no_duplicate ON public.payroll_records;
CREATE TRIGGER trg_validate_payroll_no_duplicate
  BEFORE INSERT ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_payroll_no_duplicate();
