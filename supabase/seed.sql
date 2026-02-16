-- =====================================================
-- SUPABASE FINANCIAL MODULES SEED DATA
-- =====================================================
-- This file seeds data for:
-- - Invoicing module (invoices, invoice_items)
-- - Banking module (bank_accounts, bank_transactions)
-- - CashFlow module (scheduled_payments)
-- - Analytics module (chart_of_accounts)
--
-- USAGE:
-- 1. Get your user ID: SELECT auth.uid();
-- 2. Replace 'YOUR_USER_ID_HERE' with your actual user ID
-- 3. Run this script in Supabase SQL Editor
-- =====================================================

-- NOTE: Replace this with your actual user ID from auth.users
-- You can get it by running: SELECT id, email FROM auth.users LIMIT 1;
DO $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get the first user from auth.users
  SELECT id INTO current_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found in auth.users. Please create a user first.';
  END IF;
  
  RAISE NOTICE 'Using user ID: %', current_user_id;
  
  -- =====================================================
  -- SEED INVOICES (50 invoices with items)
  -- =====================================================
  INSERT INTO public.invoices (user_id, invoice_number, client_name, client_email, amount, due_date, status, created_at, updated_at)
  SELECT
    current_user_id,
    'INV-' || LPAD(n::TEXT, 5, '0'),
    'Client Company ' || n,
    'client' || n || '@company.com',
    FLOOR(RANDOM() * 450000 + 50000),
    CURRENT_DATE + (FLOOR(RANDOM() * 90) || ' days')::INTERVAL,
    CASE FLOOR(RANDOM() * 5)
      WHEN 0 THEN 'draft'
      WHEN 1 THEN 'sent'
      WHEN 2 THEN 'paid'
      WHEN 3 THEN 'overdue'
      ELSE 'cancelled'
    END,
    CURRENT_DATE - (FLOOR(RANDOM() * 365) || ' days')::INTERVAL,
    CURRENT_DATE - (FLOOR(RANDOM() * 30) || ' days')::INTERVAL
  FROM generate_series(1, 50) AS n
  ON CONFLICT (invoice_number) DO NOTHING;
  
  -- Add invoice items (2-5 items per invoice)
  WITH invoice_ids AS (
    SELECT id, invoice_number FROM public.invoices WHERE user_id = current_user_id
  )
  INSERT INTO public.invoice_items (invoice_id, description, quantity, rate, amount, created_at)
  SELECT
    i.id,
    CASE FLOOR(RANDOM() * 10)
      WHEN 0 THEN 'Software Development Services'
      WHEN 1 THEN 'Consulting Services'
      WHEN 2 THEN 'Technical Support'
      WHEN 3 THEN 'Cloud Infrastructure'
      WHEN 4 THEN 'UI/UX Design'
      WHEN 5 THEN 'Database Management'
      WHEN 6 THEN 'API Development'
      WHEN 7 THEN 'Mobile App Development'
      WHEN 8 THEN 'Project Management'
      ELSE 'Quality Assurance Testing'
    END,
    FLOOR(RANDOM() * 10 + 1),
    FLOOR(RANDOM() * 45000 + 5000),
    FLOOR(RANDOM() * 10 + 1) * FLOOR(RANDOM() * 45000 + 5000),
    CURRENT_DATE - (FLOOR(RANDOM() * 365) || ' days')::INTERVAL
  FROM invoice_ids i
  CROSS JOIN generate_series(1, FLOOR(RANDOM() * 4 + 2)::INT) AS n
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Seeded invoices and invoice items';
  
  -- =====================================================
  -- SEED BANK ACCOUNTS (5 accounts)
  -- =====================================================
  INSERT INTO public.bank_accounts (user_id, name, account_type, account_number, balance, bank_name, status, created_at, updated_at)
  VALUES
    (current_user_id, 'Main Business Account', 'Current', '1234567890', 2500000, 'State Bank', 'Active', CURRENT_DATE - INTERVAL '2 years', NOW()),
    (current_user_id, 'Savings Account', 'Savings', '2345678901', 1500000, 'HDFC Bank', 'Active', CURRENT_DATE - INTERVAL '18 months', NOW()),
    (current_user_id, 'Tax Reserve Account', 'Current', '3456789012', 800000, 'ICICI Bank', 'Active', CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, 'Payroll Account', 'Current', '4567890123', 600000, 'Axis Bank', 'Active', CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, 'Investment Account', 'FD', '5678901234', 3000000, 'Kotak Mahindra', 'Inactive', CURRENT_DATE - INTERVAL '6 months', NOW())
  ON CONFLICT (account_number) DO NOTHING;
  
  RAISE NOTICE 'Seeded bank accounts';
  
  -- =====================================================
  -- SEED BANK TRANSACTIONS (30 per active account = 120 total)
  -- =====================================================
  WITH active_accounts AS (
    SELECT id FROM public.bank_accounts WHERE user_id = current_user_id AND status = 'Active'
  )
  INSERT INTO public.bank_transactions (user_id, account_id, transaction_type, amount, description, category, transaction_date, reference, created_at)
  SELECT
    current_user_id,
    a.id,
    CASE WHEN RANDOM() < 0.5 THEN 'credit' ELSE 'debit' END,
    FLOOR(RANDOM() * 195000 + 5000),
    CASE FLOOR(RANDOM() * 10)
      WHEN 0 THEN 'Client payment received'
      WHEN 1 THEN 'Salary disbursement'
      WHEN 2 THEN 'Office rent payment'
      WHEN 3 THEN 'Software subscription renewal'
      WHEN 4 THEN 'Travel reimbursement'
      WHEN 5 THEN 'Equipment purchase'
      WHEN 6 THEN 'Marketing campaign expense'
      WHEN 7 THEN 'Utility bill payment'
      WHEN 8 THEN 'Professional fees'
      ELSE 'Miscellaneous expense'
    END,
    CASE FLOOR(RANDOM() * 10)
      WHEN 0 THEN 'Sales Revenue'
      WHEN 1 THEN 'Salaries'
      WHEN 2 THEN 'Office Rent'
      WHEN 3 THEN 'Software Subscriptions'
      WHEN 4 THEN 'Travel'
      WHEN 5 THEN 'Equipment'
      WHEN 6 THEN 'Marketing'
      WHEN 7 THEN 'Utilities'
      WHEN 8 THEN 'Professional Fees'
      ELSE 'Miscellaneous'
    END,
    CURRENT_DATE - (FLOOR(RANDOM() * 365) || ' days')::INTERVAL,
    'TXN-' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 10),
    CURRENT_DATE - (FLOOR(RANDOM() * 365) || ' days')::INTERVAL
  FROM active_accounts a
  CROSS JOIN generate_series(1, 30) AS n;
  
  RAISE NOTICE 'Seeded bank transactions';
  
  -- =====================================================
  -- SEED SCHEDULED PAYMENTS (25 payments)
  -- =====================================================
  INSERT INTO public.scheduled_payments (user_id, name, amount, due_date, payment_type, status, category, recurring, recurrence_interval, created_at, updated_at)
  SELECT
    current_user_id,
    CASE n
      WHEN 1 THEN 'Monthly Rent'
      WHEN 2 THEN 'Electricity Bill'
      WHEN 3 THEN 'Internet Subscription'
      WHEN 4 THEN 'Software Licenses'
      WHEN 5 THEN 'Insurance Premium'
      WHEN 6 THEN 'Loan EMI'
      WHEN 7 THEN 'Salary Payroll'
      WHEN 8 THEN 'Vendor Payment'
      WHEN 9 THEN 'Tax Payment'
      WHEN 10 THEN 'Marketing Budget'
      WHEN 11 THEN 'Cloud Services'
      WHEN 12 THEN 'Equipment Lease'
      ELSE 'Recurring Payment ' || n
    END,
    FLOOR(RANDOM() * 140000 + 10000),
    CURRENT_DATE + (FLOOR(RANDOM() * 180) || ' days')::INTERVAL,
    CASE WHEN RANDOM() < 0.7 THEN 'outflow' ELSE 'inflow' END,
    CASE FLOOR(RANDOM() * 4)
      WHEN 0 THEN 'scheduled'
      WHEN 1 THEN 'pending'
      WHEN 2 THEN 'completed'
      ELSE 'cancelled'
    END,
    CASE FLOOR(RANDOM() * 10)
      WHEN 0 THEN 'Office Rent'
      WHEN 1 THEN 'Utilities'
      WHEN 2 THEN 'Software Subscriptions'
      WHEN 3 THEN 'Insurance'
      WHEN 4 THEN 'Loan Payment'
      WHEN 5 THEN 'Salaries'
      WHEN 6 THEN 'Marketing'
      WHEN 7 THEN 'Taxes'
      WHEN 8 THEN 'Equipment'
      ELSE 'Miscellaneous'
    END,
    RANDOM() < 0.7,
    CASE FLOOR(RANDOM() * 4)
      WHEN 0 THEN 'weekly'
      WHEN 1 THEN 'monthly'
      WHEN 2 THEN 'quarterly'
      ELSE 'yearly'
    END,
    CURRENT_DATE - (FLOOR(RANDOM() * 180) || ' days')::INTERVAL,
    NOW()
  FROM generate_series(1, 25) AS n;
  
  RAISE NOTICE 'Seeded scheduled payments';
  
  -- =====================================================
  -- SEED CHART OF ACCOUNTS (Standard accounting structure)
  -- =====================================================
  INSERT INTO public.chart_of_accounts (user_id, account_code, account_name, account_type, description, is_active, opening_balance, current_balance, created_at, updated_at)
  VALUES
    -- Assets
    (current_user_id, '1000', 'Cash and Cash Equivalents', 'asset', 'Standard accounting account for cash and cash equivalents', true, 500000, 550000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '1100', 'Accounts Receivable', 'asset', 'Standard accounting account for accounts receivable', true, 300000, 320000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '1200', 'Inventory', 'asset', 'Standard accounting account for inventory', true, 200000, 180000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '1500', 'Fixed Assets', 'asset', 'Standard accounting account for fixed assets', true, 1000000, 950000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '1600', 'Intangible Assets', 'asset', 'Standard accounting account for intangible assets', true, 150000, 140000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    
    -- Liabilities
    (current_user_id, '2000', 'Accounts Payable', 'liability', 'Standard accounting account for accounts payable', true, 200000, 210000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '2100', 'Short-term Loans', 'liability', 'Standard accounting account for short-term loans', true, 100000, 95000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '2200', 'Tax Payable', 'liability', 'Standard accounting account for tax payable', true, 50000, 55000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '2500', 'Long-term Loans', 'liability', 'Standard accounting account for long-term loans', true, 500000, 480000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    
    -- Equity
    (current_user_id, '3000', 'Share Capital', 'equity', 'Standard accounting account for share capital', true, 1000000, 1000000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '3100', 'Retained Earnings', 'equity', 'Standard accounting account for retained earnings', true, 400000, 450000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    
    -- Revenue
    (current_user_id, '4000', 'Sales Revenue', 'revenue', 'Standard accounting account for sales revenue', true, 800000, 850000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '4100', 'Service Revenue', 'revenue', 'Standard accounting account for service revenue', true, 300000, 320000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '4200', 'Interest Income', 'revenue', 'Standard accounting account for interest income', true, 20000, 22000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '4300', 'Other Income', 'revenue', 'Standard accounting account for other income', true, 50000, 55000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    
    -- Expenses
    (current_user_id, '5000', 'Cost of Goods Sold', 'expense', 'Standard accounting account for cost of goods sold', true, 300000, 310000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '5100', 'Salaries and Wages', 'expense', 'Standard accounting account for salaries and wages', true, 400000, 420000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '5200', 'Rent Expense', 'expense', 'Standard accounting account for rent expense', true, 120000, 125000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '5300', 'Utilities Expense', 'expense', 'Standard accounting account for utilities expense', true, 50000, 52000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '5400', 'Marketing Expense', 'expense', 'Standard accounting account for marketing expense', true, 80000, 85000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '5500', 'IT and Software', 'expense', 'Standard accounting account for it and software', true, 60000, 65000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '5600', 'Professional Fees', 'expense', 'Standard accounting account for professional fees', true, 40000, 42000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '5700', 'Travel Expense', 'expense', 'Standard accounting account for travel expense', true, 30000, 32000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '5800', 'Insurance Expense', 'expense', 'Standard accounting account for insurance expense', true, 25000, 26000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '5900', 'Depreciation', 'expense', 'Standard accounting account for depreciation', true, 50000, 52000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '5950', 'Interest Expense', 'expense', 'Standard accounting account for interest expense', true, 15000, 16000, CURRENT_DATE - INTERVAL '1 year', NOW()),
    (current_user_id, '5999', 'Miscellaneous Expense', 'expense', 'Standard accounting account for miscellaneous expense', true, 20000, 22000, CURRENT_DATE - INTERVAL '1 year', NOW())
  ON CONFLICT (user_id, account_code) DO NOTHING;
  
  RAISE NOTICE 'Seeded chart of accounts';
  
  RAISE NOTICE '✅ SEEDING COMPLETED SUCCESSFULLY';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  Invoices: 50 (with multiple items each)';
  RAISE NOTICE '  Bank Accounts: 5';
  RAISE NOTICE '  Bank Transactions: ~120';
  RAISE NOTICE '  Scheduled Payments: 25';
  RAISE NOTICE '  Chart of Accounts: 27 entries';
  
END $$;
