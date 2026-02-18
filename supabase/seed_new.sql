-- =====================================================
-- PRODUCTION-SAFE SEED DATA ORCHESTRATOR
-- =====================================================
-- This file orchestrates all seeding operations
-- CRITICAL: Includes production protection guards
-- =====================================================

-- =====================================================
-- PRODUCTION PROTECTION GUARD #1: Database Name Check
-- =====================================================
DO $$
DECLARE
    v_db_name TEXT;
    v_is_production BOOLEAN := FALSE;
BEGIN
    -- Get current database name
    SELECT current_database() INTO v_db_name;
    
    -- Check if database name contains production indicators
    IF v_db_name ILIKE '%prod%' OR 
       v_db_name ILIKE '%production%' OR
       v_db_name ILIKE '%live%' THEN
        v_is_production := TRUE;
    END IF;
    
    -- Abort if running on production
    IF v_is_production THEN
        RAISE EXCEPTION '
╔════════════════════════════════════════════════════════════════╗
║  🚨 SEEDING BLOCKED ON PRODUCTION DATABASE 🚨                  ║
╠════════════════════════════════════════════════════════════════╣
║  Database: %                                                    ║
║  Action: ABORTED                                               ║
║                                                                ║
║  Seed data should NEVER be executed on production.            ║
║  This guard prevents accidental data pollution.                ║
║                                                                ║
║  To seed development:                                          ║
║    1. Ensure database name contains "dev" or "development"     ║
║    2. Run: supabase db reset                                   ║
╚════════════════════════════════════════════════════════════════╝
        ', v_db_name;
    END IF;
    
    RAISE NOTICE '
╔════════════════════════════════════════════════════════════════╗
║  ✅ SEEDING AUTHORIZED - DEVELOPMENT ENVIRONMENT              ║
╠════════════════════════════════════════════════════════════════╣
║  Database: %                                                    ║
║  Action: PROCEEDING WITH SEED                                  ║
╚════════════════════════════════════════════════════════════════╝
    ', v_db_name;
END $$;

-- =====================================================
-- PRODUCTION PROTECTION GUARD #2: Environment Variable Check
-- =====================================================
-- Note: This check relies on environment configuration
-- In Supabase, set a custom config variable for production
DO $$
BEGIN
    -- Check if SEED_ALLOWED flag is explicitly set to false
    -- This should be set in production environment
    IF current_setting('app.seed_allowed', true) = 'false' THEN
        RAISE EXCEPTION 'Seeding is disabled via environment configuration (app.seed_allowed=false)';
    END IF;
END $$;

-- =====================================================
-- SEEDING SEQUENCE
-- =====================================================
-- Order matters: Dependencies must be seeded first
-- =====================================================

\echo '============================================================'
\echo 'STARTING COMPREHENSIVE SEED PROCESS'
\echo '============================================================'
\echo ''

-- Disable triggers temporarily for faster seeding
SET session_replication_role = replica;

-- =====================================================
-- STEP 1: HR MODULE SEED
-- =====================================================
\echo '--- Step 1: Seeding HR Module (50 employees, org structure) ---'
\ir seed_hr.sql
\echo '✅ HR module seeded'
\echo ''

-- =====================================================
-- STEP 2: FINANCE MODULE SEED
-- =====================================================
\echo '--- Step 2: Seeding Finance Module (3 years of data) ---'
\ir seed_finance.sql
\echo '✅ Finance module seeded'
\echo ''

-- =====================================================
-- STEP 3: OPERATIONAL WORKFLOWS SEED (if needed)
-- =====================================================
-- \echo '--- Step 3: Seeding Operational Workflows ---'
-- \ir seed_os.sql
-- \echo '✅ OS workflows seeded'
-- \echo ''

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- =====================================================
-- STEP 4: POST-SEED VALIDATION
-- =====================================================
\echo '--- Step 4: Running Post-Seed Validation ---'
\ir validate_seed.sql
\echo ''

-- =====================================================
-- SEED COMPLETION REPORT
-- =====================================================
\echo '============================================================'
\echo 'SEED PROCESS COMPLETED SUCCESSFULLY'
\echo '============================================================'

-- Generate summary
DO $$
DECLARE
    v_employee_count INTEGER;
    v_dept_count INTEGER;
    v_journal_count INTEGER;
    v_invoice_count INTEGER;
    v_total_records INTEGER := 0;
BEGIN
    -- Count employees
    SELECT COUNT(*) INTO v_employee_count FROM profiles WHERE is_deleted = FALSE;
    
    -- Count departments (distinct from profiles)
    SELECT COUNT(DISTINCT department) INTO v_dept_count FROM profiles WHERE department IS NOT NULL;
    
    -- Count journal entries (if table exists)
    BEGIN
        EXECUTE 'SELECT COUNT(*) FROM journal_entries' INTO v_journal_count;
    EXCEPTION WHEN undefined_table THEN
        v_journal_count := 0;
    END;
    
    -- Count invoices (if table exists)
    BEGIN
        EXECUTE 'SELECT COUNT(*) FROM invoices' INTO v_invoice_count;
    EXCEPTION WHEN undefined_table THEN
        v_invoice_count := 0;
    END;
    
    v_total_records := v_employee_count + v_journal_count + v_invoice_count;
    
    RAISE NOTICE '
╔════════════════════════════════════════════════════════════════╗
║  SEED SUMMARY                                                  ║
╠════════════════════════════════════════════════════════════════╣
║  Employees Seeded: %                                            ║
║  Departments: %                                                 ║
║  Journal Entries: %                                             ║
║  Invoices: %                                                    ║
║  Total Records: %                                               ║
╠════════════════════════════════════════════════════════════════╣
║  Status: ✅ COMPLETE                                           ║
╚════════════════════════════════════════════════════════════════╝
    ', 
    LPAD(v_employee_count::TEXT, 42),
    LPAD(v_dept_count::TEXT, 51),
    LPAD(v_journal_count::TEXT, 45),
    LPAD(v_invoice_count::TEXT, 50),
    LPAD(v_total_records::TEXT, 47);
END $$;

\echo ''
\echo 'To verify the seed data, you can run:'
\echo '  \\i supabase/validate_seed.sql'
\echo ''
\echo 'To audit the schema:'
\echo '  \\i supabase/audit_schema.sql'
\echo ''
