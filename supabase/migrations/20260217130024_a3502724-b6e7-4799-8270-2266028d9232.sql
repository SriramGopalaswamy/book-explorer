
-- Fix profiles SELECT policies: drop restrictive, recreate as permissive
DROP POLICY IF EXISTS "Admins and HR can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Managers can view direct reports profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Admins and HR can view all profiles"
  ON public.profiles FOR SELECT
  USING (is_admin_or_hr(auth.uid()));

CREATE POLICY "Managers can view direct reports profiles"
  ON public.profiles FOR SELECT
  USING (manager_id IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()));

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Fix profiles INSERT policies
DROP POLICY IF EXISTS "Admins and HR can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Admins and HR can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (is_admin_or_hr(auth.uid()));

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Fix profiles UPDATE policies
DROP POLICY IF EXISTS "Admins and HR can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Admins and HR can update all profiles"
  ON public.profiles FOR UPDATE
  USING (is_admin_or_hr(auth.uid()));

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Fix profiles DELETE policy
DROP POLICY IF EXISTS "Admins and HR can delete profiles" ON public.profiles;

CREATE POLICY "Admins and HR can delete profiles"
  ON public.profiles FOR DELETE
  USING (is_admin_or_hr(auth.uid()));
