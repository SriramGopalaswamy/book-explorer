-- =============================================================================
-- MIGRATION: Add organization_id to user_roles; tighten org-scoped helpers
-- =============================================================================
-- Codex P1 review finding: is_admin_or_hr_in_org() (and variants) check only
-- that the caller's profile belongs to _org_id — they never verify that the
-- user's ROLE itself is scoped to that organisation.  A user who is admin in
-- Org A but whose profile.organization_id later changes to Org B would pass
-- the check for Org B without holding an admin role there.
--
-- Fix:
--   1. Add organization_id to user_roles.
--   2. Backfill from profiles (one-time).
--   3. Update the three org-scoped helper functions to also gate on
--      ur.organization_id = _org_id.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add organization_id column to user_roles
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Back-fill from profiles (most users have exactly one profile row)
-- ---------------------------------------------------------------------------
UPDATE public.user_roles ur
SET    organization_id = p.organization_id
FROM   public.profiles p
WHERE  p.user_id = ur.user_id
  AND  ur.organization_id IS NULL;

-- Index for RLS and lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_org_id ON public.user_roles(organization_id);

-- ---------------------------------------------------------------------------
-- 3. Update is_admin_or_hr_in_org to gate on BOTH profile org AND role org
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_or_hr_in_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.user_roles ur
    JOIN   public.profiles   p ON p.user_id = ur.user_id
    WHERE  ur.user_id           = _user_id
      AND  ur.role              IN ('admin', 'hr')
      AND  ur.organization_id   = _org_id   -- role must be scoped to the org
      AND  p.organization_id    = _org_id   -- profile must belong to the org
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_finance_in_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.user_roles ur
    JOIN   public.profiles   p ON p.user_id = ur.user_id
    WHERE  ur.user_id           = _user_id
      AND  ur.role              IN ('admin', 'finance')
      AND  ur.organization_id   = _org_id
      AND  p.organization_id    = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_in_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.user_roles ur
    JOIN   public.profiles   p ON p.user_id = ur.user_id
    WHERE  ur.user_id           = _user_id
      AND  ur.role              = 'admin'
      AND  ur.organization_id   = _org_id
      AND  p.organization_id    = _org_id
  )
$$;
