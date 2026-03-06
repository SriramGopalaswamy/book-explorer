-- Fix trigger that references NEW.date instead of NEW.expense_date
CREATE OR REPLACE FUNCTION validate_expense_not_in_closed_period()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fiscal_periods
    WHERE organization_id = NEW.organization_id
      AND status = 'closed'
      AND NEW.expense_date >= start_date
      AND NEW.expense_date <= end_date
  ) THEN
    RAISE EXCEPTION 'Expense date falls in a closed fiscal period';
  END IF;
  RETURN NEW;
END;
$$;