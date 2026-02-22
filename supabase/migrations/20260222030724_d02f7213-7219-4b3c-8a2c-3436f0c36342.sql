
-- ============================================================
-- PART 1: SANDBOX TENANT INFRASTRUCTURE
-- ============================================================

-- 1a. Extend organizations table with sandbox fields
ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS environment_type text NOT NULL DEFAULT 'production' 
    CHECK (environment_type IN ('production', 'sandbox')),
  ADD COLUMN IF NOT EXISTS sandbox_owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_reset_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sandbox_expires_at timestamptz;

-- 1b. Create sandbox_users table (deterministic sandbox personas)
CREATE TABLE IF NOT EXISTS public.sandbox_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  persona_role text NOT NULL CHECK (persona_role IN ('admin', 'hr', 'finance', 'manager', 'employee')),
  display_name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sandbox_org_id, persona_role)
);

ALTER TABLE public.sandbox_users ENABLE ROW LEVEL SECURITY;

-- Only super_admins can manage sandbox users
CREATE POLICY "Super admins can manage sandbox users"
  ON public.sandbox_users FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- ============================================================
-- PART 2: IMPERSONATION SECURITY MODEL
-- ============================================================

-- 2a. Function to get the effective user ID (real or impersonated)
-- CRITICAL: Only returns impersonated ID within sandbox orgs
CREATE OR REPLACE FUNCTION public.get_effective_uid()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _impersonated text;
  _impersonated_uid uuid;
  _sandbox_org_id uuid;
BEGIN
  -- Check for impersonation context
  _impersonated := current_setting('app.impersonated_user', true);
  
  -- No impersonation active, return real auth user
  IF _impersonated IS NULL OR _impersonated = '' THEN
    RETURN auth.uid();
  END IF;
  
  _impersonated_uid := _impersonated::uuid;
  
  -- SECURITY: Verify the caller is a super_admin
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Impersonation requires super_admin authority';
  END IF;
  
  -- SECURITY: Verify the impersonated user belongs to a sandbox org
  SELECT sandbox_org_id INTO _sandbox_org_id
  FROM public.sandbox_users
  WHERE id = _impersonated_uid;
  
  IF _sandbox_org_id IS NULL THEN
    RAISE EXCEPTION 'Cannot impersonate non-sandbox user';
  END IF;
  
  -- SECURITY: Verify the sandbox org matches the current org context
  IF get_current_org() IS NULL OR get_current_org() != _sandbox_org_id THEN
    RAISE EXCEPTION 'Impersonation context mismatch: sandbox org not set as current org';
  END IF;
  
  -- SECURITY: Verify the target org is actually a sandbox
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations 
    WHERE id = _sandbox_org_id AND environment_type = 'sandbox'
  ) THEN
    RAISE EXCEPTION 'Cannot impersonate users in production organizations';
  END IF;
  
  RETURN _impersonated_uid;
END;
$$;

-- 2b. Function to set impersonation context (super_admin only, sandbox only)
CREATE OR REPLACE FUNCTION public.set_sandbox_impersonation(_sandbox_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sandbox_org_id uuid;
BEGIN
  -- Only super_admins can impersonate
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: impersonation requires super_admin';
  END IF;
  
  -- Verify target is a sandbox user
  SELECT sandbox_org_id INTO _sandbox_org_id
  FROM public.sandbox_users
  WHERE id = _sandbox_user_id;
  
  IF _sandbox_org_id IS NULL THEN
    RAISE EXCEPTION 'Target user is not a sandbox persona';
  END IF;
  
  -- Verify the org is a sandbox
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations 
    WHERE id = _sandbox_org_id AND environment_type = 'sandbox'
  ) THEN
    RAISE EXCEPTION 'Target organization is not a sandbox';
  END IF;
  
  -- Set the org context to the sandbox org
  PERFORM set_config('app.current_org', _sandbox_org_id::text, true);
  -- Set the impersonated user
  PERFORM set_config('app.impersonated_user', _sandbox_user_id::text, true);
END;
$$;

-- 2c. Function to clear impersonation context
CREATE OR REPLACE FUNCTION public.clear_sandbox_impersonation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: only super_admin can clear impersonation';
  END IF;
  
  PERFORM set_config('app.impersonated_user', '', true);
  PERFORM set_config('app.current_org', '', true);
END;
$$;

-- 2d. Function to create a sandbox org with deterministic users (super_admin only)
CREATE OR REPLACE FUNCTION public.create_sandbox_org(_name text, _auto_reset boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _owner_id uuid;
BEGIN
  -- Only super_admins can create sandbox orgs
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: only super_admin can create sandbox organizations';
  END IF;
  
  _owner_id := auth.uid();
  
  -- Create the sandbox organization
  INSERT INTO public.organizations (name, status, environment_type, sandbox_owner, auto_reset_enabled, slug)
  VALUES (_name, 'active', 'sandbox', _owner_id, _auto_reset, 'sandbox-' || gen_random_uuid()::text)
  RETURNING id INTO _org_id;
  
  -- Seed deterministic sandbox users (personas, not real auth users)
  INSERT INTO public.sandbox_users (sandbox_org_id, persona_role, display_name, email) VALUES
    (_org_id, 'admin', 'Sandbox Admin', 'admin@sandbox.local'),
    (_org_id, 'hr', 'Sandbox HR Manager', 'hr@sandbox.local'),
    (_org_id, 'finance', 'Sandbox Finance Lead', 'finance@sandbox.local'),
    (_org_id, 'manager', 'Sandbox Team Manager', 'manager@sandbox.local'),
    (_org_id, 'employee', 'Sandbox Employee', 'employee@sandbox.local');
  
  RETURN _org_id;
END;
$$;

-- 2e. Function to reset a sandbox org (delete all data, re-seed users)
CREATE OR REPLACE FUNCTION public.reset_sandbox_org(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only super_admins
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: only super_admin can reset sandbox';
  END IF;
  
  -- Verify this is actually a sandbox org
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations 
    WHERE id = _org_id AND environment_type = 'sandbox'
  ) THEN
    RAISE EXCEPTION 'Cannot reset: organization is not a sandbox';
  END IF;
  
  -- Delete sandbox users (cascade will handle data)
  DELETE FROM public.sandbox_users WHERE sandbox_org_id = _org_id;
  
  -- Re-seed deterministic users
  INSERT INTO public.sandbox_users (sandbox_org_id, persona_role, display_name, email) VALUES
    (_org_id, 'admin', 'Sandbox Admin', 'admin@sandbox.local'),
    (_org_id, 'hr', 'Sandbox HR Manager', 'hr@sandbox.local'),
    (_org_id, 'finance', 'Sandbox Finance Lead', 'finance@sandbox.local'),
    (_org_id, 'manager', 'Sandbox Team Manager', 'manager@sandbox.local'),
    (_org_id, 'employee', 'Sandbox Employee', 'employee@sandbox.local');
END;
$$;

-- 2f. Function to delete a sandbox org entirely
CREATE OR REPLACE FUNCTION public.delete_sandbox_org(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: only super_admin can delete sandbox';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations 
    WHERE id = _org_id AND environment_type = 'sandbox'
  ) THEN
    RAISE EXCEPTION 'Cannot delete: organization is not a sandbox';
  END IF;
  
  -- Delete sandbox users first
  DELETE FROM public.sandbox_users WHERE sandbox_org_id = _org_id;
  -- Delete the org
  DELETE FROM public.organizations WHERE id = _org_id AND environment_type = 'sandbox';
END;
$$;
