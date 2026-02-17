-- =====================================================
-- SUPABASE COMPREHENSIVE SEED DATA
-- =====================================================
-- This file seeds data for:
-- - HR module (profiles/employees, user_roles)
-- - Goals module (goals)
-- - Memos module (memos)
-- - Attendance module (attendance_records, leave_balances, leave_requests)
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
  -- SEED USER ROLES (Assign roles to current user)
  -- =====================================================
  INSERT INTO public.user_roles (user_id, role)
  VALUES 
    (current_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RAISE NOTICE 'Seeded user roles';
  
  -- =====================================================
  -- SEED EMPLOYEES/PROFILES (20 employee profiles)
  -- =====================================================
  -- Note: These are sample profiles not tied to auth.users
  -- In production, profiles are created automatically via trigger when users sign up
  -- For demo purposes, we create sample employee data with fake user_ids
  
  INSERT INTO public.profiles (user_id, full_name, department, job_title, email, status, join_date, phone, created_at, updated_at)
  SELECT
    gen_random_uuid(), -- Generate random UUID for demo users
    CASE n
      WHEN 1 THEN 'John Smith'
      WHEN 2 THEN 'Sarah Johnson'
      WHEN 3 THEN 'Michael Chen'
      WHEN 4 THEN 'Emily Davis'
      WHEN 5 THEN 'David Wilson'
      WHEN 6 THEN 'Jessica Martinez'
      WHEN 7 THEN 'James Anderson'
      WHEN 8 THEN 'Maria Garcia'
      WHEN 9 THEN 'Robert Taylor'
      WHEN 10 THEN 'Jennifer Brown'
      WHEN 11 THEN 'William Lee'
      WHEN 12 THEN 'Lisa Rodriguez'
      WHEN 13 THEN 'Christopher White'
      WHEN 14 THEN 'Patricia Harris'
      WHEN 15 THEN 'Daniel Clark'
      WHEN 16 THEN 'Nancy Lewis'
      WHEN 17 THEN 'Matthew Robinson'
      WHEN 18 THEN 'Karen Walker'
      WHEN 19 THEN 'Thomas Hall'
      ELSE 'Sandra Allen'
    END,
    CASE FLOOR(RANDOM() * 6)
      WHEN 0 THEN 'Engineering'
      WHEN 1 THEN 'Human Resources'
      WHEN 2 THEN 'Sales'
      WHEN 3 THEN 'Marketing'
      WHEN 4 THEN 'Finance'
      ELSE 'Operations'
    END,
    CASE FLOOR(RANDOM() * 10)
      WHEN 0 THEN 'Software Engineer'
      WHEN 1 THEN 'Senior Developer'
      WHEN 2 THEN 'HR Manager'
      WHEN 3 THEN 'Sales Representative'
      WHEN 4 THEN 'Marketing Specialist'
      WHEN 5 THEN 'Financial Analyst'
      WHEN 6 THEN 'Operations Manager'
      WHEN 7 THEN 'Product Manager'
      WHEN 8 THEN 'Business Analyst'
      ELSE 'Project Coordinator'
    END,
    LOWER(REPLACE(
      CASE n
        WHEN 1 THEN 'john.smith'
        WHEN 2 THEN 'sarah.johnson'
        WHEN 3 THEN 'michael.chen'
        WHEN 4 THEN 'emily.davis'
        WHEN 5 THEN 'david.wilson'
        WHEN 6 THEN 'jessica.martinez'
        WHEN 7 THEN 'james.anderson'
        WHEN 8 THEN 'maria.garcia'
        WHEN 9 THEN 'robert.taylor'
        WHEN 10 THEN 'jennifer.brown'
        WHEN 11 THEN 'william.lee'
        WHEN 12 THEN 'lisa.rodriguez'
        WHEN 13 THEN 'christopher.white'
        WHEN 14 THEN 'patricia.harris'
        WHEN 15 THEN 'daniel.clark'
        WHEN 16 THEN 'nancy.lewis'
        WHEN 17 THEN 'matthew.robinson'
        WHEN 18 THEN 'karen.walker'
        WHEN 19 THEN 'thomas.hall'
        ELSE 'sandra.allen'
      END, ' ', '.')) || '@company.com',
    CASE FLOOR(RANDOM() * 10)
      WHEN 0 THEN 'on_leave'
      WHEN 1 THEN 'inactive'
      ELSE 'active'
    END,
    CURRENT_DATE - (FLOOR(RANDOM() * 1825) || ' days')::INTERVAL, -- Random join date within last 5 years
    '+1-555-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0'),
    CURRENT_DATE - (FLOOR(RANDOM() * 1825) || ' days')::INTERVAL,
    NOW()
  FROM generate_series(1, 20) AS n
  ON CONFLICT (user_id) DO NOTHING;
  
  RAISE NOTICE 'Seeded employee profiles';
  
  -- =====================================================
  -- SEED GOALS (30 goals across employees)
  -- =====================================================
  INSERT INTO public.goals (user_id, title, description, progress, status, category, owner, due_date, created_at, updated_at)
  SELECT
    current_user_id,
    CASE n
      WHEN 1 THEN 'Complete Q1 Product Launch'
      WHEN 2 THEN 'Implement New CRM System'
      WHEN 3 THEN 'Increase Sales by 25%'
      WHEN 4 THEN 'Reduce Customer Churn Rate'
      WHEN 5 THEN 'Launch Mobile App Beta'
      WHEN 6 THEN 'Improve Code Coverage to 90%'
      WHEN 7 THEN 'Hire 5 Senior Engineers'
      WHEN 8 THEN 'Complete Security Audit'
      WHEN 9 THEN 'Migrate to Cloud Infrastructure'
      WHEN 10 THEN 'Achieve SOC 2 Compliance'
      WHEN 11 THEN 'Develop Customer Portal'
      WHEN 12 THEN 'Optimize Database Performance'
      WHEN 13 THEN 'Launch Marketing Campaign'
      WHEN 14 THEN 'Build Analytics Dashboard'
      WHEN 15 THEN 'Improve User Onboarding'
      WHEN 16 THEN 'Implement CI/CD Pipeline'
      WHEN 17 THEN 'Conduct Team Training'
      WHEN 18 THEN 'Update Documentation'
      WHEN 19 THEN 'Improve API Performance'
      WHEN 20 THEN 'Implement A/B Testing'
      WHEN 21 THEN 'Reduce Technical Debt'
      WHEN 22 THEN 'Launch Partner Program'
      WHEN 23 THEN 'Improve Search Functionality'
      WHEN 24 THEN 'Build Mobile Responsiveness'
      WHEN 25 THEN 'Implement Internationalization'
      WHEN 26 THEN 'Enhance Security Features'
      WHEN 27 THEN 'Optimize Loading Speed'
      WHEN 28 THEN 'Integrate Third-Party APIs'
      WHEN 29 THEN 'Develop Reporting System'
      ELSE 'Plan Annual Company Retreat'
    END,
    CASE FLOOR(RANDOM() * 5)
      WHEN 0 THEN 'Strategic initiative to drive business growth and improve market position.'
      WHEN 1 THEN 'Technical project focused on improving system architecture and performance.'
      WHEN 2 THEN 'Customer-facing improvement to enhance user experience and satisfaction.'
      WHEN 3 THEN 'Internal process optimization to increase efficiency and reduce costs.'
      ELSE 'Team development initiative to build capabilities and improve collaboration.'
    END,
    FLOOR(RANDOM() * 101), -- Random progress 0-100
    CASE FLOOR(RANDOM() * 4)
      WHEN 0 THEN 'on_track'
      WHEN 1 THEN 'at_risk'
      WHEN 2 THEN 'delayed'
      ELSE 'completed'
    END,
    CASE FLOOR(RANDOM() * 8)
      WHEN 0 THEN 'Engineering'
      WHEN 1 THEN 'Product'
      WHEN 2 THEN 'Sales'
      WHEN 3 THEN 'Marketing'
      WHEN 4 THEN 'Operations'
      WHEN 5 THEN 'Finance'
      WHEN 6 THEN 'HR'
      ELSE 'general'
    END,
    CASE FLOOR(RANDOM() * 10)
      WHEN 0 THEN 'John Smith'
      WHEN 1 THEN 'Sarah Johnson'
      WHEN 2 THEN 'Michael Chen'
      WHEN 3 THEN 'Emily Davis'
      WHEN 4 THEN 'David Wilson'
      WHEN 5 THEN 'Jessica Martinez'
      WHEN 6 THEN 'James Anderson'
      WHEN 7 THEN 'Maria Garcia'
      WHEN 8 THEN 'Robert Taylor'
      ELSE 'Jennifer Brown'
    END,
    CURRENT_DATE + (FLOOR(RANDOM() * 180) || ' days')::INTERVAL, -- Due date within next 6 months
    CURRENT_DATE - (FLOOR(RANDOM() * 90) || ' days')::INTERVAL,
    NOW()
  FROM generate_series(1, 30) AS n;
  
  RAISE NOTICE 'Seeded goals';
  
  -- =====================================================
  -- SEED MEMOS (25 company memos)
  -- =====================================================
  INSERT INTO public.memos (user_id, author_name, title, content, excerpt, department, priority, status, views, recipients, published_at, created_at, updated_at)
  SELECT
    current_user_id,
    CASE FLOOR(RANDOM() * 5)
      WHEN 0 THEN 'John Smith'
      WHEN 1 THEN 'Sarah Johnson'
      WHEN 2 THEN 'Michael Chen'
      WHEN 3 THEN 'Emily Davis'
      ELSE 'David Wilson'
    END,
    CASE n
      WHEN 1 THEN 'Q1 Company-Wide Goals and Objectives'
      WHEN 2 THEN 'New Security Policy Implementation'
      WHEN 3 THEN 'Office Renovation Schedule'
      WHEN 4 THEN 'Updated Employee Benefits Package'
      WHEN 5 THEN 'Remote Work Guidelines - Updated'
      WHEN 6 THEN 'Annual Performance Review Process'
      WHEN 7 THEN 'New Product Launch Timeline'
      WHEN 8 THEN 'IT System Maintenance Window'
      WHEN 9 THEN 'Company Holiday Schedule 2026'
      WHEN 10 THEN 'Expense Reimbursement Policy Update'
      WHEN 11 THEN 'Team Building Event Announcement'
      WHEN 12 THEN 'Customer Satisfaction Initiative'
      WHEN 13 THEN 'Code of Conduct Reminder'
      WHEN 14 THEN 'Quarterly All-Hands Meeting'
      WHEN 15 THEN 'New Hiring Process Guidelines'
      WHEN 16 THEN 'Office Safety Protocols'
      WHEN 17 THEN 'Professional Development Opportunities'
      WHEN 18 THEN 'Sustainability Initiative Launch'
      WHEN 19 THEN 'Data Privacy Compliance Update'
      WHEN 20 THEN 'Equipment Upgrade Program'
      WHEN 21 THEN 'Employee Recognition Program'
      WHEN 22 THEN 'Department Reorganization Notice'
      WHEN 23 THEN 'Vendor Partnership Announcement'
      WHEN 24 THEN 'Budget Planning for Next Fiscal Year'
      ELSE 'Year-End Office Closure'
    END,
    CASE FLOOR(RANDOM() * 3)
      WHEN 0 THEN 'This memo outlines the strategic initiatives and action items for the upcoming quarter. All department heads are requested to review and align their team objectives accordingly. Please ensure your teams are briefed on these priorities by the end of this week. Detailed breakdown of goals and KPIs is attached in the appendix.'
      WHEN 1 THEN 'We are implementing new policies and procedures to enhance our operational efficiency and compliance. This change will take effect from next month. All affected employees will receive training sessions scheduled over the next two weeks. Please mark your calendars and ensure attendance. Questions can be directed to your department managers.'
      ELSE 'This is an important update that affects multiple departments across the organization. Your cooperation and timely action is appreciated. We will be monitoring progress closely and providing regular updates. A detailed FAQ document is available on the company intranet for your reference. Thank you for your continued dedication.'
    END,
    CASE FLOOR(RANDOM() * 3)
      WHEN 0 THEN 'Strategic initiatives and action items for the upcoming quarter...'
      WHEN 1 THEN 'New policies and procedures to enhance operational efficiency...'
      ELSE 'Important update affecting multiple departments across the organization...'
    END,
    CASE FLOOR(RANDOM() * 7)
      WHEN 0 THEN 'All'
      WHEN 1 THEN 'Engineering'
      WHEN 2 THEN 'Human Resources'
      WHEN 3 THEN 'Sales'
      WHEN 4 THEN 'Marketing'
      WHEN 5 THEN 'Finance'
      ELSE 'Operations'
    END,
    CASE FLOOR(RANDOM() * 3)
      WHEN 0 THEN 'low'
      WHEN 1 THEN 'medium'
      ELSE 'high'
    END,
    CASE FLOOR(RANDOM() * 5)
      WHEN 0 THEN 'draft'
      WHEN 1 THEN 'pending'
      ELSE 'published'
    END,
    FLOOR(RANDOM() * 250), -- Random view count
    ARRAY['All Employees', 'Management Team', 'Department Heads'], -- Recipients array
    CASE 
      WHEN FLOOR(RANDOM() * 5) > 1 THEN CURRENT_DATE - (FLOOR(RANDOM() * 60) || ' days')::INTERVAL
      ELSE NULL
    END,
    CURRENT_DATE - (FLOOR(RANDOM() * 90) || ' days')::INTERVAL,
    NOW()
  FROM generate_series(1, 25) AS n;
  
  RAISE NOTICE 'Seeded memos';
  
  -- =====================================================
  -- SEED ATTENDANCE RECORDS (30 days for 5 employees)
  -- =====================================================
  WITH sample_profiles AS (
    SELECT id, user_id FROM public.profiles LIMIT 5
  )
  INSERT INTO public.attendance_records (user_id, profile_id, date, check_in, check_out, status, notes, created_at, updated_at)
  SELECT
    p.user_id,
    p.id,
    CURRENT_DATE - (d || ' days')::INTERVAL,
    (CURRENT_DATE - (d || ' days')::INTERVAL + TIME '09:00:00' + (FLOOR(RANDOM() * 60) || ' minutes')::INTERVAL)::TIMESTAMP WITH TIME ZONE,
    (CURRENT_DATE - (d || ' days')::INTERVAL + TIME '17:30:00' + (FLOOR(RANDOM() * 90) || ' minutes')::INTERVAL)::TIMESTAMP WITH TIME ZONE,
    CASE FLOOR(RANDOM() * 20)
      WHEN 0 THEN 'absent'
      WHEN 1 THEN 'late'
      WHEN 2 THEN 'leave'
      WHEN 3 THEN 'half_day'
      ELSE 'present'
    END,
    CASE FLOOR(RANDOM() * 10)
      WHEN 0 THEN 'Doctor appointment'
      WHEN 1 THEN 'Traffic delay'
      WHEN 2 THEN 'Client meeting'
      WHEN 3 THEN 'Work from home'
      ELSE NULL
    END,
    NOW(),
    NOW()
  FROM sample_profiles p
  CROSS JOIN generate_series(1, 30) AS d
  ON CONFLICT (profile_id, date) DO NOTHING;
  
  RAISE NOTICE 'Seeded attendance records';
  
  -- =====================================================
  -- SEED LEAVE BALANCES (For 10 employees)
  -- =====================================================
  WITH sample_profiles AS (
    SELECT id, user_id FROM public.profiles LIMIT 10
  )
  INSERT INTO public.leave_balances (user_id, profile_id, leave_type, total_days, used_days, year, created_at, updated_at)
  SELECT
    p.user_id,
    p.id,
    leave_type,
    CASE leave_type
      WHEN 'casual' THEN 12
      WHEN 'sick' THEN 10
      WHEN 'earned' THEN 15
      WHEN 'maternity' THEN 90
      WHEN 'paternity' THEN 15
      ELSE 12 -- wfh
    END,
    FLOOR(RANDOM() * 5), -- Used days
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
    NOW(),
    NOW()
  FROM sample_profiles p
  CROSS JOIN UNNEST(ARRAY['casual', 'sick', 'earned', 'wfh']::TEXT[]) AS leave_type
  ON CONFLICT (profile_id, leave_type, year) DO NOTHING;
  
  RAISE NOTICE 'Seeded leave balances';
  
  -- =====================================================
  -- SEED LEAVE REQUESTS (15 requests)
  -- =====================================================
  WITH sample_profiles AS (
    SELECT id, user_id FROM public.profiles LIMIT 10
  )
  INSERT INTO public.leave_requests (user_id, profile_id, leave_type, from_date, to_date, days, reason, status, reviewed_by, reviewed_at, created_at, updated_at)
  SELECT
    p.user_id,
    p.id,
    CASE FLOOR(RANDOM() * 4)
      WHEN 0 THEN 'casual'
      WHEN 1 THEN 'sick'
      WHEN 2 THEN 'earned'
      ELSE 'wfh'
    END,
    CURRENT_DATE + (FLOOR(RANDOM() * 60) || ' days')::INTERVAL,
    CURRENT_DATE + ((FLOOR(RANDOM() * 60) + FLOOR(RANDOM() * 5) + 1) || ' days')::INTERVAL,
    FLOOR(RANDOM() * 5) + 1,
    CASE FLOOR(RANDOM() * 8)
      WHEN 0 THEN 'Family vacation'
      WHEN 1 THEN 'Medical appointment'
      WHEN 2 THEN 'Personal emergency'
      WHEN 3 THEN 'Wedding ceremony'
      WHEN 4 THEN 'Home renovation'
      WHEN 5 THEN 'Child care'
      WHEN 6 THEN 'Medical treatment'
      ELSE 'Personal reasons'
    END,
    CASE FLOOR(RANDOM() * 3)
      WHEN 0 THEN 'pending'
      WHEN 1 THEN 'approved'
      ELSE 'rejected'
    END,
    CASE WHEN RANDOM() > 0.3 THEN current_user_id ELSE NULL END,
    CASE WHEN RANDOM() > 0.3 THEN NOW() ELSE NULL END,
    NOW(),
    NOW()
  FROM sample_profiles p
  CROSS JOIN generate_series(1, 2) AS n -- 2 requests per employee
  LIMIT 15;
  
  RAISE NOTICE 'Seeded leave requests';
  
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
  RAISE NOTICE '  User Roles: 1 (admin role assigned to current user)';
  RAISE NOTICE '  Employee Profiles: 20';
  RAISE NOTICE '  Goals: 30';
  RAISE NOTICE '  Memos: 25';
  RAISE NOTICE '  Attendance Records: ~150 (30 days × 5 employees)';
  RAISE NOTICE '  Leave Balances: ~40 (4 leave types × 10 employees)';
  RAISE NOTICE '  Leave Requests: 15';
  RAISE NOTICE '  Invoices: 50 (with multiple items each)';
  RAISE NOTICE '  Bank Accounts: 5';
  RAISE NOTICE '  Bank Transactions: ~120';
  RAISE NOTICE '  Scheduled Payments: 25';
  RAISE NOTICE '  Chart of Accounts: 27 entries';
  
END $$;
