-- =====================================================
-- HR MODULE SEED DATA
-- =====================================================
-- Creates realistic organizational structure with 50 employees
-- Org Structure:
--   1 CEO
--   4 CXOs (CFO, CTO, CHRO, COO)
--   5 Department Heads
--   10 Managers
--   30 Employees
-- Departments: Finance, HR, Sales, Operations, Tech
-- =====================================================

\echo 'Seeding HR Module - 50 Employees with Org Structure...'

-- =====================================================
-- STEP 1: Create Departments (if table exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'departments') THEN
        INSERT INTO departments (id, name, code, created_at) VALUES
            (gen_random_uuid(), 'Executive', 'EXEC', NOW()),
            (gen_random_uuid(), 'Finance', 'FIN', NOW()),
            (gen_random_uuid(), 'Human Resources', 'HR', NOW()),
            (gen_random_uuid(), 'Sales', 'SALES', NOW()),
            (gen_random_uuid(), 'Operations', 'OPS', NOW()),
            (gen_random_uuid(), 'Technology', 'TECH', NOW())
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE 'Departments seeded';
    END IF;
END $$;

-- =====================================================
-- STEP 2: Create Employee Profiles (50 employees)
-- =====================================================
-- Using generate_series for efficient bulk insertion
-- =====================================================

DO $$
DECLARE
    v_ceo_id UUID;
    v_cfo_id UUID;
    v_cto_id UUID;
    v_chro_id UUID;
    v_coo_id UUID;
    v_fin_head_id UUID;
    v_hr_head_id UUID;
    v_sales_head_id UUID;
    v_ops_head_id UUID;
    v_tech_head_id UUID;
    v_manager_ids UUID[];
    v_start_date DATE := '2021-01-01';
    v_employee_counter INTEGER := 1;
