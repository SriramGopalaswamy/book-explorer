
-- Drop all existing RESTRICTIVE SELECT policies on profiles
DROP POLICY IF EXISTS "Admins and HR can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Managers can view direct reports profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Recreate as PERMISSIVE (default) so they OR together
CREATE POLICY "Admins and HR can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (is_admin_or_hr(auth.uid()));

CREATE POLICY "Managers can view direct reports profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (manager_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Also fix INSERT policies
DROP POLICY IF EXISTS "Admins and HR can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Admins and HR can insert profiles"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_hr(auth.uid()));

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Fix UPDATE policies
DROP POLICY IF EXISTS "Admins and HR can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Admins and HR can update all profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (is_admin_or_hr(auth.uid()));

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Fix DELETE policy
DROP POLICY IF EXISTS "Admins and HR can delete profiles" ON public.profiles;

CREATE POLICY "Admins and HR can delete profiles"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (is_admin_or_hr(auth.uid()));
