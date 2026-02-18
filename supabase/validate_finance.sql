-- =====================================================
-- FINANCE SEED VALIDATION SCRIPT
-- =====================================================
-- Validates that Finance seed data meets all requirements:
-- - 36 months of transactions exist
-- - All journal entries are balanced (debit = credit)
-- - Ledger entries linked correctly
-- - Chart of accounts exists
-- - No orphan ledger rows
-- =====================================================

\echo '============================================================'
\echo 'FINANCE SEED DATA VALIDATION'
\echo '============================================================'
\echo ''

-- =====================================================
-- TEST 1: Chart of Accounts Exists
-- =====================================================
\echo '--- Test 1: Chart of Accounts ---'
DO $$
DECLARE
    v_account_count INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chart_of_accounts') THEN
        SELECT COUNT(*) INTO v_account_count FROM chart_of_accounts;
        
        RAISE NOTICE 'Chart of Accounts: % accounts', v_account_count;
        
        IF v_account_count >= 30 THEN
            RAISE NOTICE '✅ PASS: Chart of accounts exists (% accounts)', v_account_count;
        ELSE
            RAISE WARNING '❌ FAIL: Insufficient accounts (expected >= 30, found %)', v_account_count;
        END IF;
    ELSE
        RAISE WARNING '❌ FAIL: chart_of_accounts table does not exist';
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 2: Account Type Distribution
-- =====================================================
\echo '--- Test 2: Account Type Distribution ---'
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chart_of_accounts') THEN
        RAISE NOTICE 'Account distribution by type:';
        FOR rec IN 
            SELECT account_type, COUNT(*) as count
            FROM chart_of_accounts
            GROUP BY account_type
            ORDER BY count DESC
        LOOP
            RAISE NOTICE '  %: % accounts', rec.account_type, rec.count;
        END LOOP;
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 3: Journal Entries Period Coverage
-- =====================================================
\echo '--- Test 3: Journal Entries - 36 Month Coverage ---'
DO $$
DECLARE
    v_journal_count INTEGER;
    v_oldest_entry DATE;
    v_newest_entry DATE;
    v_month_count INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        SELECT COUNT(*), MIN(entry_date), MAX(entry_date)
        INTO v_journal_count, v_oldest_entry, v_newest_entry
        FROM journal_entries;
        
        -- Count distinct months
        SELECT COUNT(DISTINCT date_trunc('month', entry_date))
        INTO v_month_count
        FROM journal_entries;
        
        RAISE NOTICE 'Total Journal Entries: %', v_journal_count;
        RAISE NOTICE 'Oldest Entry: %', v_oldest_entry;
        RAISE NOTICE 'Newest Entry: %', v_newest_entry;
        RAISE NOTICE 'Months Covered: %', v_month_count;
        
        IF v_month_count >= 36 THEN
            RAISE NOTICE '✅ PASS: 36 months of journal entries exist';
        ELSE
            RAISE WARNING '❌ FAIL: Only % months of data (expected 36)', v_month_count;
        END IF;
        
        IF v_journal_count >= 1000 THEN
            RAISE NOTICE '✅ PASS: Sufficient transaction volume (% entries)', v_journal_count;
        ELSE
            RAISE WARNING '⚠️  WARNING: Low transaction volume (% entries)', v_journal_count;
        END IF;
    ELSE
        RAISE WARNING '❌ FAIL: journal_entries table does not exist';
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 4: Journal Entry Balance Validation (CRITICAL)
-- =====================================================
\echo '--- Test 4: Journal Entry Balance (Debit = Credit) ---'
DO $$
DECLARE
    v_unbalanced_count INTEGER;
    v_total_journals INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        SELECT COUNT(*) INTO v_total_journals FROM journal_entries;
        
        -- Check if total_debit = total_credit for each journal
        SELECT COUNT(*) INTO v_unbalanced_count
        FROM journal_entries
        WHERE ABS(total_debit - total_credit) > 0.01; -- Allow 1 paisa tolerance for rounding
        
        RAISE NOTICE 'Total Journal Entries: %', v_total_journals;
        RAISE NOTICE 'Unbalanced Entries: %', v_unbalanced_count;
        
        IF v_unbalanced_count = 0 THEN
            RAISE NOTICE '✅ PASS: All journal entries are balanced';
        ELSE
            RAISE WARNING '❌ FAIL: Found % unbalanced journal entries', v_unbalanced_count;
            
            -- Show first 5 unbalanced entries
            RAISE WARNING 'Sample unbalanced entries:';
            FOR rec IN 
                SELECT id, entry_date, total_debit, total_credit, 
                       ABS(total_debit - total_credit) as diff
                FROM journal_entries
                WHERE ABS(total_debit - total_credit) > 0.01
                LIMIT 5
            LOOP
                RAISE WARNING '  Entry %: Debit=%, Credit=%, Diff=%', 
                    rec.id, rec.total_debit, rec.total_credit, rec.diff;
            END LOOP;
        END IF;
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 5: Ledger Entry Balance by Journal
-- =====================================================
\echo '--- Test 5: Ledger Entries Balance Per Journal ---'
DO $$
DECLARE
    v_unbalanced_ledgers INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ledger_entries') THEN
        -- Check if SUM(debit) = SUM(credit) for each journal_entry_id
        WITH ledger_balance AS (
            SELECT 
                journal_entry_id,
                SUM(debit) as total_debit,
                SUM(credit) as total_credit,
                ABS(SUM(debit) - SUM(credit)) as difference
            FROM ledger_entries
            GROUP BY journal_entry_id
        )
        SELECT COUNT(*) INTO v_unbalanced_ledgers
        FROM ledger_balance
        WHERE difference > 0.01;
        
        IF v_unbalanced_ledgers = 0 THEN
            RAISE NOTICE '✅ PASS: All ledger entries are balanced per journal';
        ELSE
            RAISE WARNING '❌ FAIL: Found % journals with unbalanced ledgers', v_unbalanced_ledgers;
            
            -- Show unbalanced journals
            RAISE WARNING 'Unbalanced ledger journals:';
            FOR rec IN
                SELECT 
                    journal_entry_id,
                    SUM(debit) as total_debit,
                    SUM(credit) as total_credit,
                    ABS(SUM(debit) - SUM(credit)) as diff
                FROM ledger_entries
                GROUP BY journal_entry_id
                HAVING ABS(SUM(debit) - SUM(credit)) > 0.01
                LIMIT 5
            LOOP
                RAISE WARNING '  Journal %: Debit=%, Credit=%, Diff=%',
                    rec.journal_entry_id, rec.total_debit, rec.total_credit, rec.diff;
            END LOOP;
        END IF;
    ELSE
        RAISE WARNING '⚠️  WARNING: ledger_entries table does not exist';
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 6: Orphaned Ledger Entries
-- =====================================================
\echo '--- Test 6: No Orphaned Ledger Entries ---'
DO $$
DECLARE
    v_orphan_count INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ledger_entries') 
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        
        SELECT COUNT(*) INTO v_orphan_count
        FROM ledger_entries le
        LEFT JOIN journal_entries je ON le.journal_entry_id = je.id
        WHERE je.id IS NULL;
        
        IF v_orphan_count = 0 THEN
            RAISE NOTICE '✅ PASS: No orphaned ledger entries';
        ELSE
            RAISE WARNING '❌ FAIL: Found % orphaned ledger entries', v_orphan_count;
        END IF;
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 7: Ledger Account Code Validation
-- =====================================================
\echo '--- Test 7: Ledger Entries Use Valid Account Codes ---'
DO $$
DECLARE
    v_invalid_codes INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ledger_entries')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chart_of_accounts') THEN
        
        SELECT COUNT(*) INTO v_invalid_codes
        FROM ledger_entries le
        LEFT JOIN chart_of_accounts coa ON le.account_code = coa.code
        WHERE coa.code IS NULL;
        
        IF v_invalid_codes = 0 THEN
            RAISE NOTICE '✅ PASS: All ledger entries use valid account codes';
        ELSE
            RAISE WARNING '❌ FAIL: Found % ledger entries with invalid account codes', v_invalid_codes;
            
            -- Show invalid codes
            RAISE WARNING 'Invalid account codes:';
            FOR rec IN
                SELECT DISTINCT account_code, COUNT(*) as usage_count
                FROM ledger_entries le
                LEFT JOIN chart_of_accounts coa ON le.account_code = coa.code
                WHERE coa.code IS NULL
                GROUP BY account_code
                LIMIT 10
            LOOP
                RAISE WARNING '  Code "%": used % times', rec.account_code, rec.usage_count;
            END LOOP;
        END IF;
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 8: Invoices Exist
-- =====================================================
\echo '--- Test 8: Customer Invoices ---'
DO $$
DECLARE
    v_invoice_count INTEGER;
    v_paid_count INTEGER;
    v_unpaid_count INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
        SELECT COUNT(*) INTO v_invoice_count FROM invoices;
        
        SELECT COUNT(*) INTO v_paid_count 
        FROM invoices 
        WHERE payment_status = 'paid';
        
        SELECT COUNT(*) INTO v_unpaid_count 
        FROM invoices 
        WHERE payment_status IN ('unpaid', 'partially_paid');
        
        RAISE NOTICE 'Total Invoices: %', v_invoice_count;
        RAISE NOTICE 'Paid Invoices: % (%%%)', v_paid_count, 
            ROUND(v_paid_count * 100.0 / NULLIF(v_invoice_count, 0), 2);
        RAISE NOTICE 'Unpaid Invoices: % (%%%)', v_unpaid_count,
            ROUND(v_unpaid_count * 100.0 / NULLIF(v_invoice_count, 0), 2);
        
        IF v_invoice_count >= 100 THEN
            RAISE NOTICE '✅ PASS: Sufficient invoices seeded';
        ELSE
            RAISE WARNING '⚠️  WARNING: Low invoice count (% invoices)', v_invoice_count;
        END IF;
    ELSE
        RAISE WARNING '⚠️  INFO: invoices table does not exist';
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 9: Bank Accounts and Transactions
-- =====================================================
\echo '--- Test 9: Bank Accounts and Transactions ---'
DO $$
DECLARE
    v_account_count INTEGER;
    v_transaction_count INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bank_accounts') THEN
        SELECT COUNT(*) INTO v_account_count FROM bank_accounts;
        RAISE NOTICE 'Bank Accounts: %', v_account_count;
        
        IF v_account_count >= 3 THEN
            RAISE NOTICE '✅ PASS: Bank accounts seeded';
        ELSE
            RAISE WARNING '⚠️  WARNING: Few bank accounts (%)', v_account_count;
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bank_transactions') THEN
        SELECT COUNT(*) INTO v_transaction_count FROM bank_transactions;
        RAISE NOTICE 'Bank Transactions: %', v_transaction_count;
        
        IF v_transaction_count >= 500 THEN
            RAISE NOTICE '✅ PASS: Bank transactions seeded';
        ELSE
            RAISE WARNING '⚠️  WARNING: Low transaction volume (%)', v_transaction_count;
        END IF;
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 10: Monthly Transaction Distribution
-- =====================================================
\echo '--- Test 10: Monthly Transaction Distribution ---'
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        RAISE NOTICE 'Transactions per month (last 12 months):';
        FOR rec IN
            SELECT 
                to_char(entry_date, 'YYYY-MM') as month,
                COUNT(*) as transaction_count,
                SUM(total_debit) as total_amount
            FROM journal_entries
            WHERE entry_date >= CURRENT_DATE - INTERVAL '12 months'
            GROUP BY to_char(entry_date, 'YYYY-MM')
            ORDER BY month DESC
            LIMIT 12
        LOOP
            RAISE NOTICE '  %: % transactions, Total: %',
                rec.month, rec.transaction_count, rec.total_amount;
        END LOOP;
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 11: Revenue Growth Trend
-- =====================================================
\echo '--- Test 11: Revenue Growth Trend (Year over Year) ---'
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ledger_entries') THEN
        
        RAISE NOTICE 'Annual revenue trend:';
        FOR rec IN
            SELECT 
                EXTRACT(YEAR FROM le.entry_date) as year,
                SUM(le.credit) as total_revenue,
                LAG(SUM(le.credit)) OVER (ORDER BY EXTRACT(YEAR FROM le.entry_date)) as prev_year_revenue,
                ROUND(
                    (SUM(le.credit) - LAG(SUM(le.credit)) OVER (ORDER BY EXTRACT(YEAR FROM le.entry_date))) * 100.0 /
                    NULLIF(LAG(SUM(le.credit)) OVER (ORDER BY EXTRACT(YEAR FROM le.entry_date)), 0),
                    2
                ) as growth_rate
            FROM ledger_entries le
            WHERE le.account_code LIKE '4%' -- Revenue accounts
            GROUP BY EXTRACT(YEAR FROM le.entry_date)
            ORDER BY year
        LOOP
            IF rec.growth_rate IS NOT NULL THEN
                RAISE NOTICE '  %: Revenue=%, Growth=%%%',
                    rec.year, rec.total_revenue, rec.growth_rate;
            ELSE
                RAISE NOTICE '  %: Revenue=% (baseline)',
                    rec.year, rec.total_revenue;
            END IF;
        END LOOP;
        
        -- Check if revenue is growing
        IF EXISTS (
            SELECT 1
            FROM (
                SELECT 
                    EXTRACT(YEAR FROM le.entry_date) as year,
                    SUM(le.credit) as total_revenue,
                    LAG(SUM(le.credit)) OVER (ORDER BY EXTRACT(YEAR FROM le.entry_date)) as prev_year_revenue
                FROM ledger_entries le
                WHERE le.account_code LIKE '4%'
                GROUP BY EXTRACT(YEAR FROM le.entry_date)
            ) sub
            WHERE total_revenue > prev_year_revenue
        ) THEN
            RAISE NOTICE '✅ PASS: Revenue shows growth trend';
        ELSE
            RAISE WARNING '⚠️  INFO: Revenue trend unclear or declining';
        END IF;
    END IF;
