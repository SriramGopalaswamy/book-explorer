
-- Fix get_user_organization_id to be deterministic: prefer the user's profile.organization_id
-- over org_members, which could return any org the user belongs to
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- First try the user's profile (most reliable, single source of truth)
  SELECT COALESCE(
    (SELECT organization_id FROM public.profiles WHERE user_id = _user_id LIMIT 1),
    (SELECT organization_id FROM public.organization_members WHERE user_id = _user_id LIMIT 1)
  );
$$;
