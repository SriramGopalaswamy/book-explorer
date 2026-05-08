
CREATE OR REPLACE FUNCTION public.gl_account_balance(
  p_account_id uuid,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS TABLE(debit_total numeric, credit_total numeric, balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid());
BEGIN
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT
    COALESCE(SUM(jl.debit), 0)::numeric AS debit_total,
    COALESCE(SUM(jl.credit), 0)::numeric AS credit_total,
    (COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0))::numeric AS balance
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org
    AND jl.gl_account_id = p_account_id
    AND je.entry_date <= p_as_of
    AND COALESCE(je.status, 'posted') = 'posted';
END;
$$;
GRANT EXECUTE ON FUNCTION public.gl_account_balance(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.trial_balance(p_as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  debit_total numeric,
  credit_total numeric,
  balance numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid());
BEGIN
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT
    a.id AS account_id,
    a.account_code,
    a.account_name,
    a.account_type,
    COALESCE(SUM(jl.debit),0)::numeric AS debit_total,
    COALESCE(SUM(jl.credit),0)::numeric AS credit_total,
    (COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0))::numeric AS balance
  FROM public.gl_accounts a
  LEFT JOIN public.journal_lines jl
    ON jl.gl_account_id = a.id
   AND jl.organization_id = v_org
  LEFT JOIN public.journal_entries je
    ON je.id = jl.journal_entry_id
   AND je.entry_date <= p_as_of
   AND COALESCE(je.status,'posted') = 'posted'
  WHERE a.organization_id = v_org
  GROUP BY a.id, a.account_code, a.account_name, a.account_type
  ORDER BY a.account_code;
END;
$$;
GRANT EXECUTE ON FUNCTION public.trial_balance(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.cash_flow_summary(
  p_from date,
  p_to date
)
RETURNS TABLE(inflow numeric, outflow numeric, net_cash numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid());
BEGIN
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN bt.transaction_type = 'credit' THEN bt.amount ELSE 0 END),0)::numeric,
    COALESCE(SUM(CASE WHEN bt.transaction_type = 'debit'  THEN bt.amount ELSE 0 END),0)::numeric,
    COALESCE(SUM(CASE WHEN bt.transaction_type = 'credit' THEN bt.amount
                      WHEN bt.transaction_type = 'debit'  THEN -bt.amount
                      ELSE 0 END),0)::numeric
  FROM public.bank_transactions bt
  WHERE bt.organization_id = v_org
    AND bt.transaction_date BETWEEN p_from AND p_to;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cash_flow_summary(date, date) TO authenticated;
