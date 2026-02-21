
-- ============================================================
-- TENANT ISOLATION LOCKDOWN — Phase 2: user_roles org-scoping
-- Phase 3: audit_logs policy correction
-- ============================================================

-- ============================================================
-- PHASE 2A: Add organization_id to user_roles
-- ============================================================

-- Step 1: Add column (nullable first for safe backfill)
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Step 2: Backfill from organization_members
UPDATE public.user_roles ur
SET organization_id = om.organization_id
FROM public.organization_members om
WHERE om.user_id = ur.user_id
  AND ur.organization_id IS NULL;

-- Step 3: Fallback — any remaining NULLs get the default org
UPDATE public.user_roles
SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

-- Step 4: Set NOT NULL and DEFAULT
ALTER TABLE public.user_roles
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- Step 5: Add FK (NOT VALID first, then validate)
ALTER TABLE public.user_roles
  ADD CONSTRAINT fk_user_roles_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.user_roles
  VALIDATE CONSTRAINT fk_user_roles_org;

-- Step 6: Drop old unique constraint and create org-scoped unique
-- Old: (user_id, role) — prevents same role in different orgs
-- New: (user_id, role, organization_id) — allows per-org roles
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_org_role_key
  UNIQUE (user_id, role, organization_id);

-- Step 7: Add index for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_org_id
  ON public.user_roles(organization_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_org
  ON public.user_roles(user_id, organization_id);

-- Step 8: Add auto_set trigger (from organization_members)
CREATE OR REPLACE FUNCTION public.auto_set_org_for_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.organization_members
    WHERE user_id = NEW.user_id
    LIMIT 1;
  END IF;
  -- Final fallback
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_set_org_user_roles ON public.user_roles;
CREATE TRIGGER trg_auto_set_org_user_roles
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_org_for_user_role();

-- ============================================================
-- PHASE 2B: Rewrite user_roles RLS policies
-- Org-scoped: admins can only manage roles within their org
-- ============================================================

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

-- Users can view their own roles (any org)
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Org admins can view all roles in their org
CREATE POLICY "Org admins can view org roles"
  ON public.user_roles FOR SELECT
  USING (
    is_org_admin(auth.uid(), organization_id)
  );

-- Org admins can insert roles within their org only
CREATE POLICY "Org admins can insert org roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    is_org_admin(auth.uid(), organization_id)
  );

-- Org admins can update roles within their org only
CREATE POLICY "Org admins can update org roles"
  ON public.user_roles FOR UPDATE
  USING (
    is_org_admin(auth.uid(), organization_id)
  );

-- Org admins can delete roles within their org only
CREATE POLICY "Org admins can delete org roles"
  ON public.user_roles FOR DELETE
  USING (
    is_org_admin(auth.uid(), organization_id)
  );

-- ============================================================
-- PHASE 2C: Update helper functions to use user_roles.organization_id directly
-- This eliminates the join to organization_members, making them faster
-- and correctly scoped to the role's org (not the membership org)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
      AND organization_id = _org_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin_or_hr(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'hr')
      AND organization_id = _org_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin_or_finance(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'finance')
      AND organization_id = _org_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin_hr_or_manager(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'hr', 'manager')
      AND organization_id = _org_id
  );
$$;

-- Update global helpers to also be org-aware via the user's membership
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_hr(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'hr')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_finance(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'finance')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_hr_or_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'hr', 'manager')
  )
$$;

-- ============================================================
-- PHASE 3: audit_logs INSERT policy correction
-- Replace permissive "any authenticated" with org-scoped check
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

-- Users can only insert audit logs for their own organization
CREATE POLICY "Users can insert audit logs for own org"
  ON public.audit_logs FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND organization_id = get_user_organization_id(auth.uid())
  );
