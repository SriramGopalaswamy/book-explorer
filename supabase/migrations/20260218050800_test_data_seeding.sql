-- ===================================================================
-- TEST DATA SEEDING FOR HR LIFECYCLE ENGINE
-- ===================================================================
-- Creates comprehensive test data for testing all phases
-- ===================================================================

-- 1. Create test employees with different states
DO $$
DECLARE
  v_user_id1 UUID := gen_random_uuid();
  v_user_id2 UUID := gen_random_uuid();
  v_user_id3 UUID := gen_random_uuid();
  v_user_id4 UUID := gen_random_uuid();
  v_user_id5 UUID := gen_random_uuid();
  v_profile_id1 UUID;
  v_profile_id2 UUID;
  v_profile_id3 UUID;
  v_profile_id4 UUID;
  v_profile_id5 UUID;
  v_salary_structure_id1 UUID;
  v_salary_structure_id2 UUID;
BEGIN
  -- Insert test employees
  INSERT INTO public.profiles (
    user_id, full_name, email, department, job_title, employee_id,
    date_of_birth, date_of_joining, current_state, working_week_policy
  ) VALUES
    (v_user_id1, 'John Doe', 'john.doe@example.com', 'Engineering', 'Senior Engineer', 'EMP001',
     '1990-05-15', '2020-01-15', 'active', '5_days'),
    (v_user_id2, 'Jane Smith', 'jane.smith@example.com', 'HR', 'HR Manager', 'EMP002',
     '1988-08-20', '2019-03-10', 'confirmed', '5_days'),
    (v_user_id3, 'Bob Wilson', 'bob.wilson@example.com', 'Finance', 'Accountant', 'EMP003',
     '1992-12-05', '2021-06-01', 'on_probation', '6_days'),
    (v_user_id4, 'Alice Brown', 'alice.brown@example.com', 'Engineering', 'Junior Engineer', 'EMP004',
     '1995-03-25', '2023-01-10', 'resigned', '5_days'),
    (v_user_id5, 'Charlie Davis', 'charlie.davis@example.com', 'Sales', 'Sales Executive', 'EMP005',
     '1991-07-30', '2018-09-15', 'exited', '5_days')
  RETURNING id INTO v_profile_id1, v_profile_id2, v_profile_id3, v_profile_id4, v_profile_id5;

  -- Set manager relationships
  UPDATE public.profiles SET manager_id = v_profile_id2 WHERE id IN (v_profile_id1, v_profile_id4);
  UPDATE public.profiles SET manager_id = v_profile_id1 WHERE id = v_profile_id3;

  -- Create salary structures
  INSERT INTO public.salary_structures (
    profile_id, effective_from, annual_ctc, monthly_gross, structure_json, is_current, status
  ) VALUES
    (v_profile_id1, '2023-01-01', 1200000, 100000, 
     jsonb_build_object('basic', 40000, 'hra', 30000, 'transport', 5000, 'special_allowance', 25000),
     TRUE, 'active'),
    (v_profile_id2, '2023-01-01', 1500000, 125000,
     jsonb_build_object('basic', 50000, 'hra', 37500, 'transport', 5000, 'special_allowance', 32500),
     TRUE, 'active'),
    (v_profile_id3, '2023-07-01', 600000, 50000,
     jsonb_build_object('basic', 20000, 'hra', 15000, 'transport', 3000, 'special_allowance', 12000),
     TRUE, 'active'),
    (v_profile_id4, '2023-01-01', 800000, 66667,
     jsonb_build_object('basic', 26667, 'hra', 20000, 'transport', 3000, 'special_allowance', 17000),
     TRUE, 'active')
  RETURNING id INTO v_salary_structure_id1, v_salary_structure_id2;

  -- Create salary components
  INSERT INTO public.salary_components (structure_id, component_type, component_name, amount, is_taxable, is_pf_eligible)
  SELECT 
    ss.id,
    unnest(ARRAY['basic', 'hra', 'transport', 'special_allowance']),
    unnest(ARRAY['Basic Salary', 'House Rent Allowance', 'Transport Allowance', 'Special Allowance']),
    unnest(ARRAY[
      (ss.structure_json->>'basic')::NUMERIC,
      (ss.structure_json->>'hra')::NUMERIC,
      (ss.structure_json->>'transport')::NUMERIC,
      (ss.structure_json->>'special_allowance')::NUMERIC
    ]),
    unnest(ARRAY[TRUE, TRUE, FALSE, TRUE]),
    unnest(ARRAY[TRUE, TRUE, FALSE, FALSE])
  FROM public.salary_structures ss
  WHERE ss.profile_id IN (v_profile_id1, v_profile_id2, v_profile_id3, v_profile_id4);

  -- Create employment periods
  INSERT INTO public.employment_periods (
    profile_id, period_number, start_date, end_date, position, department, employment_type, is_current
  ) VALUES
    (v_profile_id1, 1, '2020-01-15', NULL, 'Senior Engineer', 'Engineering', 'full_time', TRUE),
    (v_profile_id2, 1, '2019-03-10', NULL, 'HR Manager', 'HR', 'full_time', TRUE),
    (v_profile_id3, 1, '2021-06-01', NULL, 'Accountant', 'Finance', 'full_time', TRUE),
    (v_profile_id4, 1, '2023-01-10', '2024-02-15', 'Junior Engineer', 'Engineering', 'full_time', FALSE),
    (v_profile_id5, 1, '2018-09-15', '2023-12-31', 'Sales Executive', 'Sales', 'full_time', FALSE);

  -- Create manager history
  INSERT INTO public.employee_manager_history (
    profile_id, manager_id, effective_from, source_of_truth, is_current
  ) VALUES
    (v_profile_id1, v_profile_id2, '2020-01-15', 'hrms', TRUE),
    (v_profile_id3, v_profile_id1, '2021-06-01', 'hrms', TRUE),
    (v_profile_id4, v_profile_id2, '2023-01-10', 'hrms', TRUE);

  -- Create leave balances
  INSERT INTO public.leave_balances (
    profile_id, leave_type, total_days, used_days, year
  ) VALUES
    (v_profile_id1, 'casual', 12, 5, 2024),
    (v_profile_id1, 'earned', 15, 3, 2024),
    (v_profile_id1, 'sick', 10, 2, 2024),
    (v_profile_id2, 'casual', 12, 8, 2024),
    (v_profile_id2, 'earned', 18, 5, 2024),
    (v_profile_id3, 'casual', 10, 1, 2024),
    (v_profile_id3, 'earned', 12, 0, 2024),
    (v_profile_id4, 'casual', 12, 10, 2024),
    (v_profile_id4, 'earned', 15, 12, 2024);

  -- Create payroll records for active employees
  INSERT INTO public.payroll_records (
    profile_id, pay_period, basic_salary, hra, transport_allowance, other_allowances,
    pf_deduction, tax_deduction, other_deductions, net_pay, status
  ) VALUES
    (v_profile_id1, '2024-01', 40000, 30000, 5000, 25000, 4800, 8500, 500, 86200, 'processed'),
    (v_profile_id1, '2024-02', 40000, 30000, 5000, 25000, 4800, 8500, 500, 86200, 'draft'),
    (v_profile_id2, '2024-01', 50000, 37500, 5000, 32500, 6000, 12000, 500, 106500, 'processed'),
    (v_profile_id2, '2024-02', 50000, 37500, 5000, 32500, 6000, 12000, 500, 106500, 'draft'),
    (v_profile_id3, '2024-01', 20000, 15000, 3000, 12000, 2400, 2500, 200, 44900, 'processed'),
    (v_profile_id3, '2024-02', 20000, 15000, 3000, 12000, 2400, 2500, 200, 44900, 'draft');

  -- Create employee assets
  INSERT INTO public.employee_assets (
    profile_id, asset_type, asset_name, serial_number, purchase_value, current_value,
    assigned_date, status, recovery_amount
  ) VALUES
    (v_profile_id1, 'laptop', 'Dell Latitude 5520', 'DL5520-12345', 75000, 50000, '2020-01-20', 'in_use', 0),
    (v_profile_id1, 'mobile', 'iPhone 13', 'IPH13-67890', 60000, 30000, '2022-03-15', 'in_use', 0),
    (v_profile_id2, 'laptop', 'HP EliteBook 840', 'HP840-54321', 80000, 55000, '2019-03-15', 'in_use', 0),
    (v_profile_id3, 'laptop', 'Lenovo ThinkPad T14', 'LEN-T14-99999', 70000, 60000, '2021-06-05', 'in_use', 0),
    (v_profile_id4, 'laptop', 'Dell XPS 13', 'XPS13-11111', 85000, 70000, '2023-01-15', 'assigned', 70000); -- Not returned

  -- Create exit workflow for resigned employee
  INSERT INTO public.exit_workflow (
    profile_id, resignation_date, last_working_day, notice_period_days, actual_notice_days,
    exit_reason, exit_type, current_stage, initiated_at
  ) VALUES
    (v_profile_id4, '2024-01-15', '2024-02-15', 30, 31, 'Better opportunity', 'resignation', 'exit_initiated', '2024-01-15');

  -- Create state transition history
  INSERT INTO public.state_transition_history (
    profile_id, from_state, to_state, transitioned_at, is_valid
  ) VALUES
    (v_profile_id1, 'draft', 'active', '2020-01-15', TRUE),
    (v_profile_id2, 'draft', 'active', '2019-03-10', TRUE),
    (v_profile_id2, 'active', 'confirmed', '2020-03-10', TRUE),
    (v_profile_id3, 'draft', 'on_probation', '2021-06-01', TRUE),
    (v_profile_id4, 'draft', 'active', '2023-01-10', TRUE),
    (v_profile_id4, 'active', 'resigned', '2024-01-15', TRUE);

  RAISE NOTICE 'Test data seeded successfully!';
  RAISE NOTICE 'Profile IDs: %, %, %, %, %', v_profile_id1, v_profile_id2, v_profile_id3, v_profile_id4, v_profile_id5;
END $$;
