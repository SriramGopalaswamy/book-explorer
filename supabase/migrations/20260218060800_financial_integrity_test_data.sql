-- =====================================================================
-- FINANCIAL INTEGRITY SYSTEM - TEST DATA
-- =====================================================================
-- Migration: 20260218060800_financial_integrity_test_data.sql
-- Description: Seeds test data for financial integrity validation
-- Dependencies: All previous financial integrity migrations
-- =====================================================================

-- This migration creates test data to validate the financial integrity system
-- It includes multi-currency scenarios, partial payments, and reversals

-- Note: Only run this in development/test environments
-- Comment out or remove for production deployments

DO $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_ap_account_id UUID;
  v_expense_account_id UUID;
  v_cash_account_id UUID;
  v_je_id UUID;
BEGIN
  -- Get or create test user
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No users found - skipping test data creation';
    RETURN;
  END IF;

  -- Use user_id as org_id for simplicity (single-user mode)
  v_org_id := v_user_id;

  RAISE NOTICE 'Creating test data for user: %', v_user_id;

  -- Find or create standard accounts
  -- AR Account
  SELECT id INTO v_ar_account_id FROM chart_of_accounts
  WHERE user_id = v_user_id 
  AND account_type = 'asset'
  AND (account_name ILIKE '%accounts receivable%' OR account_code LIKE '1200%')
  LIMIT 1;

  IF v_ar_account_id IS NULL THEN
    INSERT INTO chart_of_accounts (
      user_id, account_code, account_name, account_type, 
      category, current_balance, is_active
    ) VALUES (
      v_user_id, '1200', 'Accounts Receivable', 'asset',
      'Current Assets', 0, true
    ) RETURNING id INTO v_ar_account_id;
    RAISE NOTICE 'Created AR account: %', v_ar_account_id;
  END IF;

  -- Revenue Account
  SELECT id INTO v_revenue_account_id FROM chart_of_accounts
  WHERE user_id = v_user_id 
  AND account_type = 'revenue'
  AND (account_name ILIKE '%sales%' OR account_code LIKE '4%')
  LIMIT 1;

  IF v_revenue_account_id IS NULL THEN
    INSERT INTO chart_of_accounts (
      user_id, account_code, account_name, account_type,
      category, current_balance, is_active
    ) VALUES (
      v_user_id, '4000', 'Sales Revenue', 'revenue',
      'Operating Revenue', 0, true
    ) RETURNING id INTO v_revenue_account_id;
    RAISE NOTICE 'Created Revenue account: %', v_revenue_account_id;
  END IF;

  -- AP Account
  SELECT id INTO v_ap_account_id FROM chart_of_accounts
  WHERE user_id = v_user_id 
  AND account_type = 'liability'
  AND (account_name ILIKE '%accounts payable%' OR account_code LIKE '2100%')
  LIMIT 1;

  IF v_ap_account_id IS NULL THEN
    INSERT INTO chart_of_accounts (
      user_id, account_code, account_name, account_type,
      category, current_balance, is_active
    ) VALUES (
      v_user_id, '2100', 'Accounts Payable', 'liability',
      'Current Liabilities', 0, true
    ) RETURNING id INTO v_ap_account_id;
    RAISE NOTICE 'Created AP account: %', v_ap_account_id;
  END IF;

  -- Expense Account
  SELECT id INTO v_expense_account_id FROM chart_of_accounts
  WHERE user_id = v_user_id 
  AND account_type = 'expense'
  AND (account_name ILIKE '%operating%' OR account_code LIKE '5%')
  LIMIT 1;

  IF v_expense_account_id IS NULL THEN
    INSERT INTO chart_of_accounts (
      user_id, account_code, account_name, account_type,
      category, current_balance, is_active
    ) VALUES (
      v_user_id, '5000', 'Operating Expenses', 'expense',
      'Operating Expenses', 0, true
    ) RETURNING id INTO v_expense_account_id;
    RAISE NOTICE 'Created Expense account: %', v_expense_account_id;
  END IF;

  -- Cash Account
  SELECT id INTO v_cash_account_id FROM chart_of_accounts
  WHERE user_id = v_user_id 
  AND account_type = 'asset'
  AND (account_name ILIKE '%cash%' OR account_name ILIKE '%bank%')
  LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    INSERT INTO chart_of_accounts (
      user_id, account_code, account_name, account_type,
      category, current_balance, is_active
    ) VALUES (
      v_user_id, '1000', 'Cash - Operating Account', 'asset',
      'Cash and Bank', 0, true
    ) RETURNING id INTO v_cash_account_id;
    RAISE NOTICE 'Created Cash account: %', v_cash_account_id;
  END IF;

  -- ===================================================================
  -- TEST SCENARIO 1: Simple Revenue Transaction (USD)
  -- ===================================================================
  INSERT INTO journal_entries (
    user_id, organization_id, entry_number, entry_date, posting_date,
    description, reference_type, posted, posted_at, posted_by
  ) VALUES (
    v_user_id, v_org_id, 'JE-2026-001', CURRENT_DATE - INTERVAL '30 days', 
    CURRENT_DATE - INTERVAL '30 days',
    'Test Revenue - Customer A', 'invoice', true, NOW(), v_user_id
  ) RETURNING id INTO v_je_id;

  -- Debit AR (increase asset)
  INSERT INTO journal_entry_lines (
    entry_id, account_id, debit, credit, description,
    transaction_currency, exchange_rate, base_currency_amount
  ) VALUES (
    v_je_id, v_ar_account_id, 1000.00, 0, 'Invoice to Customer A',
    'USD', 1.0, 1000.00
  );

  -- Credit Revenue (increase revenue)
  INSERT INTO journal_entry_lines (
    entry_id, account_id, debit, credit, description,
    transaction_currency, exchange_rate, base_currency_amount
  ) VALUES (
    v_je_id, v_revenue_account_id, 0, 1000.00, 'Sales to Customer A',
    'USD', 1.0, 1000.00
  );

  RAISE NOTICE 'Created test journal entry 1 (Revenue USD): %', v_je_id;

  -- ===================================================================
  -- TEST SCENARIO 2: Multi-Currency Revenue Transaction (EUR)
  -- ===================================================================
  INSERT INTO journal_entries (
    user_id, organization_id, entry_number, entry_date, posting_date,
    description, reference_type, posted, posted_at, posted_by
  ) VALUES (
    v_user_id, v_org_id, 'JE-2026-002', CURRENT_DATE - INTERVAL '25 days',
    CURRENT_DATE - INTERVAL '25 days',
    'Test Revenue - Customer B (EUR)', 'invoice', true, NOW(), v_user_id
  ) RETURNING id INTO v_je_id;

  -- Debit AR (EUR 850 @ 1.10 = USD 935)
  INSERT INTO journal_entry_lines (
    entry_id, account_id, debit, credit, description,
    transaction_currency, exchange_rate, base_currency_amount
  ) VALUES (
    v_je_id, v_ar_account_id, 850.00, 0, 'Invoice to Customer B (EUR)',
    'EUR', 1.10, 935.00
  );

  -- Credit Revenue
  INSERT INTO journal_entry_lines (
    entry_id, account_id, debit, credit, description,
    transaction_currency, exchange_rate, base_currency_amount
  ) VALUES (
    v_je_id, v_revenue_account_id, 0, 850.00, 'Sales to Customer B (EUR)',
    'EUR', 1.10, 935.00
  );

  RAISE NOTICE 'Created test journal entry 2 (Revenue EUR): %', v_je_id;

  -- ===================================================================
  -- TEST SCENARIO 3: Expense Transaction (USD)
  -- ===================================================================
  INSERT INTO journal_entries (
    user_id, organization_id, entry_number, entry_date, posting_date,
    description, reference_type, posted, posted_at, posted_by
  ) VALUES (
    v_user_id, v_org_id, 'JE-2026-003', CURRENT_DATE - INTERVAL '20 days',
    CURRENT_DATE - INTERVAL '20 days',
    'Test Expense - Vendor X', 'bill', true, NOW(), v_user_id
  ) RETURNING id INTO v_je_id;

  -- Debit Expense (increase expense)
  INSERT INTO journal_entry_lines (
    entry_id, account_id, debit, credit, description,
    transaction_currency, exchange_rate, base_currency_amount
  ) VALUES (
    v_je_id, v_expense_account_id, 500.00, 0, 'Office Supplies from Vendor X',
    'USD', 1.0, 500.00
  );

  -- Credit AP (increase liability)
  INSERT INTO journal_entry_lines (
    entry_id, account_id, debit, credit, description,
    transaction_currency, exchange_rate, base_currency_amount
  ) VALUES (
    v_je_id, v_ap_account_id, 0, 500.00, 'Bill from Vendor X',
    'USD', 1.0, 500.00
  );

  RAISE NOTICE 'Created test journal entry 3 (Expense USD): %', v_je_id;

  -- ===================================================================
  -- TEST SCENARIO 4: Partial Payment (Cash Receipt)
  -- ===================================================================
  INSERT INTO journal_entries (
    user_id, organization_id, entry_number, entry_date, posting_date,
    description, reference_type, posted, posted_at, posted_by
  ) VALUES (
    v_user_id, v_org_id, 'JE-2026-004', CURRENT_DATE - INTERVAL '15 days',
    CURRENT_DATE - INTERVAL '15 days',
    'Partial Payment from Customer A', 'payment', true, NOW(), v_user_id
  ) RETURNING id INTO v_je_id;

  -- Debit Cash (increase asset)
  INSERT INTO journal_entry_lines (
    entry_id, account_id, debit, credit, description,
    transaction_currency, exchange_rate, base_currency_amount
  ) VALUES (
    v_je_id, v_cash_account_id, 600.00, 0, 'Payment received from Customer A',
    'USD', 1.0, 600.00
  );

  -- Credit AR (decrease asset)
  INSERT INTO journal_entry_lines (
    entry_id, account_id, debit, credit, description,
    transaction_currency, exchange_rate, base_currency_amount
  ) VALUES (
    v_je_id, v_ar_account_id, 0, 600.00, 'Partial payment - Customer A',
    'USD', 1.0, 600.00
  );

  RAISE NOTICE 'Created test journal entry 4 (Partial Payment): %', v_je_id;

  -- ===================================================================
  -- Verify Test Data
  -- ===================================================================
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Test Data Creation Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Created accounts:';
  RAISE NOTICE '  - AR Account: %', v_ar_account_id;
  RAISE NOTICE '  - Revenue Account: %', v_revenue_account_id;
  RAISE NOTICE '  - AP Account: %', v_ap_account_id;
  RAISE NOTICE '  - Expense Account: %', v_expense_account_id;
  RAISE NOTICE '  - Cash Account: %', v_cash_account_id;
  RAISE NOTICE '';
  RAISE NOTICE 'Expected Balances (base currency USD):';
  RAISE NOTICE '  - AR: $1,335 (1000 + 935 - 600)';
  RAISE NOTICE '  - Revenue: $1,935 (1000 + 935)';
  RAISE NOTICE '  - AP: $500';
  RAISE NOTICE '  - Expense: $500';
  RAISE NOTICE '  - Cash: $600';
  RAISE NOTICE '';
  RAISE NOTICE 'Run these queries to verify:';
  RAISE NOTICE '  SELECT * FROM v_trial_balance;';
  RAISE NOTICE '  SELECT * FROM v_profit_and_loss;';
  RAISE NOTICE '  SELECT * FROM v_cash_position;';
  RAISE NOTICE '========================================';

END $$;
