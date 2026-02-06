-- Create a helper function to check if user is admin, HR, or manager
CREATE OR REPLACE FUNCTION public.is_admin_hr_or_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'hr', 'manager')
  )
$$;

-- Update leave_requests policies to include managers
DROP POLICY IF EXISTS "Admins and HR can update leave requests" ON public.leave_requests;
CREATE POLICY "Admins HR and Managers can update leave requests"
ON public.leave_requests
FOR UPDATE
USING (is_admin_hr_or_manager(auth.uid()));

DROP POLICY IF EXISTS "Admins and HR can view all leave requests" ON public.leave_requests;
CREATE POLICY "Admins HR and Managers can view all leave requests"
ON public.leave_requests
FOR SELECT
USING (is_admin_hr_or_manager(auth.uid()));

-- Update profiles policies to include managers for viewing
DROP POLICY IF EXISTS "Admins and HR can view all profiles" ON public.profiles;
CREATE POLICY "Admins HR and Managers can view all profiles"
ON public.profiles
FOR SELECT
USING (is_admin_hr_or_manager(auth.uid()));

-- Update attendance_records policies to include managers for viewing
DROP POLICY IF EXISTS "Admins and HR can view all attendance" ON public.attendance_records;
CREATE POLICY "Admins HR and Managers can view all attendance"
ON public.attendance_records
FOR SELECT
USING (is_admin_hr_or_manager(auth.uid()));

-- Update goals policies to include managers for viewing
DROP POLICY IF EXISTS "Admins and HR can view all goals" ON public.goals;
CREATE POLICY "Admins HR and Managers can view all goals"
ON public.goals
FOR SELECT
USING (is_admin_hr_or_manager(auth.uid()));

-- Update leave_balances policies to include managers for viewing
DROP POLICY IF EXISTS "Admins and HR can view all leave balances" ON public.leave_balances;
CREATE POLICY "Admins HR and Managers can view all leave balances"
ON public.leave_balances
FOR SELECT
USING (is_admin_hr_or_manager(auth.uid()));