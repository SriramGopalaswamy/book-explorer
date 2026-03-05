
-- 1. Trigger: Prevent overlapping leave requests for same user
CREATE OR REPLACE FUNCTION public.validate_leave_no_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.leave_requests
    WHERE user_id = NEW.user_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
      AND status NOT IN ('rejected', 'cancelled')
      AND NEW.from_date <= to_date
      AND NEW.to_date >= from_date
  ) THEN
    RAISE EXCEPTION 'Overlapping leave request exists for this date range';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_no_overlap ON public.leave_requests;
CREATE TRIGGER trg_leave_no_overlap
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_leave_no_overlap();

-- 2. Trigger: Prevent leave days exceeding available balance
CREATE OR REPLACE FUNCTION public.validate_leave_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  available_days numeric;
BEGIN
  SELECT (total_days - used_days) INTO available_days
  FROM public.leave_balances
  WHERE user_id = NEW.user_id
    AND leave_type = NEW.leave_type
    AND year = EXTRACT(YEAR FROM NEW.from_date)::int
  LIMIT 1;

  IF available_days IS NOT NULL AND NEW.days > available_days THEN
    RAISE EXCEPTION 'Leave days (%) exceed available balance (%)', NEW.days, available_days;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_balance_check ON public.leave_requests;
CREATE TRIGGER trg_leave_balance_check
  BEFORE INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_leave_balance();

-- 3. Trigger: Prevent expenses in closed fiscal periods
CREATE OR REPLACE FUNCTION public.validate_expense_not_in_closed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fiscal_periods
    WHERE organization_id = NEW.organization_id
      AND status = 'closed'
      AND NEW.date >= start_date
      AND NEW.date <= end_date
  ) THEN
    RAISE EXCEPTION 'Expense date falls in a closed fiscal period';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_closed_period ON public.expenses;
CREATE TRIGGER trg_expense_closed_period
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.validate_expense_not_in_closed_period();

-- 4. Trigger: Prevent payroll records for inactive employees
CREATE OR REPLACE FUNCTION public.validate_payroll_active_employee()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  emp_status text;
BEGIN
  SELECT status INTO emp_status
  FROM public.profiles
  WHERE id = NEW.profile_id;

  IF emp_status IS NOT NULL AND emp_status != 'active' THEN
    RAISE EXCEPTION 'Cannot create payroll record for inactive employee (status: %)', emp_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_active_employee ON public.payroll_records;
CREATE TRIGGER trg_payroll_active_employee
  BEFORE INSERT ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_payroll_active_employee();

-- 5. Trigger: Prevent journal entries in closed fiscal periods
CREATE OR REPLACE FUNCTION public.validate_je_not_in_closed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_posted = true AND EXISTS (
    SELECT 1 FROM public.fiscal_periods
    WHERE organization_id = NEW.organization_id
      AND status = 'closed'
      AND NEW.entry_date >= start_date
      AND NEW.entry_date <= end_date
  ) THEN
    RAISE EXCEPTION 'Cannot post journal entry in a closed fiscal period';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_je_closed_period ON public.journal_entries;
CREATE TRIGGER trg_je_closed_period
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_je_not_in_closed_period();
