
-- Add re-initiation tracking columns to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS onboarding_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS onboarding_reinitiated_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_reinitiated_by uuid REFERENCES auth.users(id);

-- RPC: Superadmin re-initiates onboarding for an org
CREATE OR REPLACE FUNCTION public.reinitiate_onboarding(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id uuid := auth.uid();
  _is_super boolean;
  _org RECORD;
  _has_transactions boolean;
BEGIN
  -- Verify caller is super_admin
  SELECT EXISTS (
    SELECT 1 FROM public.platform_roles
    WHERE user_id = _caller_id AND role = 'super_admin'
  ) INTO _is_super;

  IF NOT _is_super THEN
    RAISE EXCEPTION 'Access denied: only super_admin can re-initiate onboarding';
  END IF;

  -- Get org details
  SELECT id, name, org_state, onboarding_version
  INTO _org
  FROM public.organizations WHERE id = _org_id;

  IF _org IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  IF _org.org_state IN ('locked', 'archived') THEN
    RAISE EXCEPTION 'Cannot re-initiate: org is in % state', _org.org_state;
  END IF;

  -- Check for existing transactions (used for config locking on the frontend)
  SELECT EXISTS (
    SELECT 1 FROM public.financial_records WHERE organization_id = _org_id LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM public.invoices WHERE organization_id = _org_id LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM public.bills WHERE organization_id = _org_id LIMIT 1
  ) INTO _has_transactions;

  -- Update org state
  UPDATE public.organizations SET
    org_state = 'initializing',
    onboarding_version = COALESCE(onboarding_version, 1) + 1,
    onboarding_reinitiated_at = now(),
    onboarding_reinitiated_by = _caller_id,
    updated_at = now()
  WHERE id = _org_id;

  -- Reset phase1_completed_at so the compliance flow re-triggers
  UPDATE public.organization_compliance SET
    phase1_completed_at = NULL,
    phase2_completed_at = NULL,
    coa_confirmed = false,
    updated_at = now()
  WHERE organization_id = _org_id;

  -- Audit log
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, organization_id, metadata)
  VALUES (_caller_id, 'onboarding_reinitiated', 'organization', _org_id, _org_id,
    jsonb_build_object(
      'previous_state', _org.org_state,
      'new_version', COALESCE(_org.onboarding_version, 1) + 1,
      'has_transactions', _has_transactions
    ));

  RETURN jsonb_build_object(
    'success', true,
    'org_id', _org_id,
    'org_name', _org.name,
    'new_version', COALESCE(_org.onboarding_version, 1) + 1,
    'has_transactions', _has_transactions
  );
END;
$$;

-- Helper: check if org has transactions (for config locking in frontend)
CREATE OR REPLACE FUNCTION public.org_has_transactions(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.financial_records WHERE organization_id = _org_id LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM public.invoices WHERE organization_id = _org_id LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM public.bills WHERE organization_id = _org_id LIMIT 1
  );
$$;
