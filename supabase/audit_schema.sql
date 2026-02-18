-- =====================================================
-- PHASE 1: COMPREHENSIVE SCHEMA AUDIT
-- =====================================================
-- This script generates a complete inventory of the database schema
-- Run this against both dev and prod to detect drift
-- =====================================================

\echo '============================================================'
\echo 'SUPABASE ERP SYSTEM - COMPREHENSIVE SCHEMA AUDIT'
\echo '============================================================'
\echo ''

-- Database Info
\echo '--- DATABASE INFORMATION ---'
SELECT 
    current_database() as database_name,
    current_user as current_user,
    version() as postgres_version;
\echo ''

-- =====================================================
-- TABLES INVENTORY
-- =====================================================
\echo '--- TABLES INVENTORY ---'
SELECT 
    schemaname as schema,
    tablename as table_name,
    tableowner as owner,
    hasindexes as has_indexes,
    hasrules as has_rules,
    hastriggers as has_triggers
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
\echo ''

-- =====================================================
-- TABLE COLUMNS DETAIL
-- =====================================================
\echo '--- TABLE COLUMNS (with data types and constraints) ---'
SELECT 
    c.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default,
    CASE 
        WHEN pk.column_name IS NOT NULL THEN 'PRIMARY KEY'
        WHEN fk.column_name IS NOT NULL THEN 'FOREIGN KEY'
        ELSE ''
    END as key_type
FROM information_schema.columns c
LEFT JOIN (
    SELECT ku.table_name, ku.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage ku
        ON tc.constraint_name = ku.constraint_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
LEFT JOIN (
    SELECT ku.table_name, ku.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage ku
        ON tc.constraint_name = ku.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
) fk ON c.table_name = fk.table_name AND c.column_name = fk.column_name
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;
\echo ''

-- =====================================================
-- FOREIGN KEYS
-- =====================================================
\echo '--- FOREIGN KEY CONSTRAINTS ---'
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;
\echo ''

-- =====================================================
-- INDEXES
-- =====================================================
\echo '--- INDEXES (excluding primary keys) ---'
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND indexname NOT LIKE '%_pkey'
ORDER BY tablename, indexname;
\echo ''

-- =====================================================
-- UNIQUE CONSTRAINTS
-- =====================================================
\echo '--- UNIQUE CONSTRAINTS ---'
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;
\echo ''

-- =====================================================
-- CHECK CONSTRAINTS
-- =====================================================
\echo '--- CHECK CONSTRAINTS ---'
SELECT
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name
WHERE tc.constraint_type = 'CHECK'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;
\echo ''

-- =====================================================
-- TRIGGERS
-- =====================================================
\echo '--- TRIGGERS ---'
SELECT
    trigger_schema,
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
\echo ''

-- =====================================================
-- RLS POLICIES
-- =====================================================
\echo '--- ROW LEVEL SECURITY POLICIES ---'
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
\echo ''

-- =====================================================
-- FUNCTIONS
-- =====================================================
\echo '--- FUNCTIONS (excluding system functions) ---'
SELECT
    n.nspname as schema,
    p.proname as function_name,
    pg_get_function_result(p.oid) as result_type,
    pg_get_function_arguments(p.oid) as arguments,
    CASE p.provolatile
        WHEN 'i' THEN 'IMMUTABLE'
        WHEN 's' THEN 'STABLE'
        WHEN 'v' THEN 'VOLATILE'
    END as volatility,
    CASE 
        WHEN p.prosecdef THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
    END as security
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.prokind = 'f'
ORDER BY p.proname;
\echo ''

-- =====================================================
-- EXTENSIONS
-- =====================================================
\echo '--- INSTALLED EXTENSIONS ---'
SELECT
    extname as extension_name,
    extversion as version,
    extrelocatable as relocatable
FROM pg_extension
ORDER BY extname;
\echo ''

-- =====================================================
-- ENUM TYPES
-- =====================================================
\echo '--- CUSTOM ENUM TYPES ---'
SELECT
    n.nspname as schema,
    t.typname as enum_name,
    string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) as values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'public'
GROUP BY n.nspname, t.typname
ORDER BY t.typname;
\echo ''

-- =====================================================
-- TABLE SIZE STATISTICS
-- =====================================================
\echo '--- TABLE SIZE STATISTICS ---'
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
\echo ''

-- =====================================================
-- ROW COUNTS
-- =====================================================
\echo '--- TABLE ROW COUNTS ---'
SELECT
    schemaname,
    tablename,
    n_live_tup as row_count,
    n_dead_tup as dead_rows,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;
\echo ''

-- =====================================================
-- MISSING INDEXES ON FOREIGN KEYS
-- =====================================================
\echo '--- POTENTIAL MISSING INDEXES ON FOREIGN KEYS ---'
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    CASE 
        WHEN idx.indexname IS NULL THEN 'MISSING INDEX'
        ELSE 'INDEXED'
    END as index_status
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
LEFT JOIN pg_indexes idx
    ON idx.tablename = tc.table_name
    AND idx.indexdef LIKE '%' || kcu.column_name || '%'
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;
\echo ''

-- =====================================================
-- SCHEMA HEALTH CHECK
-- =====================================================
\echo '--- SCHEMA HEALTH CHECK ---'
SELECT
    'Total Tables' as metric,
    COUNT(*)::text as value
FROM information_schema.tables
WHERE table_schema = 'public'
UNION ALL
SELECT
    'Total Columns' as metric,
    COUNT(*)::text as value
FROM information_schema.columns
WHERE table_schema = 'public'
UNION ALL
SELECT
    'Total Foreign Keys' as metric,
    COUNT(*)::text as value
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY'
    AND table_schema = 'public'
UNION ALL
SELECT
    'Total Indexes' as metric,
    COUNT(*)::text as value
FROM pg_indexes
WHERE schemaname = 'public'
UNION ALL
SELECT
    'Total Functions' as metric,
    COUNT(*)::text as value
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.prokind = 'f'
UNION ALL
SELECT
    'Total Triggers' as metric,
    COUNT(*)::text as value
FROM information_schema.triggers
WHERE trigger_schema = 'public'
UNION ALL
SELECT
    'Total RLS Policies' as metric,
    COUNT(*)::text as value
FROM pg_policies
WHERE schemaname = 'public';
\echo ''

\echo '============================================================'
\echo 'AUDIT COMPLETE'
\echo 'Compare this output between dev and prod to detect drift'
\echo '============================================================'
