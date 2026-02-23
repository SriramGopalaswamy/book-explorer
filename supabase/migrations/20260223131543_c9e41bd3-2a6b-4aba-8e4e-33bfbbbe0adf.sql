
-- =============================================
-- FINANCIAL INTELLIGENCE LAYER — GRX10 Books
-- =============================================

-- =============================================
-- PHASE 2: BASE LEDGER VIEW
-- =============================================
CREATE OR REPLACE VIEW public.ledger_base AS
SELECT
  je.organization_id,
  je.id           AS journal_entry_id,
  je.entry_date,
  je.fiscal_period_id,
  je.source_type  AS document_type,
  je.document_sequence_number,
  je.is_reversal,
  je.reversed_entry_id,
  je.memo,
  jl.id           AS line_id,
  jl.gl_account_id AS account_id,
  ga.code         AS account_code,
  ga.name         AS account_name,
  ga.account_type,
  ga.normal_balance,
  jl.debit,
  jl.credit,
  (jl.debit - jl.credit) AS net_amount,
  jl.description  AS line_description
FROM public.journal_entries je
JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
JOIN public.gl_accounts   ga ON ga.id = jl.gl_account_id
WHERE je.is_posted = true;

-- RLS on views is inherited from underlying tables — no separate policy needed.

-- =============================================
-- PHASE 3: PARAMETERIZED REPORTING FUNCTIONS
-- =============================================

-- 3a) TRIAL BALANCE
CREATE OR REPLACE FUNCTION public.get_trial_balance(
  p_org_id uuid,
  p_from   date,
  p_to     date
)
RETURNS TABLE(
  account_id     uuid,
  account_code   text,
  account_name   text,
  account_type   text,
  normal_balance text,
  total_debit    numeric,
  total_credit   numeric,
  net_balance    numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Enforce org isolation
  IF NOT is_org_member(auth.uid(), p_org_id) AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    ga.id,
    ga.code,
    ga.name,
    ga.account_type,
    ga.normal_balance,
    COALESCE(SUM(jl.debit), 0),
    COALESCE(SUM(jl.credit), 0),
    COALESCE(SUM(jl.debit - jl.credit), 0)
  FROM gl_accounts ga
  LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
    AND EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = jl.journal_entry_id
        AND je.organization_id = p_org_id
        AND je.is_posted = true
        AND je.entry_date BETWEEN p_from AND p_to
    )
  WHERE ga.organization_id = p_org_id
    AND ga.is_active = true
  GROUP BY ga.id, ga.code, ga.name, ga.account_type, ga.normal_balance
  ORDER BY ga.code;
END;
$$;

-- 3b) GENERAL LEDGER
CREATE OR REPLACE FUNCTION public.get_general_ledger(
  p_org_id     uuid,
  p_account_id uuid,
  p_from       date,
  p_to         date
)
RETURNS TABLE(
  entry_date               date,
  journal_entry_id         uuid,
  document_type            text,
  document_sequence_number text,
  description              text,
  debit                    numeric,
  credit                   numeric,
  running_balance          numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_org_member(auth.uid(), p_org_id) AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    je.entry_date,
    je.id,
    je.source_type,
    je.document_sequence_number,
    jl.description,
    jl.debit,
    jl.credit,
    SUM(jl.debit - jl.credit) OVER (ORDER BY je.entry_date, je.id) AS running_balance
  FROM journal_entries je
  JOIN journal_lines jl ON jl.journal_entry_id = je.id
  WHERE je.organization_id = p_org_id
    AND je.is_posted = true
    AND jl.gl_account_id = p_account_id
    AND je.entry_date BETWEEN p_from AND p_to
  ORDER BY je.entry_date, je.id;
END;
$$;

-- 3c) PROFIT & LOSS
CREATE OR REPLACE FUNCTION public.get_profit_loss(
  p_org_id uuid,
  p_from   date,
  p_to     date
)
RETURNS TABLE(
  account_id   uuid,
  account_code text,
  account_name text,
  account_type text,
  amount       numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_org_member(auth.uid(), p_org_id) AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    ga.id,
    ga.code,
    ga.name,
    ga.account_type,
    CASE
      WHEN ga.account_type = 'revenue' THEN COALESCE(SUM(jl.credit - jl.debit), 0)
      ELSE COALESCE(SUM(jl.debit - jl.credit), 0)
    END AS amount
  FROM gl_accounts ga
  LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
    AND EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = jl.journal_entry_id
        AND je.organization_id = p_org_id
        AND je.is_posted = true
        AND je.entry_date BETWEEN p_from AND p_to
    )
  WHERE ga.organization_id = p_org_id
    AND ga.account_type IN ('revenue', 'expense')
    AND ga.is_active = true
  GROUP BY ga.id, ga.code, ga.name, ga.account_type
  HAVING COALESCE(SUM(jl.debit), 0) + COALESCE(SUM(jl.credit), 0) > 0
  ORDER BY ga.account_type DESC, ga.code;
