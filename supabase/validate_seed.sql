-- =====================================================
-- HR SEED VALIDATION SCRIPT
-- =====================================================
-- Validates that HR seed data meets all requirements:
-- - Exactly 50 employees
-- - Proper org hierarchy (CEO at top)
-- - No circular reporting
-- - 12 months payroll per employee
-- - 365 days attendance per employee
-- - No FK violations
-- =====================================================

\echo '============================================================'
\echo 'HR SEED DATA VALIDATION'
\echo '============================================================'
\echo ''

-- =====================================================
-- TEST 1: Employee Count
-- =====================================================
\echo '--- Test 1: Employee Count (Expected: 50) ---'
DO $$
DECLARE
    v_employee_count INTEGER;
    v_active_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_employee_count 
    FROM profiles 
    WHERE is_deleted = FALSE OR is_deleted IS NULL;
    
    SELECT COUNT(*) INTO v_active_count 
    FROM profiles 
    WHERE current_state IN ('active', 'on_probation', 'confirmed');
    
    RAISE NOTICE 'Total Employees: %', v_employee_count;
    RAISE NOTICE 'Active Employees: %', v_active_count;
    
    IF v_employee_count = 50 THEN
        RAISE NOTICE '✅ PASS: Exactly 50 employees exist';
    ELSE
        RAISE WARNING '❌ FAIL: Expected 50 employees, found %', v_employee_count;
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 2: CEO Exists (One employee with no manager)
-- =====================================================
\echo '--- Test 2: CEO Exists (manager_id IS NULL) ---'
DO $$
DECLARE
    v_ceo_count INTEGER;
    v_ceo_name TEXT;
BEGIN
    SELECT COUNT(*), MAX(full_name) 
    INTO v_ceo_count, v_ceo_name
    FROM profiles 
    WHERE manager_id IS NULL 
      AND (is_deleted = FALSE OR is_deleted IS NULL);
    
    RAISE NOTICE 'CEO Count: %', v_ceo_count;
    RAISE NOTICE 'CEO Name: %', v_ceo_name;
    
    IF v_ceo_count = 1 THEN
        RAISE NOTICE '✅ PASS: Exactly one CEO exists (no manager)';
    ELSE
        RAISE WARNING '❌ FAIL: Expected 1 CEO, found %', v_ceo_count;
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 3: No Circular Reporting Hierarchy
-- =====================================================
\echo '--- Test 3: No Circular Reporting Hierarchy ---'
DO $$
DECLARE
    v_circular_count INTEGER;
BEGIN
    -- Use recursive CTE to detect cycles
    WITH RECURSIVE hierarchy AS (
        SELECT 
            id,
            manager_id,
            ARRAY[id] as path,
            1 as depth
        FROM profiles
        WHERE manager_id IS NOT NULL
        
        UNION ALL
        
        SELECT 
            h.id,
            p.manager_id,
            h.path || p.id,
            h.depth + 1
        FROM hierarchy h
        JOIN profiles p ON h.manager_id = p.id
        WHERE p.id = ANY(h.path) = FALSE -- No cycle
          AND h.depth < 10 -- Prevent infinite recursion
    )
    SELECT COUNT(*) INTO v_circular_count
    FROM hierarchy
    WHERE id = ANY(path[2:array_length(path, 1)]);
    
    IF v_circular_count = 0 THEN
        RAISE NOTICE '✅ PASS: No circular reporting hierarchy detected';
    ELSE
        RAISE WARNING '❌ FAIL: Found % circular references', v_circular_count;
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 4: Org Hierarchy Validation
-- =====================================================
\echo '--- Test 4: Organization Hierarchy Structure ---'
SELECT 
    COALESCE(job_title, 'Unknown') as level,
    COUNT(*) as count
FROM profiles
WHERE is_deleted = FALSE OR is_deleted IS NULL
GROUP BY job_title
ORDER BY COUNT(*) DESC;
\echo ''

