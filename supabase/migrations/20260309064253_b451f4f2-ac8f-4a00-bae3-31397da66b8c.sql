
-- ============================================================
-- FIX 1: Update handle_new_user to not create duplicate profiles
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create profile if one doesn't already exist for this user
  -- (sandbox simulation pre-creates profiles, so skip in that case)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.id) THEN
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- FIX 2: Update super admin RLS on profiles to allow cross-org visibility
-- ============================================================
DROP POLICY IF EXISTS "Org admins can view all profiles" ON public.profiles;
CREATE POLICY "Org admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    is_org_admin_or_hr(auth.uid(), organization_id)
    OR is_super_admin(auth.uid())
  );
