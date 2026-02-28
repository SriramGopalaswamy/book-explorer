
-- ============================================================
-- PHASE 1: New tables for onboarding workflow
-- ============================================================

-- Organization compliance/identity data (Phase 1 fields)
CREATE TABLE public.organization_compliance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) UNIQUE,
  -- Step 1: Entity Identity
  legal_name text,
  trade_name text,
  entity_type text,
  pan text,
  tan text,
  cin_or_llpin text,
  registered_address text,
  state text,
  pincode text,
  -- Step 2: GST & Tax
  gstin text[],
  registration_type text,
  filing_frequency text,
  reverse_charge_applicable boolean DEFAULT false,
  einvoice_applicable boolean DEFAULT false,
  ewaybill_applicable boolean DEFAULT false,
  itc_eligible boolean DEFAULT true,
  -- Step 3: Financial Setup
  financial_year_start text,
  books_start_date date,
  accounting_method text DEFAULT 'accrual',
  base_currency text DEFAULT 'INR',
  msme_status boolean DEFAULT false,
  -- Step 4: Chart of Accounts
  industry_template text,
  coa_confirmed boolean DEFAULT false,
  -- Phase tracking
  phase1_completed_at timestamptz,
  phase2_completed_at timestamptz,
  -- Phase 2 Step 5: Branding
  logo_url text,
  brand_color text,
  authorized_signatory_name text,
  signature_url text,
  -- Phase 2 Step 6: Payroll Flags
  payroll_enabled boolean DEFAULT false,
  payroll_frequency text,
  pf_applicable boolean DEFAULT false,
  esi_applicable boolean DEFAULT false,
  professional_tax_applicable boolean DEFAULT false,
  gratuity_applicable boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Organization integrations (Microsoft 365, Google Workspace)
CREATE TABLE public.organization_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  provider text NOT NULL CHECK (provider IN ('microsoft', 'google')),
  provider_tenant_id text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  scopes text,
  status text CHECK (status IN ('connected', 'disconnected')) DEFAULT 'connected',
  connected_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, provider)
);

-- Organization leadership roles
CREATE TABLE public.organization_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  role_type text NOT NULL CHECK (role_type IN ('CEO', 'Finance', 'HR', 'Compliance', 'AuthorizedSignatory')),
  user_id uuid REFERENCES auth.users(id),
  name text,
  email text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, role_type)
);

-- RLS policies
ALTER TABLE public.organization_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_roles ENABLE ROW LEVEL SECURITY;

-- organization_compliance RLS
CREATE POLICY "org_compliance_select" ON public.organization_compliance
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_compliance_insert" ON public.organization_compliance
  FOR INSERT WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_compliance_update" ON public.organization_compliance
  FOR UPDATE USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- organization_integrations RLS
CREATE POLICY "org_integrations_select" ON public.organization_integrations
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_integrations_insert" ON public.organization_integrations
  FOR INSERT WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_integrations_update" ON public.organization_integrations
  FOR UPDATE USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- organization_roles RLS
CREATE POLICY "org_roles_select" ON public.organization_roles
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_roles_insert" ON public.organization_roles
  FOR INSERT WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_roles_update" ON public.organization_roles
  FOR UPDATE USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_roles_delete" ON public.organization_roles
  FOR DELETE USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- Update complete_tenant_onboarding to check organization_compliance phase1