END $$;
\echo ''

-- =====================================================
-- VALIDATION SUMMARY
-- =====================================================
\echo '============================================================'
\echo 'FINANCE SEED VALIDATION SUMMARY'
\echo '============================================================'

DO $$
DECLARE
    v_journal_count INTEGER := 0;
    v_ledger_count INTEGER := 0;
    v_invoice_count INTEGER := 0;
    v_bank_transactions INTEGER := 0;
    v_unbalanced INTEGER := 0;
BEGIN
    -- Get counts
    BEGIN
        EXECUTE 'SELECT COUNT(*) FROM journal_entries' INTO v_journal_count;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    
    BEGIN
        EXECUTE 'SELECT COUNT(*) FROM ledger_entries' INTO v_ledger_count;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    
    BEGIN
        EXECUTE 'SELECT COUNT(*) FROM invoices' INTO v_invoice_count;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    
    BEGIN
        EXECUTE 'SELECT COUNT(*) FROM bank_transactions' INTO v_bank_transactions;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    
    -- Check for unbalanced entries
    BEGIN
        EXECUTE 'SELECT COUNT(*) FROM journal_entries WHERE ABS(total_debit - total_credit) > 0.01'
        INTO v_unbalanced;
    EXCEPTION WHEN undefined_table THEN v_unbalanced := 0;
    END;
    
    RAISE NOTICE '