END;
$$;

-- 3d) PROFIT & LOSS COMPARATIVE
CREATE OR REPLACE FUNCTION public.get_profit_loss_comparative(
  p_org_id      uuid,
  p_from_1      date,
  p_to_1        date,
  p_from_2      date,
  p_to_2        date
)
RETURNS TABLE(
  account_id    uuid,
  account_code  text,
  account_name  text,
  account_type  text,
  period_1      numeric,
  period_2      numeric,
  variance      numeric,
  variance_pct  numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_org_member(auth.uid(), p_org_id) AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH p1 AS (
    SELECT ga.id AS aid,
      CASE WHEN ga.account_type = 'revenue' THEN COALESCE(SUM(jl.credit - jl.debit), 0)
           ELSE COALESCE(SUM(jl.debit - jl.credit), 0) END AS amt
    FROM gl_accounts ga
    LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
      AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = jl.journal_entry_id
        AND je.organization_id = p_org_id AND je.is_posted = true
        AND je.entry_date BETWEEN p_from_1 AND p_to_1)
    WHERE ga.organization_id = p_org_id AND ga.account_type IN ('revenue','expense') AND ga.is_active = true
    GROUP BY ga.id, ga.account_type
  ),
  p2 AS (
    SELECT ga.id AS aid,
      CASE WHEN ga.account_type = 'revenue' THEN COALESCE(SUM(jl.credit - jl.debit), 0)
           ELSE COALESCE(SUM(jl.debit - jl.credit), 0) END AS amt
    FROM gl_accounts ga
    LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
      AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = jl.journal_entry_id
        AND je.organization_id = p_org_id AND je.is_posted = true
        AND je.entry_date BETWEEN p_from_2 AND p_to_2)
    WHERE ga.organization_id = p_org_id AND ga.account_type IN ('revenue','expense') AND ga.is_active = true
    GROUP BY ga.id, ga.account_type
  )
  SELECT
    ga.id, ga.code, ga.name, ga.account_type,
    COALESCE(p1.amt, 0),
    COALESCE(p2.amt, 0),
    COALESCE(p1.amt, 0) - COALESCE(p2.amt, 0),
    CASE WHEN COALESCE(p2.amt, 0) = 0 THEN 0
         ELSE ROUND(((COALESCE(p1.amt, 0) - COALESCE(p2.amt, 0)) / ABS(p2.amt)) * 100, 2)
    END
  FROM gl_accounts ga
  LEFT JOIN p1 ON p1.aid = ga.id
  LEFT JOIN p2 ON p2.aid = ga.id
  WHERE ga.organization_id = p_org_id
    AND ga.account_type IN ('revenue','expense')
    AND ga.is_active = true
    AND (COALESCE(p1.amt, 0) <> 0 OR COALESCE(p2.amt, 0) <> 0)
  ORDER BY ga.account_type DESC, ga.code;
END;
$$;

-- 3e) BALANCE SHEET
CREATE OR REPLACE FUNCTION public.get_balance_sheet(
  p_org_id    uuid,
  p_as_of     date
)
RETURNS TABLE(
  account_id   uuid,
  account_code text,
  account_name text,
  account_type text,
  balance      numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_org_member(auth.uid(), p_org_id) AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    ga.id,
    ga.code,
    ga.name,
    ga.account_type,
    CASE
      WHEN ga.normal_balance = 'debit'  THEN COALESCE(SUM(jl.debit - jl.credit), 0)
      ELSE COALESCE(SUM(jl.credit - jl.debit), 0)
    END AS balance
  FROM gl_accounts ga
  LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
    AND EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = jl.journal_entry_id
        AND je.organization_id = p_org_id
        AND je.is_posted = true
        AND je.entry_date <= p_as_of
    )
  WHERE ga.organization_id = p_org_id
    AND ga.account_type IN ('asset', 'liability', 'equity')
    AND ga.is_active = true
  GROUP BY ga.id, ga.code, ga.name, ga.account_type, ga.normal_balance
  HAVING COALESCE(SUM(jl.debit), 0) + COALESCE(SUM(jl.credit), 0) > 0
  ORDER BY
    CASE ga.account_type WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 WHEN 'equity' THEN 3 END,
    ga.code;