BEGIN
    -- =====================================================
    -- LEVEL 1: CEO
    -- =====================================================
    INSERT INTO profiles (
        user_id, full_name, email, department, job_title, employee_id,
        date_of_birth, date_of_joining, current_state, working_week_policy,
        phone, status
    ) VALUES (
        gen_random_uuid(),
        'Sarah Johnson',
        'sarah.johnson@company.com',
        'Executive',
        'Chief Executive Officer',
        'EMP001',
        '1975-03-15',
        v_start_date,
        'active',
        '5_days',
        '+91-98765-43210',
        'active'
    ) RETURNING id INTO v_ceo_id;
    
    -- Create salary structure for CEO
    INSERT INTO salary_structures (
        profile_id, effective_from, annual_ctc, monthly_gross, structure_json,
        is_current, status
    ) VALUES (
        v_ceo_id, v_start_date, 3600000, 300000,
        jsonb_build_object(
            'basic', 120000, 'hra', 90000, 'transport', 10000, 
            'special_allowance', 80000
        ),
        TRUE, 'active'
    );

    -- =====================================================
    -- LEVEL 2: C-LEVEL EXECUTIVES (CXOs)
    -- =====================================================
    -- CFO
    INSERT INTO profiles (
        user_id, full_name, email, department, job_title, employee_id,
        date_of_birth, date_of_joining, current_state, manager_id, working_week_policy
    ) VALUES (
        gen_random_uuid(), 'Michael Chen', 'michael.chen@company.com',
        'Finance', 'Chief Financial Officer', 'EMP002',
        '1978-06-20', v_start_date, 'active', v_ceo_id, '5_days'
    ) RETURNING id INTO v_cfo_id;
    
    INSERT INTO salary_structures (profile_id, effective_from, annual_ctc, monthly_gross, structure_json, is_current, status)
    VALUES (v_cfo_id, v_start_date, 2400000, 200000, 
        jsonb_build_object('basic', 80000, 'hra', 60000, 'transport', 8000, 'special_allowance', 52000),
        TRUE, 'active');
    
    -- CTO
    INSERT INTO profiles (
        user_id, full_name, email, department, job_title, employee_id,
        date_of_birth, date_of_joining, current_state, manager_id, working_week_policy
    ) VALUES (
        gen_random_uuid(), 'Priya Sharma', 'priya.sharma@company.com',
        'Technology', 'Chief Technology Officer', 'EMP003',
        '1980-09-10', v_start_date, 'active', v_ceo_id, '5_days'
    ) RETURNING id INTO v_cto_id;
    
    INSERT INTO salary_structures (profile_id, effective_from, annual_ctc, monthly_gross, structure_json, is_current, status)
    VALUES (v_cto_id, v_start_date, 2400000, 200000, 
        jsonb_build_object('basic', 80000, 'hra', 60000, 'transport', 8000, 'special_allowance', 52000),
        TRUE, 'active');
    
    -- CHRO
    INSERT INTO profiles (
        user_id, full_name, email, department, job_title, employee_id,
        date_of_birth, date_of_joining, current_state, manager_id, working_week_policy
    ) VALUES (
        gen_random_uuid(), 'Rajesh Kumar', 'rajesh.kumar@company.com',
        'Human Resources', 'Chief Human Resources Officer', 'EMP004',
        '1977-12-05', v_start_date, 'active', v_ceo_id, '5_days'
    ) RETURNING id INTO v_chro_id;
    
    INSERT INTO salary_structures (profile_id, effective_from, annual_ctc, monthly_gross, structure_json, is_current, status)
    VALUES (v_chro_id, v_start_date, 2100000, 175000, 
        jsonb_build_object('basic', 70000, 'hra', 52500, 'transport', 7000, 'special_allowance', 45500),
        TRUE, 'active');
    
    -- COO
    INSERT INTO profiles (
        user_id, full_name, email, department, job_title, employee_id,
        date_of_birth, date_of_joining, current_state, manager_id, working_week_policy
    ) VALUES (
        gen_random_uuid(), 'Anita Desai', 'anita.desai@company.com',
        'Operations', 'Chief Operating Officer', 'EMP005',
        '1979-04-22', v_start_date, 'active', v_ceo_id, '5_days'
    ) RETURNING id INTO v_coo_id;
    
    INSERT INTO salary_structures (profile_id, effective_from, annual_ctc, monthly_gross, structure_json, is_current, status)
    VALUES (v_coo_id, v_start_date, 2100000, 175000, 
        jsonb_build_object('basic', 70000, 'hra', 52500, 'transport', 7000, 'special_allowance', 45500),
        TRUE, 'active');

    -- =====================================================
    -- LEVEL 3: DEPARTMENT HEADS
    -- =====================================================
    -- Finance Head
    INSERT INTO profiles (user_id, full_name, email, department, job_title, employee_id,
        date_of_birth, date_of_joining, current_state, manager_id, working_week_policy)
    VALUES (gen_random_uuid(), 'Vikram Patel', 'vikram.patel@company.com',
        'Finance', 'Head of Finance', 'EMP006',
        '1982-07-15', v_start_date + interval '30 days', 'active', v_cfo_id, '5_days')
    RETURNING id INTO v_fin_head_id;
    
    INSERT INTO salary_structures (profile_id, effective_from, annual_ctc, monthly_gross, structure_json, is_current, status)
    VALUES (v_fin_head_id, v_start_date + interval '30 days', 1800000, 150000, 
        jsonb_build_object('basic', 60000, 'hra', 45000, 'transport', 6000, 'special_allowance', 39000),
        TRUE, 'active');
    
    -- HR Head
    INSERT INTO profiles (user_id, full_name, email, department, job_title, employee_id,
        date_of_birth, date_of_joining, current_state, manager_id, working_week_policy)
    VALUES (gen_random_uuid(), 'Meera Nair', 'meera.nair@company.com',
        'Human Resources', 'Head of HR', 'EMP007',
        '1983-11-28', v_start_date + interval '30 days', 'active', v_chro_id, '5_days')
    RETURNING id INTO v_hr_head_id;
    
    INSERT INTO salary_structures (profile_id, effective_from, annual_ctc, monthly_gross, structure_json, is_current, status)
    VALUES (v_hr_head_id, v_start_date + interval '30 days', 1500000, 125000, 
        jsonb_build_object('basic', 50000, 'hra', 37500, 'transport', 5000, 'special_allowance', 32500),
        TRUE, 'active');
    
    -- Sales Head
    INSERT INTO profiles (user_id, full_name, email, department, job_title, employee_id,
        date_of_birth, date_of_joining, current_state, manager_id, working_week_policy)
    VALUES (gen_random_uuid(), 'Arjun Reddy', 'arjun.reddy@company.com',
        'Sales', 'Head of Sales', 'EMP008',
        '1981-05-10', v_start_date + interval '60 days', 'active', v_ceo_id, '5_days')
    RETURNING id INTO v_sales_head_id;
    
    INSERT INTO salary_structures (profile_id, effective_from, annual_ctc, monthly_gross, structure_json, is_current, status)
    VALUES (v_sales_head_id, v_start_date + interval '60 days', 1800000, 150000, 
        jsonb_build_object('basic', 60000, 'hra', 45000, 'transport', 6000, 'special_allowance', 39000),
        TRUE, 'active');
    
    -- Operations Head
    INSERT INTO profiles (user_id, full_name, email, department, job_title, employee_id,
        date_of_birth, date_of_joining, current_state, manager_id, working_week_policy)
    VALUES (gen_random_uuid(), 'Sunita Iyer', 'sunita.iyer@company.com',
        'Operations', 'Head of Operations', 'EMP009',
        '1984-02-18', v_start_date + interval '60 days', 'active', v_coo_id, '5_days')
    RETURNING id INTO v_ops_head_id;
    
    INSERT INTO salary_structures (profile_id, effective_from, annual_ctc, monthly_gross, structure_json, is_current, status)
    VALUES (v_ops_head_id, v_start_date + interval '60 days', 1500000, 125000, 
        jsonb_build_object('basic', 50000, 'hra', 37500, 'transport', 5000, 'special_allowance', 32500),
        TRUE, 'active');
    
    -- Tech Head
    INSERT INTO profiles (user_id, full_name, email, department, job_title, employee_id,
        date_of_birth, date_of_joining, current_state, manager_id, working_week_policy)
    VALUES (gen_random_uuid(), 'Karthik Menon', 'karthik.menon@company.com',
        'Technology', 'Head of Engineering', 'EMP010',
        '1985-08-30', v_start_date + interval '60 days', 'active', v_cto_id, '5_days')
    RETURNING id INTO v_tech_head_id;
    
    INSERT INTO salary_structures (profile_id, effective_from, annual_ctc, monthly_gross, structure_json, is_current, status)
    VALUES (v_tech_head_id, v_start_date + interval '60 days', 1800000, 150000, 
        jsonb_build_object('basic', 60000, 'hra', 45000, 'transport', 6000, 'special_allowance', 39000),
        TRUE, 'active');

    -- =====================================================
    -- LEVEL 4: MANAGERS (10 managers across departments)
    -- =====================================================
    v_manager_ids := ARRAY[]::UUID[];
    
    FOR i IN 1..10 LOOP
        DECLARE
            v_manager_id UUID;
            v_dept TEXT;
            v_head_id UUID;
            v_salary NUMERIC;
        BEGIN
            -- Distribute managers across departments
            CASE 
                WHEN i <= 2 THEN 
                    v_dept := 'Finance'; v_head_id := v_fin_head_id; v_salary := 1200000;
                WHEN i <= 4 THEN 
                    v_dept := 'Technology'; v_head_id := v_tech_head_id; v_salary := 1400000;
                WHEN i <= 6 THEN 
                    v_dept := 'Sales'; v_head_id := v_sales_head_id; v_salary := 1300000;
                WHEN i <= 8 THEN 
                    v_dept := 'Operations'; v_head_id := v_ops_head_id; v_salary := 1100000;
                ELSE 
                    v_dept := 'Human Resources'; v_head_id := v_hr_head_id; v_salary := 1000000;
            END CASE;
            
            INSERT INTO profiles (
                user_id, full_name, email, department, job_title, employee_id,
                date_of_birth, date_of_joining, current_state, manager_id, working_week_policy
            ) VALUES (
                gen_random_uuid(),
                'Manager ' || i || ' ' || v_dept,
                'manager' || i || '@company.com',
                v_dept,
                v_dept || ' Manager',
                'EMP' || LPAD((10 + i)::TEXT, 3, '0'),
                '1985-01-01'::DATE + (i * 100 || ' days')::INTERVAL,
                v_start_date + (90 + i * 15 || ' days')::INTERVAL,
                'active',
                v_head_id,
                '5_days'
            ) RETURNING id INTO v_manager_id;
            
            v_manager_ids := array_append(v_manager_ids, v_manager_id);
            
            -- Create salary structure
            INSERT INTO salary_structures (
                profile_id, effective_from, annual_ctc, monthly_gross, structure_json, is_current, status
            ) VALUES (
                v_manager_id,
                v_start_date + (90 + i * 15 || ' days')::INTERVAL,
                v_salary,
                v_salary / 12,
                jsonb_build_object(
                    'basic', (v_salary / 12) * 0.4,
                    'hra', (v_salary / 12) * 0.3,
                    'transport', 5000,
                    'special_allowance', (v_salary / 12) * 0.3 - 5000
                ),
                TRUE, 'active'
            );
        END;
    END LOOP;

    -- =====================================================
    -- LEVEL 5: EMPLOYEES (30 employees)
    -- =====================================================
    FOR i IN 1..30 LOOP
        DECLARE
            v_employee_id UUID;
            v_dept TEXT;
            v_manager_id UUID;
            v_salary NUMERIC;
            v_manager_index INTEGER;
        BEGIN
            -- Distribute employees across departments
            CASE 
                WHEN i <= 6 THEN 
                    v_dept := 'Finance'; v_manager_index := 1 + (i % 2); v_salary := 600000 + (i * 10000);
                WHEN i <= 14 THEN 
                    v_dept := 'Technology'; v_manager_index := 3 + (i % 2); v_salary := 800000 + (i * 15000);
                WHEN i <= 20 THEN 
                    v_dept := 'Sales'; v_manager_index := 5 + (i % 2); v_salary := 700000 + (i * 12000);
                WHEN i <= 26 THEN 
                    v_dept := 'Operations'; v_manager_index := 7 + (i % 2); v_salary := 550000 + (i * 8000);
                ELSE 
                    v_dept := 'Human Resources'; v_manager_index := 9 + (i % 2); v_salary := 650000 + (i * 9000);
            END CASE;
            
            v_manager_id := v_manager_ids[v_manager_index];
            
            INSERT INTO profiles (
                user_id, full_name, email, department, job_title, employee_id,
                date_of_birth, date_of_joining, current_state, manager_id, working_week_policy
            ) VALUES (
                gen_random_uuid(),
                'Employee ' || i || ' ' || v_dept,
                'employee' || i || '@company.com',
                v_dept,
                CASE 
                    WHEN i % 3 = 0 THEN 'Senior ' || v_dept || ' Specialist'
                    WHEN i % 3 = 1 THEN v_dept || ' Associate'
                    ELSE 'Junior ' || v_dept || ' Executive'
                END,
                'EMP' || LPAD((20 + i)::TEXT, 3, '0'),
                '1990-01-01'::DATE + (i * 50 || ' days')::INTERVAL,
                v_start_date + (180 + i * 10 || ' days')::INTERVAL,
                CASE 
                    WHEN i <= 25 THEN 'active'
                    WHEN i <= 28 THEN 'on_probation'
                    ELSE 'confirmed'
                END::employee_state,
                v_manager_id,
                CASE WHEN i % 4 = 0 THEN '6_days' ELSE '5_days' END
            ) RETURNING id INTO v_employee_id;
            
            -- Create salary structure
            INSERT INTO salary_structures (
                profile_id, effective_from, annual_ctc, monthly_gross, structure_json, is_current, status
            ) VALUES (
                v_employee_id,
                v_start_date + (180 + i * 10 || ' days')::INTERVAL,
                v_salary,
                v_salary / 12,
                jsonb_build_object(
                    'basic', (v_salary / 12) * 0.4,
                    'hra', (v_salary / 12) * 0.3,
                    'transport', 3000,
                    'special_allowance', (v_salary / 12) * 0.3 - 3000
                ),
                TRUE, 'active'
            );
        END;
    END LOOP;

    RAISE NOTICE '✅ Created 50 employees with org hierarchy';
