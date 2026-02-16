
-- Create a safe profiles view that excludes sensitive contact info
CREATE VIEW public.profiles_safe
WITH (security_invoker=on) AS
  SELECT id, user_id, full_name, avatar_url, job_title, department, status, join_date, created_at, updated_at
  FROM public.profiles;

-- Drop the existing manager-inclusive SELECT policy
DROP POLICY "Admins HR and Managers can view all profiles" ON public.profiles;

-- Recreate: only Admins and HR can view all profile fields (including email/phone)
CREATE POLICY "Admins and HR can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_hr(auth.uid()));
