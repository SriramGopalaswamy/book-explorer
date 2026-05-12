-- GBC-34 / GBC-42 / GBC-50: chart & search RPCs
--
-- These RPCs move data aggregation that the React pages currently do
-- client-side over big SELECT * scans to the server. Each function is
-- SECURITY DEFINER + search_path-pinned and resolves the tenant via
-- get_user_organization_id(auth.uid()), so no p_org_id is required.
--
-- 1. GBC-34  search_bank_transactions  — server-side filtered + paged
--                                        list of bank_transactions
-- 2. GBC-42  cash_flow_monthly         — N months of inflow/outflow
--                                        buckets from bank_transactions
-- 3. GBC-50  monthly_revenue           — revenue/expense buckets over
--                                        a date range with selectable
--                                        granularity (daily/weekly/
--                                        monthly) from financial_records
-- 4. GBC-50  expense_breakdown         — category-grouped expense totals
--                                        merging the expenses table
--                                        (approved + paid) with
--                                        financial_records (type='expense')

-- Trigram index supports the ILIKE filter in search_bank_transactions.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_description_trgm
  ON public.bank_transactions USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_category_trgm
  ON public.bank_transactions USING gin (category gin_trgm_ops);

-- 1) Bank transaction search ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_bank_transactions(
  p_q text DEFAULT '',
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_type text DEFAULT NULL,          -- 'credit' | 'debit' | NULL
  p_account_id uuid DEFAULT NULL,
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  account_id uuid,
  account_name text,
  transaction_date date,
  transaction_type text,
  amount numeric,
  description text,
  category text,
  reference text,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_q   text := '%' || COALESCE(p_q, '') || '%';
BEGIN
  IF v_org IS NULL THEN RETURN; END IF;
  p_limit  := LEAST(GREATEST(p_limit, 1), 200);
  p_offset := GREATEST(p_offset, 0);

  RETURN QUERY
  SELECT
    bt.id,
    bt.account_id,
    ba.name AS account_name,
    bt.transaction_date,
    bt.transaction_type,
    bt.amount,
    bt.description,
    bt.category,
    bt.reference,
    COUNT(*) OVER ()::bigint AS total_count
  FROM public.bank_transactions bt
  LEFT JOIN public.bank_accounts ba ON ba.id = bt.account_id
  WHERE bt.organization_id = v_org
    AND (COALESCE(p_q, '') = ''
         OR bt.description ILIKE v_q
         OR COALESCE(bt.category, '') ILIKE v_q
         OR COALESCE(bt.reference, '') ILIKE v_q)
    AND (p_type IS NULL OR bt.transaction_type = p_type)
    AND (p_account_id IS NULL OR bt.account_id = p_account_id)
    AND (p_from IS NULL OR bt.transaction_date >= p_from)
    AND (p_to   IS NULL OR bt.transaction_date <= p_to)
  ORDER BY bt.transaction_date DESC, bt.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_bank_transactions(text, date, date, text, uuid, int, int) TO authenticated;

-- 2) Cash flow monthly buckets ------------------------------------------------

CREATE OR REPLACE FUNCTION public.cash_flow_monthly(p_months int DEFAULT 6)
RETURNS TABLE(
  bucket_start date,
  bucket_label text,
  inflow numeric,
  outflow numeric,
  net_cash numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_n   int  := LEAST(GREATEST(COALESCE(p_months, 6), 1), 36);
  v_start date := date_trunc('month', CURRENT_DATE)::date - (v_n - 1) * INTERVAL '1 month';
BEGIN
  IF v_org IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH months AS (
    SELECT (v_start + (gs * INTERVAL '1 month'))::date AS bucket_start
    FROM generate_series(0, v_n - 1) AS gs
  ),
  totals AS (
    SELECT
      date_trunc('month', bt.transaction_date)::date AS bucket_start,
      COALESCE(SUM(CASE WHEN bt.transaction_type = 'credit' THEN bt.amount ELSE 0 END), 0)::numeric AS inflow,
      COALESCE(SUM(CASE WHEN bt.transaction_type = 'debit'  THEN bt.amount ELSE 0 END), 0)::numeric AS outflow
    FROM public.bank_transactions bt
    WHERE bt.organization_id = v_org
      AND bt.transaction_date >= v_start
    GROUP BY 1
  )
  SELECT
    m.bucket_start,
    to_char(m.bucket_start, 'Mon') AS bucket_label,
    COALESCE(t.inflow, 0)  AS inflow,
    COALESCE(t.outflow, 0) AS outflow,
    (COALESCE(t.inflow, 0) - COALESCE(t.outflow, 0))::numeric AS net_cash
  FROM months m
  LEFT JOIN totals t USING (bucket_start)
  ORDER BY m.bucket_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cash_flow_monthly(int) TO authenticated;

-- 3) Monthly revenue / expenses buckets ---------------------------------------