END $$;

-- =====================================================
-- STEP 3: Create Leave Balances for All Employees
-- =====================================================
INSERT INTO leave_balances (profile_id, leave_type, total_days, used_days, year)
SELECT 
    p.id as profile_id,
    lt.leave_type,
    CASE lt.leave_type
        WHEN 'casual' THEN 12
        WHEN 'earned' THEN 15
        WHEN 'sick' THEN 10
        WHEN 'maternity' THEN 180
        WHEN 'paternity' THEN 15
        ELSE 10
    END as total_days,
    floor(random() * 5)::INTEGER as used_days,
    2024 as year
FROM profiles p
CROSS JOIN (
    SELECT unnest(ARRAY['casual', 'earned', 'sick']) as leave_type
) lt
WHERE p.current_state IN ('active', 'on_probation', 'confirmed')
ON CONFLICT DO NOTHING;

RAISE NOTICE '✅ Created leave balances for all employees';

-- =====================================================
-- STEP 4: Create Attendance Records (Last 365 Days)
-- =====================================================
INSERT INTO attendance_records (profile_id, date, check_in, check_out, status, notes)
SELECT 
    p.id as profile_id,
    d.date,
    CASE 
        WHEN extract(dow from d.date) IN (0, 6) THEN NULL -- Weekend
        WHEN random() < 0.95 THEN -- 95% attendance
            d.date + (time '09:00:00' + (random() * interval '2 hours'))
        ELSE NULL
    END as check_in,
    CASE 
        WHEN extract(dow from d.date) IN (0, 6) THEN NULL
        WHEN random() < 0.95 THEN
            d.date + (time '18:00:00' + (random() * interval '2 hours'))
        ELSE NULL
    END as check_out,
    CASE 
        WHEN extract(dow from d.date) IN (0, 6) THEN 'leave'::TEXT
        WHEN random() < 0.95 THEN 
            CASE 
                WHEN random() < 0.85 THEN 'present'::TEXT
                WHEN random() < 0.95 THEN 'late'::TEXT
                ELSE 'half_day'::TEXT
            END
        ELSE 'absent'::TEXT
    END as status,
    NULL as notes