╔════════════════════════════════════════════════════════════════╗
║  FINANCE SEED VALIDATION RESULTS                               ║
╠════════════════════════════════════════════════════════════════╣
║  Journal Entries: %                                             ║
║  Ledger Entries: %                                              ║
║  Invoices: %                                                    ║
║  Bank Transactions: %                                           ║
║  Unbalanced Entries: %                                          ║
╠════════════════════════════════════════════════════════════════╣
║  Status: % COMPLETE                                             ║
╚════════════════════════════════════════════════════════════════╝
    ',
    LPAD(v_journal_count::TEXT, 47),
    LPAD(v_ledger_count::TEXT, 48),
    LPAD(v_invoice_count::TEXT, 52),
    LPAD(v_bank_transactions::TEXT, 43),
    LPAD(v_unbalanced::TEXT, 48),
    CASE WHEN v_unbalanced = 0 AND v_journal_count > 1000 THEN '✅' ELSE '⚠️' END;
END $$;

\echo ''
\echo 'Validation complete. All journal entries should be balanced.'
\echo 'Run this query to check for unbalanced entries:'
\echo ''
\echo '  SELECT journal_entry_id, SUM(debit), SUM(credit)'
\echo '  FROM ledger_entries'
\echo '  GROUP BY journal_entry_id'
\echo '  HAVING ABS(SUM(debit) - SUM(credit)) > 0.01;'
\echo ''