CREATE OR REPLACE FUNCTION public.monthly_revenue(
  p_from date,
  p_to date,
  p_granularity text DEFAULT 'monthly'   -- 'daily' | 'weekly' | 'monthly'
)
RETURNS TABLE(
  bucket_start date,
  bucket_label text,
  revenue numeric,
  expenses numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org    uuid := public.get_user_organization_id(auth.uid());
  v_trunc  text;
  v_label  text;
  v_step   interval;
BEGIN
  IF v_org IS NULL THEN RETURN; END IF;

  CASE COALESCE(p_granularity, 'monthly')
    WHEN 'daily'   THEN v_trunc := 'day';   v_step := INTERVAL '1 day';   v_label := 'DD Mon';
    WHEN 'weekly'  THEN v_trunc := 'week';  v_step := INTERVAL '1 week';  v_label := 'DD Mon';
    ELSE                v_trunc := 'month'; v_step := INTERVAL '1 month'; v_label := 'Mon YYYY';
  END CASE;

  RETURN QUERY
  WITH buckets AS (
    SELECT date_trunc(v_trunc, gs)::date AS bucket_start
    FROM generate_series(date_trunc(v_trunc, p_from), date_trunc(v_trunc, p_to), v_step) AS gs
  ),
  totals AS (
    SELECT
      date_trunc(v_trunc, fr.record_date)::date AS bucket_start,
      COALESCE(SUM(CASE WHEN fr.type = 'revenue' THEN fr.amount ELSE 0 END), 0)::numeric AS revenue,
      COALESCE(SUM(CASE WHEN fr.type = 'expense' THEN fr.amount ELSE 0 END), 0)::numeric AS expenses
    FROM public.financial_records fr
    WHERE fr.organization_id = v_org
      AND fr.record_date BETWEEN p_from AND p_to
    GROUP BY 1
  )
  SELECT
    b.bucket_start,
    to_char(b.bucket_start, v_label) AS bucket_label,
    COALESCE(t.revenue, 0)  AS revenue,
    COALESCE(t.expenses, 0) AS expenses
  FROM buckets b
  LEFT JOIN totals t USING (bucket_start)
  ORDER BY b.bucket_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.monthly_revenue(date, date, text) TO authenticated;

-- 4) Expense breakdown by category --------------------------------------------

CREATE OR REPLACE FUNCTION public.expense_breakdown(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE(category text, total_amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org  uuid := public.get_user_organization_id(auth.uid());
  v_from date := COALESCE(p_from, DATE '2000-01-01');
  v_to   date := COALESCE(p_to, CURRENT_DATE);
BEGIN
  IF v_org IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH merged AS (
    SELECT COALESCE(e.category, 'Uncategorized') AS category,
           e.amount::numeric AS amount
    FROM public.expenses e
    WHERE e.organization_id = v_org
      AND e.status IN ('approved', 'paid')
      AND e.expense_date BETWEEN v_from AND v_to
    UNION ALL
    SELECT COALESCE(fr.category, 'Uncategorized') AS category,
           fr.amount::numeric AS amount
    FROM public.financial_records fr
    WHERE fr.organization_id = v_org
      AND fr.type = 'expense'
      AND fr.record_date BETWEEN v_from AND v_to
  )
  SELECT m.category, SUM(m.amount)::numeric AS total_amount
  FROM merged m
  GROUP BY m.category
  ORDER BY total_amount DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expense_breakdown(date, date) TO authenticated;
