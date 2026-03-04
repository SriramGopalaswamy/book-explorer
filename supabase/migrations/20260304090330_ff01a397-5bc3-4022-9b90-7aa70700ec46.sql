-- Fix post_expense_journal to fallback to CURRENT_DATE if expense_date is in a closed period
CREATE OR REPLACE FUNCTION public.post_expense_journal(_expense_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _exp RECORD;
  _expense_acct_id uuid;
  _cash_id uuid;
  _use_date date;
  _fp_status text;
BEGIN
  SELECT * INTO _exp FROM public.expenses WHERE id = _expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found: %', _expense_id; END IF;

  _expense_acct_id := get_gl_account_id(_exp.organization_id, '5100');
  _cash_id := get_gl_account_id(_exp.organization_id, '1100');
  IF _expense_acct_id IS NULL OR _cash_id IS NULL THEN
    RAISE EXCEPTION 'GL accounts not seeded for org %', _exp.organization_id;
  END IF;

  -- Determine safe posting date: use expense_date if its period is open, else CURRENT_DATE
  _use_date := COALESCE(_exp.expense_date::date, CURRENT_DATE);
  SELECT fp.status INTO _fp_status
  FROM public.fiscal_periods fp
  WHERE fp.organization_id = _exp.organization_id
    AND _use_date BETWEEN fp.start_date AND fp.end_date
  LIMIT 1;

  IF _fp_status IS DISTINCT FROM 'open' THEN
    _use_date := CURRENT_DATE;
  END IF;

  RETURN post_journal_entry(
    _exp.organization_id,
    'expense',
    _exp.id,
    _use_date,
    'Expense: ' || COALESCE(_exp.description, _exp.category),
    jsonb_build_array(
      jsonb_build_object('gl_account_id', _expense_acct_id, 'debit', _exp.amount, 'credit', 0, 'description', 'Expense: ' || COALESCE(_exp.description, _exp.category)),
      jsonb_build_object('gl_account_id', _cash_id, 'debit', 0, 'credit', _exp.amount, 'description', 'Cash out: ' || COALESCE(_exp.description, _exp.category))
    )
  );
END;
$$;

-- Wrap the trigger to not block status updates if journal posting fails
CREATE OR REPLACE FUNCTION public.trigger_post_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD IS NULL OR OLD.status != 'paid') THEN
    BEGIN
      PERFORM post_expense_journal(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post_expense_journal failed for expense %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;