
-- Fix reconciliation: AR operational should only count sent/overdue invoices (not drafts)
CREATE OR REPLACE FUNCTION public.run_full_reconciliation(_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _total_debits NUMERIC;
  _total_credits NUMERIC;
  _trial_balance_ok BOOLEAN;
  _orphaned_entries BIGINT;
  _single_sided BIGINT;
  _revenue_ledger NUMERIC;
  _revenue_operational NUMERIC;
  _ar_ledger NUMERIC;
  _ar_operational NUMERIC;
  _cash_ledger NUMERIC;
  _score INT := 100;
  _issues JSONB := '[]'::jsonb;
BEGIN
  -- 1. Trial Balance
  SELECT COALESCE(SUM(jl.debit), 0), COALESCE(SUM(jl.credit), 0)
  INTO _total_debits, _total_credits
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.organization_id = _org_id;

  _trial_balance_ok := (_total_debits = _total_credits);
  IF NOT _trial_balance_ok THEN
    _score := _score - 30;
    _issues := _issues || jsonb_build_object('check', 'trial_balance', 'debits', _total_debits, 'credits', _total_credits, 'variance', _total_debits - _total_credits);
  END IF;

  -- 2. Orphaned entries
  SELECT count(*) INTO _orphaned_entries
  FROM public.journal_entries je
  WHERE je.organization_id = _org_id
  AND NOT EXISTS (SELECT 1 FROM public.journal_lines jl WHERE jl.journal_entry_id = je.id);
  IF _orphaned_entries > 0 THEN
    _score := _score - 10;
    _issues := _issues || jsonb_build_object('check', 'orphaned_entries', 'count', _orphaned_entries);
  END IF;

  -- 3. Unbalanced entries
  SELECT count(*) INTO _single_sided
  FROM (
    SELECT jl.journal_entry_id
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.organization_id = _org_id
    GROUP BY jl.journal_entry_id
    HAVING SUM(jl.debit) != SUM(jl.credit)
  ) unbalanced;
  IF _single_sided > 0 THEN
    _score := _score - 20;
    _issues := _issues || jsonb_build_object('check', 'unbalanced_entries', 'count', _single_sided);
  END IF;

  -- 4. Revenue reconciliation (only sent/paid invoices have been posted)
  SELECT COALESCE(SUM(jl.credit), 0) INTO _revenue_ledger
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = _org_id AND ga.account_type = 'revenue';

  SELECT COALESCE(SUM(total_amount), 0) INTO _revenue_operational
  FROM public.invoices
  WHERE organization_id = _org_id AND status IN ('sent', 'paid');

  IF _revenue_ledger != _revenue_operational THEN
    _score := _score - 10;
    _issues := _issues || jsonb_build_object('check', 'revenue_reconciliation', 'ledger', _revenue_ledger, 'operational', _revenue_operational, 'variance', _revenue_ledger - _revenue_operational);
  END IF;

  -- 5. AR: only sent/overdue invoices (not draft, not paid — paid ones are cleared)
  SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) INTO _ar_ledger
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = _org_id AND ga.code = '1200';

  SELECT COALESCE(SUM(total_amount), 0) INTO _ar_operational
  FROM public.invoices
  WHERE organization_id = _org_id AND status IN ('sent', 'overdue');

  IF _ar_ledger != _ar_operational THEN
    _score := _score - 10;
    _issues := _issues || jsonb_build_object('check', 'ar_reconciliation', 'ledger', _ar_ledger, 'operational', _ar_operational, 'variance', _ar_ledger - _ar_operational);
  END IF;

  -- 6. Cash
  SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) INTO _cash_ledger
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = _org_id AND ga.code = '1100';

  _score := GREATEST(_score, 0);

  RETURN jsonb_build_object(
    'integrity_score', _score,
    'trial_balance', jsonb_build_object('total_debits', _total_debits, 'total_credits', _total_credits, 'balanced', _trial_balance_ok),
    'revenue', jsonb_build_object('ledger', _revenue_ledger, 'operational', _revenue_operational),
    'accounts_receivable', jsonb_build_object('ledger', _ar_ledger, 'operational', _ar_operational),
    'cash_balance', _cash_ledger,
    'orphaned_entries', _orphaned_entries,
    'unbalanced_entries', _single_sided,
    'issues', _issues,
    'org_id', _org_id
  );
END;
$$;