FROM profiles p
CROSS JOIN generate_series(
    CURRENT_DATE - INTERVAL '365 days',
    CURRENT_DATE - INTERVAL '1 day',
    INTERVAL '1 day'
) AS d(date)
WHERE p.date_of_joining <= d.date
    AND p.current_state IN ('active', 'on_probation', 'confirmed')
ON CONFLICT (profile_id, date) DO NOTHING;

RAISE NOTICE '✅ Created 365 days of attendance records';

-- =====================================================
-- STEP 5: Create Payroll Records (Last 12 Months)
-- =====================================================
INSERT INTO payroll_records (
    profile_id, pay_period, basic_salary, hra, transport_allowance, 
    other_allowances, pf_deduction, tax_deduction, other_deductions, net_pay, status
)
SELECT 
    p.id as profile_id,
    to_char(pay_month, 'YYYY-MM') as pay_period,
    (ss.structure_json->>'basic')::NUMERIC as basic_salary,
    (ss.structure_json->>'hra')::NUMERIC as hra,
    (ss.structure_json->>'transport')::NUMERIC as transport_allowance,
    (ss.structure_json->>'special_allowance')::NUMERIC as other_allowances,
    ROUND(((ss.structure_json->>'basic')::NUMERIC + (ss.structure_json->>'hra')::NUMERIC) * 0.12, 2) as pf_deduction,
    ROUND(ss.monthly_gross * 0.10, 2) as tax_deduction,
    ROUND(ss.monthly_gross * 0.02, 2) as other_deductions,
    ROUND(ss.monthly_gross - 
        ((ss.structure_json->>'basic')::NUMERIC + (ss.structure_json->>'hra')::NUMERIC) * 0.12 -
        ss.monthly_gross * 0.10 -
        ss.monthly_gross * 0.02, 2) as net_pay,
    CASE 
        WHEN pay_month < date_trunc('month', CURRENT_DATE) THEN 'processed'
        ELSE 'draft'
    END as status