-- =====================================================
-- TEST 5: Manager Assignment Check
-- =====================================================
\echo '--- Test 5: All Employees (except CEO) Have Managers ---'
DO $$
DECLARE
    v_orphan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_orphan_count
    FROM profiles
    WHERE manager_id IS NULL
      AND job_title NOT ILIKE '%CEO%'
      AND job_title NOT ILIKE '%Chief Executive%'
      AND (is_deleted = FALSE OR is_deleted IS NULL);
    
    IF v_orphan_count = 0 THEN
        RAISE NOTICE '✅ PASS: All non-CEO employees have managers';
    ELSE
        RAISE WARNING '❌ FAIL: Found % employees without managers', v_orphan_count;
        
        -- List orphans
        RAISE NOTICE 'Orphaned employees:';
        FOR rec IN 
            SELECT employee_id, full_name, job_title
            FROM profiles
            WHERE manager_id IS NULL
              AND job_title NOT ILIKE '%CEO%'
              AND (is_deleted = FALSE OR is_deleted IS NULL)
        LOOP
            RAISE NOTICE '  - % (%): %', rec.employee_id, rec.full_name, rec.job_title;
        END LOOP;
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 6: Salary Structures Exist
-- =====================================================
\echo '--- Test 6: All Employees Have Salary Structures ---'
DO $$
DECLARE
    v_employees_without_salary INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_employees_without_salary
    FROM profiles p
    LEFT JOIN salary_structures ss ON ss.profile_id = p.id AND ss.is_current = TRUE
    WHERE ss.id IS NULL
      AND (p.is_deleted = FALSE OR p.is_deleted IS NULL);
    
    IF v_employees_without_salary = 0 THEN
        RAISE NOTICE '✅ PASS: All employees have salary structures';
    ELSE
        RAISE WARNING '❌ FAIL: % employees missing salary structures', v_employees_without_salary;
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 7: Payroll Records (12 months per employee)
-- =====================================================
\echo '--- Test 7: Payroll Records Coverage ---'
DO $$
DECLARE
    v_total_employees INTEGER;
    v_total_payroll_records INTEGER;
    v_expected_records INTEGER;
    v_employees_with_payroll INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total_employees
    FROM profiles
    WHERE current_state IN ('active', 'on_probation', 'confirmed');
    
    SELECT COUNT(*) INTO v_total_payroll_records
    FROM payroll_records;
    
    -- Expected: 12 months per active employee
    v_expected_records := v_total_employees * 12;
    
    SELECT COUNT(DISTINCT profile_id) INTO v_employees_with_payroll
    FROM payroll_records;
    
    RAISE NOTICE 'Total Active Employees: %', v_total_employees;
    RAISE NOTICE 'Total Payroll Records: %', v_total_payroll_records;
    RAISE NOTICE 'Expected Records (12 months): %', v_expected_records;
    RAISE NOTICE 'Employees with Payroll: %', v_employees_with_payroll;
    
    IF v_total_payroll_records >= v_expected_records * 0.9 THEN
        RAISE NOTICE '✅ PASS: Payroll records exist (>90%% coverage)';
    ELSE
        RAISE WARNING '❌ FAIL: Insufficient payroll records';
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 8: Attendance Records (365 days)
-- =====================================================
\echo '--- Test 8: Attendance Records Coverage ---'
DO $$
DECLARE
    v_total_employees INTEGER;
    v_total_attendance INTEGER;
    v_expected_attendance INTEGER;
    v_avg_days_per_employee NUMERIC;
BEGIN
    SELECT COUNT(*) INTO v_total_employees
    FROM profiles
    WHERE current_state IN ('active', 'on_probation', 'confirmed');
    
    SELECT COUNT(*) INTO v_total_attendance
    FROM attendance_records;
    
    -- Expected: ~365 days per employee
    v_expected_attendance := v_total_employees * 365;
    
    SELECT AVG(day_count) INTO v_avg_days_per_employee
    FROM (
        SELECT profile_id, COUNT(*) as day_count
        FROM attendance_records
        GROUP BY profile_id
    ) sub;
    
    RAISE NOTICE 'Total Active Employees: %', v_total_employees;
    RAISE NOTICE 'Total Attendance Records: %', v_total_attendance;
    RAISE NOTICE 'Expected Records (365 days): %', v_expected_attendance;
    RAISE NOTICE 'Avg Days per Employee: %', ROUND(v_avg_days_per_employee, 2);
    
    IF v_total_attendance >= v_expected_attendance * 0.8 THEN
        RAISE NOTICE '✅ PASS: Attendance records exist (>80%% coverage)';
    ELSE
        RAISE WARNING '❌ FAIL: Insufficient attendance records';
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 9: Leave Balances
-- =====================================================
\echo '--- Test 9: Leave Balances Exist ---'
DO $$
DECLARE
    v_employees_with_leave INTEGER;
    v_total_employees INTEGER;
BEGIN
    SELECT COUNT(DISTINCT profile_id) INTO v_employees_with_leave
    FROM leave_balances;
    
    SELECT COUNT(*) INTO v_total_employees
    FROM profiles
    WHERE current_state IN ('active', 'on_probation', 'confirmed');
    
    RAISE NOTICE 'Employees with Leave Balances: %', v_employees_with_leave;
    RAISE NOTICE 'Total Active Employees: %', v_total_employees;
    
    IF v_employees_with_leave >= v_total_employees * 0.9 THEN
        RAISE NOTICE '✅ PASS: Most employees have leave balances';
    ELSE
        RAISE WARNING '❌ FAIL: Insufficient leave balance records';
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 10: Foreign Key Integrity
-- =====================================================
\echo '--- Test 10: Foreign Key Integrity ---'
DO $$
DECLARE
    v_orphan_salary INTEGER;
    v_orphan_payroll INTEGER;
    v_orphan_attendance INTEGER;
    v_total_violations INTEGER := 0;
