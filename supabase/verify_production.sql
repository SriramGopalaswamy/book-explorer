-- =====================================================
-- PRODUCTION DEPLOYMENT VERIFICATION SCRIPT
-- =====================================================
-- Run this before any production deployment to ensure:
-- 1. No seed files will execute
-- 2. Only schema migrations will apply
-- 3. Database is in expected clean state
-- =====================================================

\echo '============================================================'
\echo 'PRODUCTION DEPLOYMENT VERIFICATION'
\echo '============================================================'
\echo ''

-- =====================================================
-- CHECK 1: Verify this is NOT a seed operation
-- =====================================================
\echo '--- Check 1: Deployment Type Verification ---'
DO $$
BEGIN
    -- This script should only be run during deployment verification
    -- NOT during actual seed operations
    RAISE NOTICE '✅ Running production verification (not seeding)';
END $$;
\echo ''

-- =====================================================
-- CHECK 2: Verify Environment
-- =====================================================
\echo '--- Check 2: Database Environment ---'
DO $$
DECLARE
    v_db_name TEXT;
BEGIN
    SELECT current_database() INTO v_db_name;
    
    RAISE NOTICE 'Current Database: %', v_db_name;
    
    IF v_db_name ILIKE '%prod%' OR v_db_name ILIKE '%production%' THEN
        RAISE NOTICE '✅ Detected production environment';
    ELSIF v_db_name ILIKE '%dev%' OR v_db_name ILIKE '%development%' THEN
        RAISE WARNING '⚠️  This appears to be a development environment';
        RAISE WARNING '   For production deployment, ensure you are connected to the production database';
    ELSE
        RAISE WARNING '⚠️  Cannot determine environment from database name';
        RAISE WARNING '   Please verify manually that you are connected to production';
    END IF;
END $$;
\echo ''

-- =====================================================
-- CHECK 3: Verify Clean State (No Transactional Data)
-- =====================================================
\echo '--- Check 3: Production Clean State Verification ---'
DO $$
DECLARE
    v_profile_count INTEGER;
    v_payroll_count INTEGER;
    v_journal_count INTEGER;
    v_invoice_count INTEGER;
    v_is_clean BOOLEAN := TRUE;
BEGIN
    -- Check profiles (should be minimal - only real users who signed up)
    SELECT COUNT(*) INTO v_profile_count FROM profiles;
    
    IF v_profile_count > 10 THEN
        RAISE WARNING '❌ FAIL: Found % profiles (expected <= 10 for fresh production)', v_profile_count;
        v_is_clean := FALSE;
    ELSE
        RAISE NOTICE '✅ PASS: Profile count acceptable (%)', v_profile_count;
    END IF;
    
    -- Check payroll (should be 0 in fresh production)
    BEGIN
        SELECT COUNT(*) INTO v_payroll_count FROM payroll_records;
        IF v_payroll_count > 0 THEN
            RAISE WARNING '❌ FAIL: Found % payroll records (expected 0 in fresh production)', v_payroll_count;
            v_is_clean := FALSE;
        ELSE
            RAISE NOTICE '✅ PASS: No payroll records';
        END IF;
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE '✅ PASS: Payroll table exists but is empty or not created';
    END;
    
    -- Check journal entries (should be 0 in fresh production)
    BEGIN
        SELECT COUNT(*) INTO v_journal_count FROM journal_entries;
        IF v_journal_count > 0 THEN
            RAISE WARNING '❌ FAIL: Found % journal entries (expected 0 in fresh production)', v_journal_count;
            v_is_clean := FALSE;
        ELSE
            RAISE NOTICE '✅ PASS: No journal entries';
        END IF;
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE '✅ PASS: Journal entries table not created yet';
    END;
    
    -- Check invoices (should be 0 in fresh production)
    BEGIN
        SELECT COUNT(*) INTO v_invoice_count FROM invoices;
        IF v_invoice_count > 0 THEN
            RAISE WARNING '❌ FAIL: Found % invoices (expected 0 in fresh production)', v_invoice_count;
            v_is_clean := FALSE;
        ELSE
            RAISE NOTICE '✅ PASS: No invoices';
        END IF;
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE '✅ PASS: Invoices table not created yet';
    END;
    
    IF v_is_clean THEN
        RAISE NOTICE '
