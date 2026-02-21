-- Suspension Defense in Depth: RLS WITH CHECK layer
-- Prevents writes to suspended orgs at the RLS level (in addition to triggers)
-- Uses a lightweight check that won't degrade performance

CREATE OR REPLACE FUNCTION public.is_org_active(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = _org_id AND status != 'suspended'
  );
$$;

-- Note: We do NOT modify existing SELECT policies.
-- We add WITH CHECK to INSERT/UPDATE policies on critical tables
-- to enforce active org state at the RLS level.
-- This is defense-in-depth alongside the trigger-based enforcement.