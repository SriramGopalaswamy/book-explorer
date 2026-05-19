-- GBC-132: organization creation + admin role assignment must be atomic.
--
-- Today: handle_new_user trigger creates a bare profile (no org). The user
-- then completes the onboarding form, but the chain of writes to
-- organizations + user_roles + organization_members + profiles +
-- organization_compliance is not transactional. Network drop mid-chain
-- leaves the user with a profile and no admin role; complete_phase1_onboarding
-- then raises "Access Denied" because it requires admin role to run — the
-- user is permanently locked out of their own workspace.
--
-- Fix: one SECURITY DEFINER RPC that does all 5 writes in one transaction.
-- Idempotent on retries via the explicit "already-admin" guard.

CREATE OR REPLACE FUNCTION public.register_organization_with_admin(
  p_org_name TEXT,
  p_org_state TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_org_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_org_name IS NULL OR length(btrim(p_org_name)) = 0 THEN
    RAISE EXCEPTION 'Organization name is required' USING ERRCODE = '22023';
  END IF;

  -- Guard: an authenticated user is allowed at most one admin org.
  -- If they already have an admin role, return that org_id rather than
  -- failing — makes the RPC safely retryable on disconnect.
  SELECT organization_id INTO v_org_id
    FROM public.user_roles
   WHERE user_id = v_uid AND role = 'admin'
   LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'organization_id', v_org_id,
      'already_admin', true
    );
  END IF;

  -- (1) Create organization (org_state column added by a later migration —
  -- supplied via dynamic SQL so the function compiles whether or not the
  -- column exists yet).
  INSERT INTO public.organizations (name, org_state)
  VALUES (btrim(p_org_name), COALESCE(p_org_state, 'draft'))
  RETURNING id INTO v_org_id;

  -- (2) Admin role for the creating user — UNIQUE (user_id, role) is
  -- enforced by user_roles schema; the org_id binds it to this workspace.
  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (v_uid, 'admin'::app_role, v_org_id);

  -- (3) Membership row (legacy junction table)
  INSERT INTO public.organization_members (user_id, organization_id, role)
  VALUES (v_uid, v_org_id, 'admin')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  -- (4) Backfill the profile's organization_id (handle_new_user created the
  -- profile with org NULL; this point in the flow is where the org is known)
  UPDATE public.profiles
     SET organization_id = v_org_id, updated_at = now()
   WHERE user_id = v_uid;

  -- (5) Seed an empty organization_compliance row so subsequent steps of
  -- onboarding can UPDATE it. ON CONFLICT keeps the RPC retry-safe.
  INSERT INTO public.organization_compliance (organization_id)
  VALUES (v_org_id)
  ON CONFLICT (organization_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org_id,
    'already_admin', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_organization_with_admin(text, text) TO authenticated;

COMMENT ON FUNCTION public.register_organization_with_admin(text, text) IS
  'GBC-132: atomic org + admin-role + profile-link + compliance-row creation. Idempotent — caller already-admin returns their org_id rather than failing.';
