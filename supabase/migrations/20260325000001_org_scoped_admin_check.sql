-- Fix CRITICAL: is_admin_or_hr() has no organization scope
-- Any admin/HR from any org could pass RLS checks on other orgs' data.
-- This migration adds an org-scoped variant and updates fiscal_periods policies.

-- Org-scoped admin/HR check: verifies the user is admin/HR within a specific org
-- (derives org membership via profiles.organization_id)
CREATE OR REPLACE FUNCTION public.is_admin_or_hr_in_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin', 'hr')
      AND p.organization_id = _org_id
  )
$$;

-- Org-scoped finance check
CREATE OR REPLACE FUNCTION public.is_admin_or_finance_in_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin', 'finance')
      AND p.organization_id = _org_id
  )
$$;

-- Org-scoped admin-only check
CREATE OR REPLACE FUNCTION public.is_admin_in_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'admin'
      AND p.organization_id = _org_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_hr_in_org TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_finance_in_org TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_in_org TO authenticated;

COMMENT ON FUNCTION public.is_admin_or_hr_in_org IS
  'Org-scoped role check: TRUE only if user is admin/HR within the given organization. Use this instead of is_admin_or_hr() in RLS policies to prevent cross-tenant access.';
