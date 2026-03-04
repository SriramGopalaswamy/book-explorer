-- Create a dedicated function for system-triggered expense journal posting
-- that bypasses auth checks since it's called from a trigger context
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
  _pid uuid;
  _jid uuid;
  _seq text;
  _td numeric;
BEGIN
  SELECT * INTO _exp FROM public.expenses WHERE id = _expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found: %', _expense_id; END IF;

  _expense_acct_id := get_gl_account_id(_exp.organization_id, '5100');
  _cash_id := get_gl_account_id(_exp.organization_id, '1100');
  IF _expense_acct_id IS NULL OR _cash_id IS NULL THEN
    RAISE EXCEPTION 'GL accounts not seeded for org %', _exp.organization_id;
  END IF;

  -- Determine safe posting date
  _use_date := COALESCE(_exp.expense_date::date, CURRENT_DATE);
  SELECT fp.id, fp.status INTO _pid, _fp_status
  FROM public.fiscal_periods fp
  WHERE fp.organization_id = _exp.organization_id
    AND _use_date BETWEEN fp.start_date AND fp.end_date
  LIMIT 1;

  IF _fp_status IS DISTINCT FROM 'open' OR _pid IS NULL THEN
    _use_date := CURRENT_DATE;
    SELECT fp.id INTO _pid
    FROM public.fiscal_periods fp
    WHERE fp.organization_id = _exp.organization_id
      AND CURRENT_DATE BETWEEN fp.start_date AND fp.end_date
      AND fp.status = 'open'
    LIMIT 1;
  END IF;

  IF _pid IS NULL THEN
    RAISE WARNING 'No open fiscal period found for expense journal posting';
    RETURN NULL;
  END IF;

  -- Idempotency check
  SELECT id INTO _jid FROM journal_entries 
  WHERE organization_id = _exp.organization_id AND source_type = 'expense' AND source_id = _exp.id;
  IF FOUND THEN RETURN _jid; END IF;

  _td := _exp.amount;
  _seq := next_document_sequence(_exp.organization_id, 'expense');

  -- Direct insert bypassing post_journal_entry's auth checks (we're in a trigger context)
  INSERT INTO journal_entries (
    organization_id, entry_date, memo, source_type, source_id,
    is_reversal, created_by, is_posted, status, document_sequence_number, fiscal_period_id
  ) VALUES (
    _exp.organization_id, _use_date, 
    'Expense: ' || COALESCE(_exp.description, _exp.category),
    'expense', _exp.id, false, 
    COALESCE(auth.uid(), _exp.user_id),
    true, 'posted', _seq, _pid
  ) RETURNING id INTO _jid;

  INSERT INTO journal_lines (journal_entry_id, gl_account_id, debit, credit, description)
  VALUES 
    (_jid, _expense_acct_id, _td, 0, 'Expense: ' || COALESCE(_exp.description, _exp.category)),
    (_jid, _cash_id, 0, _td, 'Cash out: ' || COALESCE(_exp.description, _exp.category));

  INSERT INTO audit_logs (actor_id, organization_id, action, entity_type, entity_id, actor_role, metadata)
  VALUES (
    COALESCE(auth.uid(), _exp.user_id), _exp.organization_id, 'JOURNAL_POSTED', 'journal_entry', _jid, 'system',
    jsonb_build_object('doc_type', 'expense', 'seq', _seq, 'total', _td, 'lines', 2, 'period', _pid)
  );

  RETURN _jid;
END;
$$;