FROM profiles p
JOIN salary_structures ss ON ss.profile_id = p.id AND ss.is_current = TRUE
CROSS JOIN generate_series(
    date_trunc('month', CURRENT_DATE) - INTERVAL '12 months',
    date_trunc('month', CURRENT_DATE) - INTERVAL '1 month',
    INTERVAL '1 month'
) AS pay_month
WHERE p.date_of_joining <= pay_month
    AND p.current_state IN ('active', 'on_probation', 'confirmed')
ON CONFLICT (profile_id, pay_period) DO NOTHING;

RAISE NOTICE '✅ Created 12 months of payroll records';

-- =====================================================
-- STEP 6: Create Some Leave Requests
-- =====================================================
INSERT INTO leave_requests (
    profile_id, leave_type, from_date, to_date, days, reason, status
)
SELECT 
    p.id as profile_id,
    (ARRAY['casual', 'earned', 'sick'])[floor(random() * 3 + 1)] as leave_type,
    leave_date,
    leave_date + (floor(random() * 3 + 1) || ' days')::INTERVAL,
    floor(random() * 3 + 1) as days,
    'Personal work' as reason,
    (ARRAY['pending', 'approved', 'rejected'])[floor(random() * 3 + 1)]::TEXT as status
FROM profiles p
CROSS JOIN LATERAL (
    SELECT CURRENT_DATE - (floor(random() * 180)::INTEGER || ' days')::INTERVAL as leave_date
) dates
WHERE random() < 0.3 -- 30% of employees have leave requests
    AND p.current_state IN ('active', 'on_probation', 'confirmed')
LIMIT 50;

RAISE NOTICE '✅ Created leave requests';

\echo 'HR Module Seeding Complete: 50 employees with full org structure'
