
-- Fix 1: Make subscription_redemptions.organization_id NOT NULL
ALTER TABLE public.subscription_redemptions 
ALTER COLUMN organization_id SET NOT NULL;

-- Fix 2: Create tenant-safe onboarding RPC (does not require super_admin)
-- Allows org admins to complete onboarding after subscription activation
CREATE OR REPLACE FUNCTION public.complete_tenant_onboarding(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _org_state TEXT;
  _org_name TEXT;
  _caller_role TEXT;
  _has_subscription BOOLEAN;
  _coa_count INT := 0;
  _tax_count INT := 0;
  _fy_count INT := 0;
  _wf_count INT := 0;
  _template RECORD;
  _existing_code TEXT;
BEGIN
  -- Verify caller is an org member
  IF NOT is_org_member(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'Access denied: you are not a member of this organization';
  END IF;

  -- Verify caller is admin of the org
  SELECT role INTO _caller_role
  FROM public.user_roles
  WHERE user_id = auth.uid() AND organization_id = _org_id AND role = 'admin'
  LIMIT 1;

  IF _caller_role IS NULL THEN
    RAISE EXCEPTION 'Access denied: only organization admins can complete onboarding';
  END IF;

  -- Check org state
  SELECT org_state, name INTO _org_state, _org_name
  FROM public.organizations WHERE id = _org_id;

  IF _org_state IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Only allow onboarding from initializing state
  IF _org_state NOT IN ('draft', 'initializing') THEN
    IF _org_state = 'active' THEN
      RETURN jsonb_build_object('success', true, 'message', 'Organization already onboarded');
    ELSE
      RAISE EXCEPTION 'Cannot onboard: org_state is %. Must be draft or initializing.', _org_state;
    END IF;
  END IF;

  -- Verify active subscription exists
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions 
    WHERE organization_id = _org_id AND status = 'active'
  ) INTO _has_subscription;

  IF NOT _has_subscription THEN
    RAISE EXCEPTION 'Cannot onboard: no active subscription found';
  END IF;

  -- Set state to initializing
  UPDATE public.organizations SET org_state = 'initializing', updated_at = now()
  WHERE id = _org_id;

  -- ============ CHART OF ACCOUNTS SEEDING ============
  FOR _template IN SELECT * FROM public.master_coa_template LOOP
    SELECT account_code INTO _existing_code
    FROM public.chart_of_accounts
    WHERE organization_id = _org_id AND account_code = _template.account_code
    LIMIT 1;

    IF _existing_code IS NULL THEN
      INSERT INTO public.chart_of_accounts (
        user_id, organization_id, account_code, account_name,
        account_type, description, is_active
      ) VALUES (
        auth.uid(), _org_id, _template.account_code, _template.account_name,
        _template.account_type, _template.description, true
      );
      _coa_count := _coa_count + 1;
    END IF;
  END LOOP;

  -- ============ TAX CONFIGURATION ============
  SELECT account_code INTO _existing_code
  FROM public.chart_of_accounts WHERE organization_id = _org_id AND account_code = '2300' LIMIT 1;
  IF _existing_code IS NULL THEN
    INSERT INTO public.chart_of_accounts (user_id, organization_id, account_code, account_name, account_type, description, is_active)
    VALUES (auth.uid(), _org_id, '2300', 'Input GST', 'asset', 'GST paid on purchases (Input Tax Credit)', true);
    _tax_count := _tax_count + 1;
  END IF;

  SELECT account_code INTO _existing_code
  FROM public.chart_of_accounts WHERE organization_id = _org_id AND account_code = '2310' LIMIT 1;
  IF _existing_code IS NULL THEN
    INSERT INTO public.chart_of_accounts (user_id, organization_id, account_code, account_name, account_type, description, is_active)
    VALUES (auth.uid(), _org_id, '2310', 'Output GST', 'liability', 'GST collected on sales (Output Tax)', true);
    _tax_count := _tax_count + 1;
  END IF;

  SELECT account_code INTO _existing_code
  FROM public.chart_of_accounts WHERE organization_id = _org_id AND account_code = '2320' LIMIT 1;
  IF _existing_code IS NULL THEN
    INSERT INTO public.chart_of_accounts (user_id, organization_id, account_code, account_name, account_type, description, is_active)
    VALUES (auth.uid(), _org_id, '2320', 'GST Payable', 'liability', 'Net GST liability payable to government', true);
    _tax_count := _tax_count + 1;
  END IF;

  -- ============ FINANCIAL YEAR ============
  IF NOT EXISTS (
    SELECT 1 FROM public.financial_years
    WHERE organization_id = _org_id AND is_active = true
  ) THEN
    INSERT INTO public.financial_years (organization_id, start_date, end_date, is_active)
    VALUES (_org_id, make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 4, 1),
            make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int + 1, 3, 31), true);
    _fy_count := 1;
  END IF;

  -- ============ APPROVAL WORKFLOW ============
  IF NOT EXISTS (
    SELECT 1 FROM public.approval_workflows
    WHERE organization_id = _org_id AND workflow_type = 'expense'
  ) THEN
    INSERT INTO public.approval_workflows (organization_id, workflow_type, threshold_amount, required_role)
    VALUES (_org_id, 'expense', 5000, 'admin');
    _wf_count := 1;
  END IF;

  -- ============ ACTIVATE ============
  UPDATE public.organizations SET org_state = 'active', updated_at = now()
  WHERE id = _org_id;

  -- Audit log
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, organization_id, metadata)
  VALUES (auth.uid(), 'TENANT_ONBOARDED', 'organization', _org_id, _org_id,
    jsonb_build_object('coa_seeded', _coa_count, 'tax_ledgers', _tax_count,
      'financial_year', _fy_count, 'approval_workflows', _wf_count));

  RETURN jsonb_build_object(
    'success', true,
    'org_id', _org_id,
    'org_name', _org_name,
    'coa_seeded', _coa_count,
    'tax_ledgers', _tax_count,
    'financial_year_created', _fy_count > 0,
    'approval_workflow_created', _wf_count > 0
  );
END;
$$;
