-- Fix 1: Replace the auto_set_organization_id trigger on compensation_revision_requests
-- The generic trigger references NEW.user_id but this table has no user_id column
-- Since organization_id is NOT NULL, we just need a no-op or a custom trigger

DROP TRIGGER IF EXISTS trg_auto_org_crr ON public.compensation_revision_requests;

-- Create a specific trigger function that uses requested_by instead of user_id
CREATE OR REPLACE FUNCTION auto_set_org_id_from_requested_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.requested_by IS NOT NULL THEN
    NEW.organization_id := get_user_organization_id(NEW.requested_by);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_org_crr
  BEFORE INSERT ON public.compensation_revision_requests
  FOR EACH ROW EXECUTE FUNCTION auto_set_org_id_from_requested_by();

-- Fix 2: Add validation triggers for data integrity (chaos test anomalies)

-- Expense amount must be positive
CREATE OR REPLACE FUNCTION validate_expense_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount IS NOT NULL AND NEW.amount < 0 THEN
    RAISE EXCEPTION 'Expense amount must be non-negative';
  END IF;
  IF NEW.expense_date > (CURRENT_DATE + INTERVAL '30 days') THEN
    RAISE EXCEPTION 'Expense date cannot be more than 30 days in the future';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_expense ON public.expenses;
CREATE TRIGGER trg_validate_expense
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION validate_expense_amount();

-- Invoice amount must be positive
CREATE OR REPLACE FUNCTION validate_invoice_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount IS NOT NULL AND NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Invoice amount must be positive';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_invoice ON public.invoices;
CREATE TRIGGER trg_validate_invoice
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION validate_invoice_amount();

-- Leave request validation: days > 0, to_date >= from_date
CREATE OR REPLACE FUNCTION validate_leave_request()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.days IS NOT NULL AND NEW.days <= 0 THEN
    RAISE EXCEPTION 'Leave days must be positive';
  END IF;
  IF NEW.to_date < NEW.from_date THEN
    RAISE EXCEPTION 'Leave end date cannot be before start date';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_leave ON public.leave_requests;
CREATE TRIGGER trg_validate_leave
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION validate_leave_request();

-- Payroll record validation: no negative salary, paid_days <= working_days
CREATE OR REPLACE FUNCTION validate_payroll_record()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.basic_salary IS NOT NULL AND NEW.basic_salary < 0 THEN
    RAISE EXCEPTION 'Basic salary cannot be negative';
  END IF;
  IF NEW.net_pay IS NOT NULL AND NEW.net_pay < 0 THEN
    RAISE EXCEPTION 'Net pay cannot be negative';
  END IF;
  IF NEW.paid_days IS NOT NULL AND NEW.working_days IS NOT NULL AND NEW.paid_days > NEW.working_days THEN
    RAISE EXCEPTION 'Paid days cannot exceed working days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payroll ON public.payroll_records;
CREATE TRIGGER trg_validate_payroll
  BEFORE INSERT OR UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION validate_payroll_record();

-- Reimbursement amount must be positive
CREATE OR REPLACE FUNCTION validate_reimbursement_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount IS NOT NULL AND NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Reimbursement amount must be positive';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_reimbursement ON public.reimbursement_requests;
CREATE TRIGGER trg_validate_reimbursement
  BEFORE INSERT OR UPDATE ON public.reimbursement_requests
  FOR EACH ROW EXECUTE FUNCTION validate_reimbursement_amount();

-- Journal entry balance validation trigger (block imbalanced posted entries)
CREATE OR REPLACE FUNCTION validate_journal_balance_on_post()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  total_debit NUMERIC;
  total_credit NUMERIC;
BEGIN
  -- Only validate when status changes to 'posted'
  IF NEW.status = 'posted' AND (OLD IS NULL OR OLD.status != 'posted') THEN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO total_debit, total_credit
    FROM public.journal_lines
    WHERE journal_entry_id = NEW.id;
    
    IF ABS(total_debit - total_credit) > 0.01 THEN
      RAISE EXCEPTION 'Journal entry is imbalanced: debit=% credit=%', total_debit, total_credit;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_journal_balance ON public.journal_entries;
CREATE TRIGGER trg_validate_journal_balance
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION validate_journal_balance_on_post();