END;
$$;

-- 3f) AR AGING
CREATE OR REPLACE FUNCTION public.get_ar_aging(
  p_org_id  uuid,
  p_as_of   date
)
RETURNS TABLE(
  invoice_id      uuid,
  invoice_number  text,
  client_name     text,
  invoice_date    date,
  due_date        date,
  total_amount    numeric,
  days_overdue    integer,
  aging_bucket    text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_org_member(auth.uid(), p_org_id) AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.client_name,
    i.invoice_date,
    i.due_date,
    i.total_amount,
    (p_as_of - i.due_date)::integer AS days_overdue,
    CASE
      WHEN (p_as_of - i.due_date) <= 0  THEN 'Current'
      WHEN (p_as_of - i.due_date) <= 30 THEN '1-30 days'
      WHEN (p_as_of - i.due_date) <= 60 THEN '31-60 days'
      WHEN (p_as_of - i.due_date) <= 90 THEN '61-90 days'
      ELSE '90+ days'
    END
  FROM invoices i
  WHERE i.organization_id = p_org_id
    AND i.status IN ('sent', 'overdue', 'partially_paid')
    AND i.invoice_date <= p_as_of
  ORDER BY i.due_date;
END;
$$;

-- 3g) AP AGING
CREATE OR REPLACE FUNCTION public.get_ap_aging(
  p_org_id  uuid,
  p_as_of   date
)
RETURNS TABLE(
  bill_id      uuid,
  bill_number  text,
  vendor_name  text,
  bill_date    date,
  due_date     date,
  total_amount numeric,
  days_overdue integer,
  aging_bucket text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_org_member(auth.uid(), p_org_id) AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.bill_number,
    b.vendor_name,
    b.bill_date,
    b.due_date,
    b.total_amount,
    CASE WHEN b.due_date IS NULL THEN 0 ELSE (p_as_of - b.due_date)::integer END,
    CASE
      WHEN b.due_date IS NULL OR (p_as_of - b.due_date) <= 0  THEN 'Current'
      WHEN (p_as_of - b.due_date) <= 30 THEN '1-30 days'
      WHEN (p_as_of - b.due_date) <= 60 THEN '31-60 days'
      WHEN (p_as_of - b.due_date) <= 90 THEN '61-90 days'
      ELSE '90+ days'
    END
  FROM bills b
  WHERE b.organization_id = p_org_id
    AND b.status IN ('approved', 'overdue', 'partially_paid')
    AND b.bill_date <= p_as_of
  ORDER BY b.due_date NULLS LAST;
END;
$$;

-- 3h) CASH FLOW (INDIRECT METHOD)
CREATE OR REPLACE FUNCTION public.get_cash_flow_indirect(
  p_org_id uuid,
  p_from   date,
  p_to     date
)
RETURNS TABLE(
  section     text,
  description text,
  amount      numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_net_income numeric;
  v_ar_change  numeric;
  v_ap_change  numeric;
  v_asset_change numeric;
BEGIN
  IF NOT is_org_member(auth.uid(), p_org_id) AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Net income
  SELECT COALESCE(SUM(
    CASE WHEN ga.account_type = 'revenue' THEN jl.credit - jl.debit
         WHEN ga.account_type = 'expense' THEN -(jl.debit - jl.credit)
         ELSE 0 END
  ), 0)
  INTO v_net_income
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  JOIN gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = p_org_id
    AND je.is_posted = true
    AND je.entry_date BETWEEN p_from AND p_to
    AND ga.account_type IN ('revenue', 'expense');

  -- AR change (asset — increase = cash outflow)
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_ar_change
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  JOIN gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = p_org_id AND je.is_posted = true
    AND je.entry_date BETWEEN p_from AND p_to
    AND ga.code = '1200';

  -- AP change (liability — increase = cash inflow)
  SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
  INTO v_ap_change
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  JOIN gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = p_org_id AND je.is_posted = true
    AND je.entry_date BETWEEN p_from AND p_to
    AND ga.code = '2100';

  -- Fixed asset purchases
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_asset_change
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  JOIN gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = p_org_id AND je.is_posted = true
    AND je.entry_date BETWEEN p_from AND p_to
    AND ga.code = '1400';

  RETURN QUERY VALUES
    ('operating'::text,  'Net Income'::text,                  v_net_income),
    ('operating',        'Decrease/(Increase) in AR',         -v_ar_change),
    ('operating',        'Increase/(Decrease) in AP',         v_ap_change),
    ('operating',        'Cash from Operations',              v_net_income - v_ar_change + v_ap_change),
    ('investing',        'Purchase of Fixed Assets',          -v_asset_change),
    ('investing',        'Cash from Investing',               -v_asset_change),
    ('net',              'Net Cash Flow',                     v_net_income - v_ar_change + v_ap_change - v_asset_change);
END;
$$;

-- 3i) BUDGET VS ACTUAL (requires budgets table — created in Phase 4)
-- Defined after budgets table creation below.

