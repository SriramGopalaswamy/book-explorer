-- =====================================================
-- DATA RECOVERY DIAGNOSTIC SCRIPT
-- =====================================================
-- This script helps diagnose data visibility issues
-- related to Row Level Security (RLS) policies
--
-- Run this script to check:
-- 1. Data existence in tables
-- 2. RLS policy status
-- 3. User roles and permissions
-- 4. Data visibility for current user
-- =====================================================

DO $$
DECLARE
  current_user_id UUID;
  admin_count INTEGER;
  hr_count INTEGER;
BEGIN
  -- Get current user ID
  SELECT auth.uid() INTO current_user_id;
  
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'DATA RECOVERY DIAGNOSTIC REPORT';
  RAISE NOTICE '=================================================';
  RAISE NOTICE '';
  
  -- Show current user info
  RAISE NOTICE '1. CURRENT USER INFORMATION';
  RAISE NOTICE '-------------------------------------------------';
  IF current_user_id IS NULL THEN
    RAISE NOTICE '⚠️  WARNING: No authenticated user (auth.uid() is NULL)';
    RAISE NOTICE '   You may be running this as a service role.';
  ELSE
    RAISE NOTICE '✓ Current User ID: %', current_user_id;
  END IF;
  RAISE NOTICE '';
  
  -- Check user roles
  RAISE NOTICE '2. USER ROLES';
  RAISE NOTICE '-------------------------------------------------';
  SELECT COUNT(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
  SELECT COUNT(*) INTO hr_count FROM public.user_roles WHERE role = 'hr';
  
  RAISE NOTICE 'Total admin roles: %', admin_count;
  RAISE NOTICE 'Total HR roles: %', hr_count;
  
  IF current_user_id IS NOT NULL THEN
    RAISE NOTICE 'Roles for current user:';
    FOR r IN SELECT role FROM public.user_roles WHERE user_id = current_user_id
    LOOP
      RAISE NOTICE '  - %', r.role;
    END LOOP;
  END IF;
  RAISE NOTICE '';
  
  -- Check table data counts
  RAISE NOTICE '3. TABLE DATA COUNTS';
  RAISE NOTICE '-------------------------------------------------';
  RAISE NOTICE 'User Roles: %', (SELECT COUNT(*) FROM public.user_roles);
  RAISE NOTICE 'Profiles (Employees): %', (SELECT COUNT(*) FROM public.profiles);
  RAISE NOTICE 'Goals: %', (SELECT COUNT(*) FROM public.goals);
  RAISE NOTICE 'Memos: %', (SELECT COUNT(*) FROM public.memos);
  RAISE NOTICE 'Attendance Records: %', (SELECT COUNT(*) FROM public.attendance_records);
  RAISE NOTICE 'Leave Balances: %', (SELECT COUNT(*) FROM public.leave_balances);
  RAISE NOTICE 'Leave Requests: %', (SELECT COUNT(*) FROM public.leave_requests);
  RAISE NOTICE 'Invoices: %', (SELECT COUNT(*) FROM public.invoices);
  RAISE NOTICE 'Bank Accounts: %', (SELECT COUNT(*) FROM public.bank_accounts);
  RAISE NOTICE 'Bank Transactions: %', (SELECT COUNT(*) FROM public.bank_transactions);
  RAISE NOTICE 'Scheduled Payments: %', (SELECT COUNT(*) FROM public.scheduled_payments);
  RAISE NOTICE 'Chart of Accounts: %', (SELECT COUNT(*) FROM public.chart_of_accounts);
  RAISE NOTICE '';
  
  -- Check RLS status
  RAISE NOTICE '4. ROW LEVEL SECURITY (RLS) STATUS';
  RAISE NOTICE '-------------------------------------------------';
  FOR t IN 
    SELECT schemaname, tablename, rowsecurity
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN ('profiles', 'user_roles', 'goals', 'memos', 'attendance_records', 
                      'leave_balances', 'leave_requests', 'invoices', 'bank_accounts', 
                      'bank_transactions', 'scheduled_payments', 'chart_of_accounts')
    ORDER BY tablename
  LOOP
    RAISE NOTICE '%: RLS %', 
      t.tablename, 
      CASE WHEN t.rowsecurity THEN 'ENABLED ✓' ELSE 'DISABLED ⚠️' END;
  END LOOP;
  RAISE NOTICE '';
  
  -- Check RLS policies
  RAISE NOTICE '5. RLS POLICIES COUNT PER TABLE';
  RAISE NOTICE '-------------------------------------------------';
  FOR t IN 
    SELECT schemaname, tablename, COUNT(*) as policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY schemaname, tablename
    ORDER BY tablename
  LOOP
    RAISE NOTICE '%: % policies', t.tablename, t.policy_count;
  END LOOP;
  RAISE NOTICE '';
  
  -- Check data visibility for current user
  IF current_user_id IS NOT NULL THEN
    RAISE NOTICE '6. DATA VISIBILITY FOR CURRENT USER';
    RAISE NOTICE '-------------------------------------------------';
    RAISE NOTICE 'Records visible through RLS policies:';
    RAISE NOTICE '  Profiles visible: %', (SELECT COUNT(*) FROM public.profiles WHERE user_id = current_user_id OR is_admin_or_hr(current_user_id));
    RAISE NOTICE '  Goals visible: %', (SELECT COUNT(*) FROM public.goals WHERE user_id = current_user_id OR is_admin_or_hr(current_user_id));
    RAISE NOTICE '  Memos (published): %', (SELECT COUNT(*) FROM public.memos WHERE status = 'published');
    RAISE NOTICE '  Memos (own): %', (SELECT COUNT(*) FROM public.memos WHERE user_id = current_user_id);
    RAISE NOTICE '  Invoices visible: %', (SELECT COUNT(*) FROM public.invoices WHERE user_id = current_user_id);
    RAISE NOTICE '';
  END IF;
  
  -- Check for potential issues
  RAISE NOTICE '7. POTENTIAL ISSUES';
  RAISE NOTICE '-------------------------------------------------';
  
  -- Issue 1: No admin roles
  IF admin_count = 0 THEN
    RAISE NOTICE '⚠️  WARNING: No admin roles assigned';
    RAISE NOTICE '   Solution: Run the seed script to assign admin role';
  ELSE
    RAISE NOTICE '✓ Admin roles exist';
  END IF;
  
  -- Issue 2: Empty tables
  IF (SELECT COUNT(*) FROM public.profiles) = 0 THEN
    RAISE NOTICE '⚠️  WARNING: Profiles table is empty';
    RAISE NOTICE '   Solution: Run supabase/seed.sql to populate data';
  ELSE
    RAISE NOTICE '✓ Profiles table has data';
  END IF;
  
  IF (SELECT COUNT(*) FROM public.goals) = 0 THEN
    RAISE NOTICE '⚠️  WARNING: Goals table is empty';
    RAISE NOTICE '   Solution: Run supabase/seed.sql to populate data';
  ELSE
    RAISE NOTICE '✓ Goals table has data';
  END IF;
  
  IF (SELECT COUNT(*) FROM public.memos) = 0 THEN
    RAISE NOTICE '⚠️  WARNING: Memos table is empty';
    RAISE NOTICE '   Solution: Run supabase/seed.sql to populate data';
  ELSE
    RAISE NOTICE '✓ Memos table has data';
  END IF;
  
  -- Issue 3: Current user has no data
  IF current_user_id IS NOT NULL THEN
    IF (SELECT COUNT(*) FROM public.goals WHERE user_id = current_user_id) = 0 THEN
      RAISE NOTICE '⚠️  WARNING: Current user has no goals';
      RAISE NOTICE '   Note: Seed data is assigned to the first user in auth.users';
    END IF;
    
    IF (SELECT COUNT(*) FROM public.invoices WHERE user_id = current_user_id) = 0 THEN
      RAISE NOTICE '⚠️  WARNING: Current user has no invoices';
      RAISE NOTICE '   Note: Seed data is assigned to the first user in auth.users';
    END IF;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'DIAGNOSTIC COMPLETE';
  RAISE NOTICE '=================================================';
  
END $$;

-- Show sample data from each table (limited to 5 rows)
SELECT '=== SAMPLE USER ROLES ===' as info;
SELECT user_id, role, created_at FROM public.user_roles LIMIT 5;

SELECT '=== SAMPLE PROFILES ===' as info;
SELECT id, full_name, department, job_title, status FROM public.profiles LIMIT 5;

SELECT '=== SAMPLE GOALS ===' as info;
SELECT id, title, category, status, progress, due_date FROM public.goals LIMIT 5;

SELECT '=== SAMPLE MEMOS ===' as info;
SELECT id, title, department, priority, status, author_name FROM public.memos LIMIT 5;

SELECT '=== SAMPLE INVOICES ===' as info;
SELECT id, invoice_number, client_name, amount, status, due_date FROM public.invoices LIMIT 5;
