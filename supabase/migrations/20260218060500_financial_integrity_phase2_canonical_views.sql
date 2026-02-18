-- =====================================================================
-- FINANCIAL INTEGRITY SYSTEM - PHASE 2: Canonical Views
-- =====================================================================
-- Migration: 20260218060500_financial_integrity_phase2_canonical_views.sql
-- Description: Creates canonical views as single source of truth
-- Dependencies: journal_entries, journal_entry_lines, chart_of_accounts
-- =====================================================================

-- =====================================================================
-- VIEW: v_trial_balance
-- Purpose: Single source of truth for account balances
-- =====================================================================
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT
  je.organization_id,
  jel.account_id,
  coa.account_code,
  coa.account_name,
  coa.account_type,
  SUM(jel.base_currency_amount * CASE WHEN jel.debit > 0 THEN 1 ELSE -1 END) AS balance,
  SUM(CASE WHEN jel.debit > 0 THEN jel.base_currency_amount ELSE 0 END) AS total_debits,
  SUM(CASE WHEN jel.credit > 0 THEN jel.base_currency_amount ELSE 0 END) AS total_credits,
  COUNT(DISTINCT je.id) AS entry_count,
  MAX(je.posting_date) AS last_posting_date
FROM journal_entry_lines jel
JOIN journal_entries je ON jel.entry_id = je.id
JOIN chart_of_accounts coa ON jel.account_id = coa.id
WHERE je.posted = true
  AND je.reversed = false
  AND je.deleted_at IS NULL
  AND je.organization_id IS NOT NULL
GROUP BY 
  je.organization_id,
  jel.account_id,
  coa.account_code,
  coa.account_name,
  coa.account_type;

COMMENT ON VIEW v_trial_balance IS 
  'Canonical trial balance - ALL financial reporting MUST derive from this view';

-- =====================================================================
-- VIEW: v_profit_and_loss
-- Purpose: Income statement derived from revenue and expense accounts
-- =====================================================================
CREATE OR REPLACE VIEW v_profit_and_loss AS
SELECT
  je.organization_id,
  jel.account_id,
  coa.account_code,
  coa.account_name,
  coa.account_type,
  coa.category,
  CASE 
    WHEN coa.account_type = 'revenue' THEN 'Revenue'
    WHEN coa.account_type = 'expense' THEN 'Expense'
    WHEN coa.account_type = 'cost_of_goods_sold' THEN 'Cost of Goods Sold'
    ELSE 'Other'
  END AS section,
  -- Revenue: credits increase, debits decrease
  -- Expenses: debits increase, credits decrease
  SUM(
    CASE 
      WHEN coa.account_type = 'revenue' THEN 
        jel.base_currency_amount * CASE WHEN jel.credit > 0 THEN 1 ELSE -1 END
      WHEN coa.account_type IN ('expense', 'cost_of_goods_sold') THEN 
        jel.base_currency_amount * CASE WHEN jel.debit > 0 THEN 1 ELSE -1 END
      ELSE 0
    END
  ) AS amount,
  COUNT(DISTINCT je.id) AS transaction_count,
  MIN(je.posting_date) AS period_start,
  MAX(je.posting_date) AS period_end
FROM journal_entry_lines jel
JOIN journal_entries je ON jel.entry_id = je.id
JOIN chart_of_accounts coa ON jel.account_id = coa.id
WHERE je.posted = true
  AND je.reversed = false
  AND je.deleted_at IS NULL
  AND je.organization_id IS NOT NULL
  AND coa.account_type IN ('revenue', 'expense', 'cost_of_goods_sold')
GROUP BY 
  je.organization_id,
  jel.account_id,
  coa.account_code,
  coa.account_name,
  coa.account_type,
  coa.category;

COMMENT ON VIEW v_profit_and_loss IS 
  'Canonical P&L - Dashboard revenue/expense MUST match this view';

-- =====================================================================
-- VIEW: v_cash_position
-- Purpose: Cash and bank account balances
-- =====================================================================
CREATE OR REPLACE VIEW v_cash_position AS
SELECT
  je.organization_id,
  jel.account_id,
  coa.account_code,
  coa.account_name,
  coa.category,
  SUM(jel.base_currency_amount * CASE WHEN jel.debit > 0 THEN 1 ELSE -1 END) AS balance,
  COUNT(DISTINCT je.id) AS transaction_count,
  MAX(je.posting_date) AS last_transaction_date
FROM journal_entry_lines jel
JOIN journal_entries je ON jel.entry_id = je.id
JOIN chart_of_accounts coa ON jel.account_id = coa.id
WHERE je.posted = true
  AND je.reversed = false
  AND je.deleted_at IS NULL
  AND je.organization_id IS NOT NULL
  AND coa.account_type = 'asset'
  AND (coa.category ILIKE '%cash%' OR coa.category ILIKE '%bank%')
GROUP BY 
  je.organization_id,
  jel.account_id,
  coa.account_code,
  coa.account_name,
  coa.category;

COMMENT ON VIEW v_cash_position IS 
  'Canonical cash position - Banking dashboard MUST use this view';