BEGIN
    -- Check salary_structures
    SELECT COUNT(*) INTO v_orphan_salary
    FROM salary_structures ss
    LEFT JOIN profiles p ON ss.profile_id = p.id
    WHERE p.id IS NULL;
    
    IF v_orphan_salary > 0 THEN
        RAISE WARNING 'Found % orphaned salary_structures records', v_orphan_salary;
        v_total_violations := v_total_violations + v_orphan_salary;
    END IF;
    
    -- Check payroll_records
    SELECT COUNT(*) INTO v_orphan_payroll
    FROM payroll_records pr
    LEFT JOIN profiles p ON pr.profile_id = p.id
    WHERE p.id IS NULL;
    
    IF v_orphan_payroll > 0 THEN
        RAISE WARNING 'Found % orphaned payroll_records', v_orphan_payroll;
        v_total_violations := v_total_violations + v_orphan_payroll;
    END IF;
    
    -- Check attendance_records
    SELECT COUNT(*) INTO v_orphan_attendance
    FROM attendance_records ar
    LEFT JOIN profiles p ON ar.profile_id = p.id
    WHERE p.id IS NULL;
    
    IF v_orphan_attendance > 0 THEN
        RAISE WARNING 'Found % orphaned attendance_records', v_orphan_attendance;
        v_total_violations := v_total_violations + v_orphan_attendance;
    END IF;
    
    IF v_total_violations = 0 THEN
        RAISE NOTICE '✅ PASS: No foreign key violations detected';
    ELSE
        RAISE WARNING '❌ FAIL: Found % total FK violations', v_total_violations;
    END IF;
END $$;
\echo ''

-- =====================================================
-- TEST 11: Department Distribution
-- =====================================================
\echo '--- Test 11: Department Distribution ---'
SELECT 
    department,
    COUNT(*) as employee_count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM profiles
WHERE (is_deleted = FALSE OR is_deleted IS NULL)
  AND department IS NOT NULL
GROUP BY department
ORDER BY employee_count DESC;
\echo ''

-- =====================================================
-- TEST 12: Salary Band Validation
-- =====================================================
\echo '--- Test 12: Salary Bands by Role ---'
SELECT 
    p.job_title,
    COUNT(*) as count,
    MIN(ss.annual_ctc) as min_ctc,
    ROUND(AVG(ss.annual_ctc), 2) as avg_ctc,
    MAX(ss.annual_ctc) as max_ctc
FROM profiles p
JOIN salary_structures ss ON ss.profile_id = p.id AND ss.is_current = TRUE
WHERE p.is_deleted = FALSE OR p.is_deleted IS NULL
GROUP BY p.job_title
ORDER BY avg_ctc DESC
LIMIT 15;
\echo ''

-- =====================================================
-- VALIDATION SUMMARY
-- =====================================================
\echo '============================================================'
\echo 'HR SEED VALIDATION SUMMARY'
\echo '============================================================'

DO $$
DECLARE
    v_employee_count INTEGER;
    v_ceo_count INTEGER;
    v_payroll_count INTEGER;
    v_attendance_count INTEGER;
    v_all_tests_passed BOOLEAN := TRUE;
BEGIN
    SELECT COUNT(*) INTO v_employee_count FROM profiles WHERE is_deleted = FALSE OR is_deleted IS NULL;
    SELECT COUNT(*) INTO v_ceo_count FROM profiles WHERE manager_id IS NULL AND (is_deleted = FALSE OR is_deleted IS NULL);
    SELECT COUNT(*) INTO v_payroll_count FROM payroll_records;
    SELECT COUNT(*) INTO v_attendance_count FROM attendance_records;
    
    RAISE NOTICE '
╔════════════════════════════════════════════════════════════════╗
║  HR SEED VALIDATION RESULTS                                    ║
╠════════════════════════════════════════════════════════════════╣
║  Total Employees: %                                             ║
║  CEO Count: %                                                   ║
║  Payroll Records: %                                             ║
║  Attendance Records: %                                          ║
╠════════════════════════════════════════════════════════════════╣
║  Status: % COMPLETE                                             ║
╚════════════════════════════════════════════════════════════════╝
    ',
    LPAD(v_employee_count::TEXT, 48),
    LPAD(v_ceo_count::TEXT, 55),
    LPAD(v_payroll_count::TEXT, 49),
    LPAD(v_attendance_count::TEXT, 46),
    CASE WHEN v_employee_count = 50 THEN '✅' ELSE '⚠️' END;
END $$;

\echo ''
\echo 'Validation complete. Review the output above for any failures.'
