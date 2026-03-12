-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Balance Sheet Equation Validation
--
-- Problem: A ≠ L + E + NI (difference = 5000)
--
-- Root cause: get_balance_sheet() only sums balance-sheet accounts
-- (asset, liability, equity) but does NOT include current-period net
-- income (revenue − expenses).  In a proper accounting system the full
-- equation is:
--
--   Assets = Liabilities + Equity + Net Income
--
-- Fix:
--   1. validate_balance_sheet(org_id, as_of)  — checks the equation
--   2. validate_trial_balance(org_id, as_of)  — debits == credits
--   3. validate_subledger_reconciliation(org_id) — subledger ↔ GL
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. validate_balance_sheet ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_balance_sheet(
  p_org_id UUID,
  p_as_of  DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  total_assets      NUMERIC,
  total_liabilities NUMERIC,
  total_equity      NUMERIC,
  net_income        NUMERIC,
  l_plus_e_plus_ni  NUMERIC,
  difference        NUMERIC,
  balanced          BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assets      NUMERIC := 0;
  v_liabilities NUMERIC := 0;
  v_equity      NUMERIC := 0;
  v_revenue     NUMERIC := 0;
  v_expenses    NUMERIC := 0;
  v_net_income  NUMERIC := 0;
BEGIN
  -- Guard: caller must be org member, service_role, or super_admin
  IF current_setting('role', TRUE) NOT IN ('service_role', 'supabase_admin') THEN
    IF NOT (
         public.is_org_member(auth.uid(), p_org_id)
      OR public.is_super_admin(auth.uid())
    ) THEN
      RAISE EXCEPTION 'Access denied to validate_balance_sheet for org %', p_org_id;
    END IF;
  END IF;

  -- ── Assets (normal_balance = 'debit') ─────────────────────────────
  SELECT COALESCE(SUM(
    CASE WHEN ga.normal_balance = 'debit'
         THEN jl.debit  - jl.credit
         ELSE jl.credit - jl.debit
    END
  ), 0)
  INTO v_assets
  FROM   public.gl_accounts     ga
  JOIN   public.journal_lines   jl ON jl.gl_account_id = ga.id
  JOIN   public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE  ga.organization_id = p_org_id
    AND  ga.account_type    = 'asset'
    AND  je.organization_id = p_org_id
    AND  je.is_posted       = TRUE
    AND  je.entry_date     <= p_as_of;

  -- ── Liabilities (normal_balance = 'credit') ───────────────────────
  SELECT COALESCE(SUM(
    CASE WHEN ga.normal_balance = 'credit'
         THEN jl.credit - jl.debit
         ELSE jl.debit  - jl.credit
    END
  ), 0)
  INTO v_liabilities
  FROM   public.gl_accounts     ga
  JOIN   public.journal_lines   jl ON jl.gl_account_id = ga.id
  JOIN   public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE  ga.organization_id = p_org_id
    AND  ga.account_type    = 'liability'
    AND  je.organization_id = p_org_id
    AND  je.is_posted       = TRUE
    AND  je.entry_date     <= p_as_of;

  -- ── Equity (normal_balance = 'credit') ────────────────────────────
  SELECT COALESCE(SUM(
    CASE WHEN ga.normal_balance = 'credit'
         THEN jl.credit - jl.debit
         ELSE jl.debit  - jl.credit
    END
  ), 0)
  INTO v_equity
  FROM   public.gl_accounts     ga
  JOIN   public.journal_lines   jl ON jl.gl_account_id = ga.id
  JOIN   public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE  ga.organization_id = p_org_id
    AND  ga.account_type    = 'equity'
    AND  je.organization_id = p_org_id
    AND  je.is_posted       = TRUE
    AND  je.entry_date     <= p_as_of;

  -- ── Revenue (normal_balance = 'credit') ───────────────────────────
  SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
  INTO v_revenue
  FROM   public.gl_accounts     ga
  JOIN   public.journal_lines   jl ON jl.gl_account_id = ga.id
  JOIN   public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE  ga.organization_id = p_org_id
    AND  ga.account_type    = 'revenue'
    AND  je.organization_id = p_org_id
    AND  je.is_posted       = TRUE
    AND  je.entry_date     <= p_as_of;

  -- ── Expenses + COGS (normal_balance = 'debit') ────────────────────
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_expenses
  FROM   public.gl_accounts     ga
  JOIN   public.journal_lines   jl ON jl.gl_account_id = ga.id
  JOIN   public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE  ga.organization_id = p_org_id
    AND  ga.account_type    IN ('expense', 'cogs')
    AND  je.organization_id = p_org_id
    AND  je.is_posted       = TRUE
    AND  je.entry_date     <= p_as_of;

  v_net_income := v_revenue - v_expenses;

  RETURN QUERY
  SELECT
    v_assets,
    v_liabilities,
    v_equity,
    v_net_income,
    v_liabilities + v_equity + v_net_income,
    v_assets - (v_liabilities + v_equity + v_net_income),
    ABS(v_assets - (v_liabilities + v_equity + v_net_income)) < 0.01;
END;
$$;

COMMENT ON FUNCTION public.validate_balance_sheet(UUID, DATE) IS
  'Checks the fundamental accounting equation: Assets = Liabilities + Equity + Net Income. Returns difference and balanced flag.';

-- ── 2. validate_trial_balance ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_trial_balance(
  p_org_id UUID,
  p_as_of  DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  total_debits  NUMERIC,
  total_credits NUMERIC,
  difference    NUMERIC,
  balanced      BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debits  NUMERIC := 0;
  v_credits NUMERIC := 0;
BEGIN
  SELECT
    COALESCE(SUM(jl.debit),  0),
    COALESCE(SUM(jl.credit), 0)
  INTO v_debits, v_credits
  FROM   public.journal_lines   jl
  JOIN   public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE  je.organization_id = p_org_id
    AND  je.is_posted       = TRUE
    AND  je.entry_date     <= p_as_of;

  RETURN QUERY
  SELECT
    v_debits,
    v_credits,
    v_debits - v_credits,
    ABS(v_debits - v_credits) < 0.01;
END;
$$;

COMMENT ON FUNCTION public.validate_trial_balance(UUID, DATE) IS
  'Verifies that total debits == total credits across all posted journal lines.';

-- ── 3. validate_subledger_reconciliation ──────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_subledger_reconciliation(
  p_org_id UUID
)
RETURNS TABLE(
  check_name    TEXT,
  gl_balance    NUMERIC,
  subledger_bal NUMERIC,
  difference    NUMERIC,
  reconciled    BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ar_gl          NUMERIC := 0;
  v_ar_sub         NUMERIC := 0;
  v_ap_gl          NUMERIC := 0;
  v_ap_sub         NUMERIC := 0;
BEGIN
  -- AR: GL (account_type = 'asset', code starts with 1200-1299 typically)
  -- Using sum of open invoice totals as subledger
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_ar_gl
  FROM   public.gl_accounts     ga
  JOIN   public.journal_lines   jl ON jl.gl_account_id = ga.id
  JOIN   public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE  ga.organization_id = p_org_id
    AND  ga.account_type    = 'asset'
    AND  (ga.code LIKE '12%' OR ga.name ILIKE '%receivable%')
    AND  je.organization_id = p_org_id
    AND  je.is_posted       = TRUE;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_ar_sub
  FROM   public.invoices
  WHERE  organization_id = p_org_id
    AND  status NOT IN ('paid', 'cancelled', 'voided', 'draft');

  -- AP: GL (account_type = 'liability', payables accounts)
  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_ap_gl
  FROM   public.gl_accounts     ga
  JOIN   public.journal_lines   jl ON jl.gl_account_id = ga.id
  JOIN   public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE  ga.organization_id = p_org_id
    AND  ga.account_type    = 'liability'
    AND  (ga.code LIKE '20%' OR ga.name ILIKE '%payable%')
    AND  je.organization_id = p_org_id
    AND  je.is_posted       = TRUE;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_ap_sub
  FROM   public.bills
  WHERE  organization_id = p_org_id
    AND  status NOT IN ('paid', 'cancelled');

  RETURN QUERY
    SELECT 'Accounts Receivable'::TEXT, v_ar_gl, v_ar_sub,
           v_ar_gl - v_ar_sub, ABS(v_ar_gl - v_ar_sub) < 1.00
  UNION ALL
    SELECT 'Accounts Payable'::TEXT,    v_ap_gl, v_ap_sub,
           v_ap_gl - v_ap_sub, ABS(v_ap_gl - v_ap_sub) < 1.00;
END;
$$;

COMMENT ON FUNCTION public.validate_subledger_reconciliation(UUID) IS
  'Reconciles AR and AP GL balances against invoice and bill subledgers.';