-- =====================================================================
-- VIEW: v_accounts_receivable
-- Purpose: AR balances from AR control account
-- =====================================================================
CREATE OR REPLACE VIEW v_accounts_receivable AS
SELECT
  je.organization_id,
  jel.account_id,
  coa.account_code,
  coa.account_name,
  SUM(jel.base_currency_amount * CASE WHEN jel.debit > 0 THEN 1 ELSE -1 END) AS balance,
  COUNT(DISTINCT je.id) AS invoice_count,
  MAX(je.posting_date) AS last_invoice_date,
  -- Age buckets based on posting date
  SUM(CASE 
    WHEN CURRENT_DATE - je.posting_date <= 30 THEN 
      jel.base_currency_amount * CASE WHEN jel.debit > 0 THEN 1 ELSE -1 END
    ELSE 0 
  END) AS current_amount,
  SUM(CASE 
    WHEN CURRENT_DATE - je.posting_date BETWEEN 31 AND 60 THEN 
      jel.base_currency_amount * CASE WHEN jel.debit > 0 THEN 1 ELSE -1 END
    ELSE 0 
  END) AS days_31_60,
  SUM(CASE 
    WHEN CURRENT_DATE - je.posting_date BETWEEN 61 AND 90 THEN 
      jel.base_currency_amount * CASE WHEN jel.debit > 0 THEN 1 ELSE -1 END
    ELSE 0 
  END) AS days_61_90,
  SUM(CASE 
    WHEN CURRENT_DATE - je.posting_date > 90 THEN 
      jel.base_currency_amount * CASE WHEN jel.debit > 0 THEN 1 ELSE -1 END
    ELSE 0 
  END) AS over_90_days
FROM journal_entry_lines jel
JOIN journal_entries je ON jel.entry_id = je.id
JOIN chart_of_accounts coa ON jel.account_id = coa.id
WHERE je.posted = true
  AND je.reversed = false
  AND je.deleted_at IS NULL
  AND je.organization_id IS NOT NULL
  AND coa.account_type = 'asset'
  AND (coa.account_name ILIKE '%accounts receivable%' OR coa.account_code LIKE '1200%')
GROUP BY 
  je.organization_id,
  jel.account_id,
  coa.account_code,
  coa.account_name;

COMMENT ON VIEW v_accounts_receivable IS 
  'Canonical AR - Invoicing dashboard MUST use this view, not invoice table aggregates';

-- =====================================================================
-- VIEW: v_accounts_payable
-- Purpose: AP balances from AP control account
-- =====================================================================
CREATE OR REPLACE VIEW v_accounts_payable AS
SELECT
  je.organization_id,
  jel.account_id,
  coa.account_code,
  coa.account_name,
  SUM(jel.base_currency_amount * CASE WHEN jel.credit > 0 THEN 1 ELSE -1 END) AS balance,
  COUNT(DISTINCT je.id) AS bill_count,
  MAX(je.posting_date) AS last_bill_date,
  -- Age buckets
  SUM(CASE 
    WHEN CURRENT_DATE - je.posting_date <= 30 THEN 
      jel.base_currency_amount * CASE WHEN jel.credit > 0 THEN 1 ELSE -1 END
    ELSE 0 
  END) AS current_amount,
  SUM(CASE 
    WHEN CURRENT_DATE - je.posting_date BETWEEN 31 AND 60 THEN 
      jel.base_currency_amount * CASE WHEN jel.credit > 0 THEN 1 ELSE -1 END
    ELSE 0 
  END) AS days_31_60,
  SUM(CASE 
    WHEN CURRENT_DATE - je.posting_date > 60 THEN 
      jel.base_currency_amount * CASE WHEN jel.credit > 0 THEN 1 ELSE -1 END
    ELSE 0 
  END) AS over_60_days
FROM journal_entry_lines jel
JOIN journal_entries je ON jel.entry_id = je.id
JOIN chart_of_accounts coa ON jel.account_id = coa.id
WHERE je.posted = true
  AND je.reversed = false
  AND je.deleted_at IS NULL
  AND je.organization_id IS NOT NULL
  AND coa.account_type = 'liability'
  AND (coa.account_name ILIKE '%accounts payable%' OR coa.account_code LIKE '2100%')
GROUP BY 
  je.organization_id,
  jel.account_id,
  coa.account_code,
  coa.account_name;

COMMENT ON VIEW v_accounts_payable IS 
  'Canonical AP - Bills dashboard MUST use this view, not bill table aggregates';

-- =====================================================================
-- Create indexes to optimize view performance
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_journal_entries_posted_not_reversed 
  ON journal_entries(posted, reversed, deleted_at) 
  WHERE posted = true AND reversed = false AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_base_amount 
  ON journal_entry_lines(account_id, base_currency_amount);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_type_category 
  ON chart_of_accounts(account_type, category);

-- =====================================================================
-- Grant permissions
-- =====================================================================
GRANT SELECT ON v_trial_balance TO authenticated;
GRANT SELECT ON v_profit_and_loss TO authenticated;
GRANT SELECT ON v_cash_position TO authenticated;
GRANT SELECT ON v_accounts_receivable TO authenticated;
GRANT SELECT ON v_accounts_payable TO authenticated;