CREATE OR REPLACE FUNCTION public.complete_phase1_onboarding(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_state TEXT;
  _org_name TEXT;
  _compliance RECORD;
  _coa_count INT := 0;
  _tax_count INT := 0;
  _fy_count INT := 0;
  _wf_count INT := 0;
  _template RECORD;
  _existing_code TEXT;
  _fy_start_month INT;
  _fy_start_year INT;
BEGIN
  -- Verify caller is an org admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND organization_id = _org_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: only organization admins can complete onboarding';
  END IF;

  -- Check org state
  SELECT org_state, name INTO _org_state, _org_name
  FROM public.organizations WHERE id = _org_id;

  IF _org_state IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  IF _org_state = 'active' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already active');
  END IF;

  IF _org_state NOT IN ('draft', 'initializing') THEN
    RAISE EXCEPTION 'Cannot onboard: org_state is %', _org_state;
  END IF;

  -- Verify compliance data exists
  SELECT * INTO _compliance FROM public.organization_compliance WHERE organization_id = _org_id;
  IF _compliance IS NULL THEN
    RAISE EXCEPTION 'Compliance data not found. Complete Phase 1 steps first.';
  END IF;

  -- Validate required Phase 1 fields
  IF _compliance.legal_name IS NULL OR _compliance.entity_type IS NULL OR _compliance.pan IS NULL
    OR _compliance.registered_address IS NULL OR _compliance.state IS NULL OR _compliance.pincode IS NULL THEN
    RAISE EXCEPTION 'Entity Identity (Step 1) incomplete';
  END IF;

  IF _compliance.registration_type IS NULL OR _compliance.filing_frequency IS NULL THEN
    RAISE EXCEPTION 'GST & Tax (Step 2) incomplete';
  END IF;

  IF _compliance.financial_year_start IS NULL OR _compliance.books_start_date IS NULL
    OR _compliance.accounting_method IS NULL THEN
    RAISE EXCEPTION 'Financial Setup (Step 3) incomplete';
  END IF;

  IF _compliance.coa_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'Chart of Accounts (Step 4) not confirmed';
  END IF;

  -- Set state to initializing
  UPDATE public.organizations SET org_state = 'initializing', updated_at = now()
  WHERE id = _org_id;

  -- Seed COA
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

  -- Tax ledgers
  SELECT account_code INTO _existing_code FROM public.chart_of_accounts WHERE organization_id = _org_id AND account_code = '2300' LIMIT 1;
  IF _existing_code IS NULL THEN
    INSERT INTO public.chart_of_accounts (user_id, organization_id, account_code, account_name, account_type, description, is_active)
    VALUES (auth.uid(), _org_id, '2300', 'Input GST', 'asset', 'GST paid on purchases (ITC)', true);
    _tax_count := _tax_count + 1;
  END IF;

  SELECT account_code INTO _existing_code FROM public.chart_of_accounts WHERE organization_id = _org_id AND account_code = '2310' LIMIT 1;
  IF _existing_code IS NULL THEN
    INSERT INTO public.chart_of_accounts (user_id, organization_id, account_code, account_name, account_type, description, is_active)
    VALUES (auth.uid(), _org_id, '2310', 'Output GST', 'liability', 'GST collected on sales', true);
    _tax_count := _tax_count + 1;
  END IF;

  SELECT account_code INTO _existing_code FROM public.chart_of_accounts WHERE organization_id = _org_id AND account_code = '2320' LIMIT 1;
  IF _existing_code IS NULL THEN
    INSERT INTO public.chart_of_accounts (user_id, organization_id, account_code, account_name, account_type, description, is_active)
    VALUES (auth.uid(), _org_id, '2320', 'GST Payable', 'liability', 'Net GST liability', true);
    _tax_count := _tax_count + 1;
  END IF;

  -- Financial Year
  IF NOT EXISTS (SELECT 1 FROM public.financial_years WHERE organization_id = _org_id AND is_active = true) THEN
    INSERT INTO public.financial_years (organization_id, start_date, end_date, is_active)
    VALUES (_org_id, make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 4, 1),
            make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int + 1, 3, 31), true);
    _fy_count := 1;
  END IF;

  -- Approval Workflow
  IF NOT EXISTS (SELECT 1 FROM public.approval_workflows WHERE organization_id = _org_id AND workflow_type = 'expense') THEN
    INSERT INTO public.approval_workflows (organization_id, workflow_type, threshold_amount, required_role)
    VALUES (_org_id, 'expense', 5000, 'admin');
    _wf_count := 1;
  END IF;

  -- Mark Phase 1 complete
  UPDATE public.organization_compliance SET phase1_completed_at = now(), updated_at = now()
  WHERE organization_id = _org_id;

  -- Activate
  UPDATE public.organizations SET org_state = 'active', updated_at = now()
  WHERE id = _org_id;

  -- Audit
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, organization_id, metadata)
  VALUES (auth.uid(), 'PHASE1_ONBOARDING_COMPLETE', 'organization', _org_id, _org_id,
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
