-- Fix: trial_balance referenced a.account_code / a.account_name, but
-- public.gl_accounts has columns `code` and `name`. The original
-- migration (20260508052855) compiled because PL/pgSQL only resolves
-- column references at execution time; the first call raised
-- "column a.account_code does not exist".
--
-- This file re-creates the function with the correct column names and
-- aliases them back to account_code/account_name in the result so
-- consumers can keep the canonical names. gl_account_balance is
-- untouched (it didn't reference those columns).

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
    a.code AS account_code,
    a.name AS account_name,
    a.account_type,
    COALESCE(SUM(jl.debit), 0)::numeric  AS debit_total,
    COALESCE(SUM(jl.credit), 0)::numeric AS credit_total,
    (COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0))::numeric AS balance
  FROM public.gl_accounts a
  LEFT JOIN public.journal_lines jl
    ON jl.gl_account_id = a.id
   AND jl.organization_id = v_org
  LEFT JOIN public.journal_entries je
    ON je.id = jl.journal_entry_id
   AND je.entry_date <= p_as_of
   AND COALESCE(je.status, 'posted') = 'posted'
  WHERE a.organization_id = v_org
  GROUP BY a.id, a.code, a.name, a.account_type
  ORDER BY a.code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trial_balance(date) TO authenticated;