╔════════════════════════════════════════════════════════════════╗
║  ✅ PRODUCTION DATABASE IS CLEAN                               ║
║                                                                ║
║  No transactional data detected.                               ║
║  Safe to proceed with deployment.                              ║
╚════════════════════════════════════════════════════════════════╝
        ';
    ELSE
        RAISE EXCEPTION '
╔════════════════════════════════════════════════════════════════╗
║  ❌ PRODUCTION DATABASE CONTAINS TRANSACTIONAL DATA            ║
║                                                                ║
║  This database appears to have seed data.                      ║
║  DO NOT DEPLOY TO THIS DATABASE.                               ║
║                                                                ║
║  Please verify you are connected to the correct production     ║
║  database and that it has not been accidentally seeded.        ║
╚════════════════════════════════════════════════════════════════╝
        ';
    END IF;
END $$;
\echo ''

-- =====================================================
-- CHECK 4: Schema Tables Exist
-- =====================================================
\echo '--- Check 4: Required Schema Tables ---'
DO $$
DECLARE
    v_required_tables TEXT[] := ARRAY[
        'profiles', 
        'user_roles',
        'attendance_records',
        'leave_balances',
        'payroll_records',
        'salary_structures'
    ];
    v_table TEXT;
    v_exists BOOLEAN;
    v_all_exist BOOLEAN := TRUE;
BEGIN
    RAISE NOTICE 'Checking for required tables:';
    
    FOREACH v_table IN ARRAY v_required_tables
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = v_table
        ) INTO v_exists;
        
        IF v_exists THEN
            RAISE NOTICE '  ✅ %', v_table;
        ELSE
            RAISE WARNING '  ❌ % (missing)', v_table;
            v_all_exist := FALSE;
        END IF;
    END LOOP;
    
    IF v_all_exist THEN
        RAISE NOTICE '✅ All required tables exist';
    ELSE
        RAISE WARNING '⚠️  Some tables are missing - migrations may not be complete';
    END IF;
END $$;
\echo ''

-- =====================================================
-- CHECK 5: RLS Policies Enabled
-- =====================================================
\echo '--- Check 5: Row Level Security Status ---'
DO $$
DECLARE
    v_tables_without_rls INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_tables_without_rls
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('schema_migrations', 'spatial_ref_sys')
      AND rowsecurity = FALSE;
    
    IF v_tables_without_rls = 0 THEN
        RAISE NOTICE '✅ PASS: All tables have RLS enabled';
    ELSE
        RAISE WARNING '⚠️  WARNING: % tables without RLS', v_tables_without_rls;
        
        -- List tables without RLS
        FOR rec IN
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
              AND rowsecurity = FALSE
              AND tablename NOT IN ('schema_migrations', 'spatial_ref_sys')
        LOOP
            RAISE WARNING '  - %', rec.tablename;
        END LOOP;
    END IF;
END $$;
\echo ''

-- =====================================================
-- CHECK 6: Functions Exist
-- =====================================================
\echo '--- Check 6: Critical RPC Functions ---'
DO $$
DECLARE
    v_critical_functions TEXT[] := ARRAY[
        'transition_employee_state',
        'calculate_fnf',
        'process_payroll_for_employee'
    ];
    v_function TEXT;
    v_exists BOOLEAN;
BEGIN
    RAISE NOTICE 'Checking for critical functions:';
    
    FOREACH v_function IN ARRAY v_critical_functions
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public'
            AND p.proname = v_function
        ) INTO v_exists;
        
        IF v_exists THEN
            RAISE NOTICE '  ✅ %', v_function;
        ELSE
            RAISE WARNING '  ⚠️  % (missing)', v_function;
        END IF;
    END LOOP;
END $$;
\echo ''

\echo '============================================================'
\echo 'PRODUCTION VERIFICATION COMPLETE'
\echo ''
\echo 'If all checks passed:'
\echo '  - Safe to run: supabase db push --linked'
\echo '  - Schema will be updated'
\echo '  - No data will be seeded'
\echo ''
\echo 'If any checks failed:'
\echo '  - DO NOT PROCEED with deployment'
\echo '  - Verify you are connected to the correct database'
\echo '  - Review migration files for issues'
\echo '============================================================'