-- 3j) COST CENTER REPORT (placeholder — depends on cost_center column in journal_lines)
-- Implemented as account-type grouping for now.

-- =============================================
-- PHASE 4: BUDGETS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.budgets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id),
  account_id       uuid NOT NULL REFERENCES public.gl_accounts(id),
  fiscal_period_id uuid NOT NULL REFERENCES public.fiscal_periods(id),
  budget_amount    numeric NOT NULL DEFAULT 0,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, account_id, fiscal_period_id)
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budgets_select" ON public.budgets
  FOR SELECT USING (
    is_org_member(auth.uid(), organization_id) OR is_super_admin(auth.uid())
  );

CREATE POLICY "budgets_manage" ON public.budgets
  FOR ALL USING (
    is_org_admin_or_finance(auth.uid(), organization_id) OR is_super_admin(auth.uid())
  ) WITH CHECK (
    is_org_admin_or_finance(auth.uid(), organization_id) OR is_super_admin(auth.uid())
  );

-- Now create budget vs actual function
CREATE OR REPLACE FUNCTION public.get_budget_vs_actual(
  p_org_id uuid,
  p_from   date,
  p_to     date
)
RETURNS TABLE(
  account_id     uuid,
  account_code   text,
  account_name   text,
  account_type   text,
  budget_amount  numeric,
  actual_amount  numeric,
  variance       numeric,
  variance_pct   numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_org_member(auth.uid(), p_org_id) AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH actuals AS (
    SELECT jl.gl_account_id AS aid,
      CASE WHEN ga.account_type = 'revenue' THEN COALESCE(SUM(jl.credit - jl.debit), 0)
           ELSE COALESCE(SUM(jl.debit - jl.credit), 0) END AS amt
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    JOIN gl_accounts ga ON ga.id = jl.gl_account_id
    WHERE je.organization_id = p_org_id AND je.is_posted = true
      AND je.entry_date BETWEEN p_from AND p_to
      AND ga.account_type IN ('revenue','expense')
    GROUP BY jl.gl_account_id, ga.account_type
  ),
  budget_totals AS (
    SELECT b.account_id AS aid, SUM(b.budget_amount) AS amt
    FROM budgets b
    JOIN fiscal_periods fp ON fp.id = b.fiscal_period_id
    WHERE b.organization_id = p_org_id
      AND fp.start_date >= p_from AND fp.end_date <= p_to
    GROUP BY b.account_id
  )
  SELECT
    ga.id, ga.code, ga.name, ga.account_type,
    COALESCE(bt.amt, 0),
    COALESCE(a.amt, 0),
    COALESCE(a.amt, 0) - COALESCE(bt.amt, 0),
    CASE WHEN COALESCE(bt.amt, 0) = 0 THEN 0
         ELSE ROUND(((COALESCE(a.amt, 0) - COALESCE(bt.amt, 0)) / ABS(bt.amt)) * 100, 2)
    END
  FROM gl_accounts ga
  LEFT JOIN actuals a ON a.aid = ga.id
  LEFT JOIN budget_totals bt ON bt.aid = ga.id
  WHERE ga.organization_id = p_org_id
    AND ga.account_type IN ('revenue','expense')
    AND (COALESCE(a.amt, 0) <> 0 OR COALESCE(bt.amt, 0) <> 0)
  ORDER BY ga.account_type DESC, ga.code;
END;
$$;

-- =============================================
-- PHASE 5: PERFORMANCE INDEXES
-- =============================================
-- Most critical indexes already exist from prior migration.
-- Add composite index for reporting date-range queries:
CREATE INDEX IF NOT EXISTS idx_je_org_date
  ON public.journal_entries (organization_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_je_org_posted_date
  ON public.journal_entries (organization_id, is_posted, entry_date);

CREATE INDEX IF NOT EXISTS idx_budgets_org_period
  ON public.budgets (organization_id, fiscal_period_id);

CREATE INDEX IF NOT EXISTS idx_budgets_account
  ON public.budgets (account_id);
