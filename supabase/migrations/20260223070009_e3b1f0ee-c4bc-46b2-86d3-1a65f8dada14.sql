
-- 1. Drop the recursive policy
DROP POLICY IF EXISTS "Super admins can manage platform roles" ON public.platform_roles;

-- 2. Keep the safe SELECT policy (already exists: user_id = auth.uid())
-- Just verify it's there — no change needed

-- 3. Block UPDATE and DELETE entirely
CREATE POLICY "No updates on platform_roles"
  ON public.platform_roles
  FOR UPDATE
  USING (false);

CREATE POLICY "No deletes on platform_roles"
  ON public.platform_roles
  FOR DELETE
  USING (false);

-- 4. Restrict INSERT to service-role / SECURITY DEFINER functions only
--    (anon/authenticated users cannot insert directly)
CREATE POLICY "No direct inserts on platform_roles"
  ON public.platform_roles
  FOR INSERT
  WITH CHECK (false);
