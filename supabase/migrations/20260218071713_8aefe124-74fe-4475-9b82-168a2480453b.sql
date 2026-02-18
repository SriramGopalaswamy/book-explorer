
-- Step 1: Create a SECURITY DEFINER function to safely get the current user's profile ID
-- without triggering RLS recursion on the profiles table
CREATE OR REPLACE FUNCTION public.get_current_user_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Step 2: Drop the recursive policy that caused "infinite recursion detected"
-- (it was doing SELECT FROM profiles INSIDE a profiles policy)
DROP POLICY IF EXISTS "Managers can view direct reports profiles" ON public.profiles;

-- Step 3: Re-create it using the safe SECURITY DEFINER function
CREATE POLICY "Managers can view direct reports profiles"
ON public.profiles
FOR SELECT
USING (
  manager_id = public.get_current_user_profile_id()
);
