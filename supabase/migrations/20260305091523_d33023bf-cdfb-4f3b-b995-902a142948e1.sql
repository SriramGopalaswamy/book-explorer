
-- Fix RPCs to allow service_role access (used by simulation engine)
-- The issue: auth.uid() is NULL when called via service_role, causing "Access denied"

CREATE OR REPLACE FUNCTION public.get_profit_loss(p_org_id uuid, p_from date, p_to date)
RETURNS TABLE(account_id uuid, account_code text, account_name text, account_type text, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    IF NOT is_org_member(auth.uid(), p_org_id) AND NOT is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  RETURN QUERY
  SELECT ga.id, ga.code, ga.name, ga.account_type,
    CASE WHEN ga.account_type = 'revenue' THEN COALESCE(SUM(jl.credit - jl.debit), 0)
         ELSE COALESCE(SUM(jl.debit - jl.credit), 0) END AS amount
  FROM gl_accounts ga
  LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
    AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = jl.journal_entry_id
      AND je.organization_id = p_org_id AND je.is_posted = true AND je.entry_date BETWEEN p_from AND p_to)
  WHERE ga.organization_id = p_org_id AND ga.account_type IN ('revenue', 'expense') AND ga.is_active = true
  GROUP BY ga.id, ga.code, ga.name, ga.account_type
  HAVING COALESCE(SUM(jl.debit), 0) + COALESCE(SUM(jl.credit), 0) > 0
  ORDER BY ga.account_type DESC, ga.code;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_balance_sheet(p_org_id uuid, p_as_of date)
RETURNS TABLE(account_id uuid, account_code text, account_name text, account_type text, balance numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    IF NOT is_org_member(auth.uid(), p_org_id) AND NOT is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  RETURN QUERY
  SELECT ga.id, ga.code, ga.name, ga.account_type,
    CASE WHEN ga.normal_balance = 'debit' THEN COALESCE(SUM(jl.debit - jl.credit), 0)
         ELSE COALESCE(SUM(jl.credit - jl.debit), 0) END AS balance
  FROM gl_accounts ga
  LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
    AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = jl.journal_entry_id
      AND je.organization_id = p_org_id AND je.is_posted = true AND je.entry_date <= p_as_of)
  WHERE ga.organization_id = p_org_id AND ga.account_type IN ('asset', 'liability', 'equity') AND ga.is_active = true
  GROUP BY ga.id, ga.code, ga.name, ga.account_type, ga.normal_balance
  HAVING COALESCE(SUM(jl.debit), 0) + COALESCE(SUM(jl.credit), 0) > 0
  ORDER BY CASE ga.account_type WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 WHEN 'equity' THEN 3 END, ga.code;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_trial_balance(p_org_id uuid, p_from date, p_to date)
RETURNS TABLE(account_id uuid, account_code text, account_name text, account_type text, normal_balance text, total_debit numeric, total_credit numeric, net_balance numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    IF NOT is_org_member(auth.uid(), p_org_id) AND NOT is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  RETURN QUERY
  SELECT ga.id, ga.code, ga.name, ga.account_type, ga.normal_balance,
    COALESCE(SUM(jl.debit), 0), COALESCE(SUM(jl.credit), 0), COALESCE(SUM(jl.debit - jl.credit), 0)
  FROM gl_accounts ga
  LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
    AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = jl.journal_entry_id
      AND je.organization_id = p_org_id AND je.is_posted = true AND je.entry_date BETWEEN p_from AND p_to)
  WHERE ga.organization_id = p_org_id AND ga.is_active = true
  GROUP BY ga.id, ga.code, ga.name, ga.account_type, ga.normal_balance
  ORDER BY ga.code;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_flow_indirect(p_org_id uuid, p_from date, p_to date)
RETURNS TABLE(section text, description text, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_net_income numeric; v_ar_change numeric; v_ap_change numeric; v_asset_change numeric;
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    IF NOT is_org_member(auth.uid(), p_org_id) AND NOT is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN ga.account_type = 'revenue' THEN jl.credit - jl.debit
    WHEN ga.account_type = 'expense' THEN -(jl.debit - jl.credit) ELSE 0 END), 0)
  INTO v_net_income FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  JOIN gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = p_org_id AND je.is_posted = true
    AND je.entry_date BETWEEN p_from AND p_to AND ga.account_type IN ('revenue', 'expense');

  SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_ar_change
  FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
  JOIN gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = p_org_id AND je.is_posted = true
    AND je.entry_date BETWEEN p_from AND p_to AND ga.code = '1200';

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_ap_change
  FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
  JOIN gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = p_org_id AND je.is_posted = true
    AND je.entry_date BETWEEN p_from AND p_to AND ga.code = '2100';

  SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_asset_change
  FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
  JOIN gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = p_org_id AND je.is_posted = true
    AND je.entry_date BETWEEN p_from AND p_to AND ga.code = '1400';

  RETURN QUERY VALUES
    ('operating'::text, 'Net Income'::text, v_net_income),
    ('operating', 'Decrease/(Increase) in AR', -v_ar_change),
    ('operating', 'Increase/(Decrease) in AP', v_ap_change),
    ('operating', 'Cash from Operations', v_net_income - v_ar_change + v_ap_change),
    ('investing', 'Purchase of Fixed Assets', -v_asset_change),
    ('investing', 'Cash from Investing', -v_asset_change),
    ('net', 'Net Cash Flow', v_net_income - v_ar_change + v_ap_change - v_asset_change);
END;
$$;
