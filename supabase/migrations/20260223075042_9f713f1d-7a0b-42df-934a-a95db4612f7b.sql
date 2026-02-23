
-- =============================================
-- Phase 2A: Financial OS Onboarding Engine
-- =============================================

-- 1. Master COA Template
CREATE TABLE IF NOT EXISTS public.master_coa_template (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  parent_code TEXT,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_deletable BOOLEAN NOT NULL DEFAULT true,
  country TEXT DEFAULT 'IN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed master template (India-focused)
INSERT INTO public.master_coa_template (account_code, account_name, account_type, is_system, is_deletable, description) VALUES
  ('1000', 'Cash', 'asset', true, false, 'Primary cash account'),
  ('1100', 'Bank', 'asset', true, false, 'Primary bank account'),
  ('1200', 'Accounts Receivable', 'asset', true, false, 'Trade receivables'),
  ('1300', 'Fixed Assets', 'asset', true, false, 'Tangible fixed assets'),
  ('1310', 'Accumulated Depreciation', 'asset', true, false, 'Contra-asset for depreciation'),
  ('2000', 'Accounts Payable', 'liability', true, false, 'Trade payables'),
  ('2100', 'Salaries Payable', 'liability', true, false, 'Employee salary obligations'),
  ('2200', 'Tax Payable', 'liability', true, false, 'Tax obligations'),
  ('3000', 'Owner Equity', 'equity', true, false, 'Owner capital'),
  ('3100', 'Retained Earnings', 'equity', true, false, 'Accumulated profits'),
  ('4000', 'Revenue', 'revenue', true, false, 'Primary revenue'),
  ('4010', 'Invoices', 'revenue', true, false, 'Invoice revenue'),
  ('4100', 'Interest Income', 'revenue', false, true, 'Interest earned'),
  ('4200', 'Gain on Asset Disposal', 'revenue', false, true, 'Gains from asset sales'),
  ('5000', 'Cost of Goods Sold', 'expense', true, false, 'Direct costs'),
  ('5100', 'Salaries', 'expense', true, false, 'Employee salaries'),
  ('5200', 'Rent', 'expense', false, true, 'Office rent'),
  ('5300', 'Utilities', 'expense', false, true, 'Utility expenses'),
  ('5400', 'Bills', 'expense', true, false, 'Vendor bills'),
  ('5500', 'Loss on Asset Disposal', 'expense', false, true, 'Losses from asset disposals'),
  ('5600', 'Reimbursement', 'expense', false, true, 'Employee reimbursements'),
  ('5900', 'Miscellaneous Expense', 'expense', false, true, 'Uncategorized expenses');

-- 2. Financial Year Config
CREATE TABLE IF NOT EXISTS public.financial_years (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, start_date)
);

ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage financial years"
  ON public.financial_years FOR ALL
  USING (is_super_admin(auth.uid()) AND organization_id = get_current_org())
  WITH CHECK (is_super_admin(auth.uid()) AND organization_id = get_current_org());

CREATE POLICY "Org finance can view financial years"
  ON public.financial_years FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

-- 3. Approval Workflows
CREATE TABLE IF NOT EXISTS public.approval_workflows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  workflow_type TEXT NOT NULL DEFAULT 'expense',
  threshold_amount NUMERIC NOT NULL DEFAULT 0,
  required_role TEXT NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, workflow_type)
);

ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage approval workflows"
  ON public.approval_workflows FOR ALL
  USING (is_super_admin(auth.uid()) AND organization_id = get_current_org())
  WITH CHECK (is_super_admin(auth.uid()) AND organization_id = get_current_org());

CREATE POLICY "Org admins can view approval workflows"
  ON public.approval_workflows FOR SELECT
  USING (is_org_admin(auth.uid(), organization_id));

-- 4. AI Calibration
CREATE TABLE IF NOT EXISTS public.ai_calibration (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) UNIQUE,
  monthly_revenue_range TEXT,
  avg_ticket_size NUMERIC,
  employee_count INTEGER,
  revenue_model TEXT,
  initialized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_calibration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage ai calibration"
  ON public.ai_calibration FOR ALL
  USING (is_super_admin(auth.uid()) AND organization_id = get_current_org())
  WITH CHECK (is_super_admin(auth.uid()) AND organization_id = get_current_org());

CREATE POLICY "Org admins can view ai calibration"
  ON public.ai_calibration FOR SELECT
  USING (is_org_admin(auth.uid(), organization_id));

-- 5. Onboarding Snapshot
CREATE TABLE IF NOT EXISTS public.onboarding_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  config_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  initialized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, version)
);

ALTER TABLE public.onboarding_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage onboarding snapshots"
  ON public.onboarding_snapshots FOR ALL
  USING (is_super_admin(auth.uid()) AND organization_id = get_current_org())
  WITH CHECK (is_super_admin(auth.uid()) AND organization_id = get_current_org());

CREATE POLICY "Org admins can view onboarding snapshots"
  ON public.onboarding_snapshots FOR SELECT
  USING (is_org_admin(auth.uid(), organization_id));

-- 6. The idempotent Financial OS initializer function
CREATE OR REPLACE FUNCTION public.initialize_financial_os(
  _org_id UUID,
  _calibration JSONB DEFAULT '{}'::jsonb,
  _force BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _org_state TEXT;
  _coa_count INT := 0;
  _tax_count INT := 0;
  _fy_count INT := 0;
  _wf_count INT := 0;
  _snapshot_version INT;
  _config_hash TEXT;
  _audit_result JSONB;
  _org_name TEXT;
  _template RECORD;
  _existing_code TEXT;
BEGIN
  -- Only super_admins
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: only super_admin can initialize Financial OS';
  END IF;

  -- Check org exists and state
  SELECT org_state, name INTO _org_state, _org_name
  FROM public.organizations WHERE id = _org_id;

  IF _org_state IS NULL THEN
    RAISE EXCEPTION 'Organization % not found', _org_id;
  END IF;

  IF _org_state NOT IN ('draft', 'initializing') THEN
    IF _force AND _org_state = 'active' THEN
      -- Allow force re-init on active orgs
      NULL;
    ELSE
      RAISE EXCEPTION 'Cannot initialize: org_state is %. Must be draft or initializing.', _org_state;
    END IF;
  END IF;

  -- Set state to initializing
  UPDATE public.organizations SET org_state = 'initializing', updated_at = now()
  WHERE id = _org_id;

  -- ============ CHART OF ACCOUNTS SEEDING ============
  FOR _template IN SELECT * FROM public.master_coa_template LOOP
    -- Check if this account already exists for this org
    SELECT account_code INTO _existing_code
    FROM public.chart_of_accounts
    WHERE organization_id = _org_id AND account_code = _template.account_code
    LIMIT 1;

    IF _existing_code IS NULL THEN
      -- Need a user_id; use the caller
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
  -- Input GST
  SELECT account_code INTO _existing_code
  FROM public.chart_of_accounts
  WHERE organization_id = _org_id AND account_code = '2300'
  LIMIT 1;

  IF _existing_code IS NULL THEN
    INSERT INTO public.chart_of_accounts (
      user_id, organization_id, account_code, account_name,
      account_type, description, is_active
    ) VALUES (
      auth.uid(), _org_id, '2300', 'Input GST',
      'asset', 'GST paid on purchases (Input Tax Credit)', true
    );
    _tax_count := _tax_count + 1;
  END IF;

  -- Output GST
  SELECT account_code INTO _existing_code
  FROM public.chart_of_accounts
  WHERE organization_id = _org_id AND account_code = '2310'
  LIMIT 1;

  IF _existing_code IS NULL THEN
    INSERT INTO public.chart_of_accounts (
      user_id, organization_id, account_code, account_name,
      account_type, description, is_active
    ) VALUES (
      auth.uid(), _org_id, '2310', 'Output GST',
      'liability', 'GST collected on sales (Output Tax)', true
    );
    _tax_count := _tax_count + 1;
  END IF;

  -- GST Payable
  SELECT account_code INTO _existing_code
  FROM public.chart_of_accounts
  WHERE organization_id = _org_id AND account_code = '2320'
  LIMIT 1;

  IF _existing_code IS NULL THEN
    INSERT INTO public.chart_of_accounts (
      user_id, organization_id, account_code, account_name,
      account_type, description, is_active
    ) VALUES (
      auth.uid(), _org_id, '2320', 'GST Payable',
      'liability', 'Net GST liability payable to government', true
    );
    _tax_count := _tax_count + 1;
  END IF;

  -- ============ FINANCIAL YEAR ============
  IF NOT EXISTS (
    SELECT 1 FROM public.financial_years
    WHERE organization_id = _org_id AND is_active = true
  ) THEN
    INSERT INTO public.financial_years (
      organization_id, start_date, end_date, is_active
    ) VALUES (
      _org_id,
      make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 4, 1),
      make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int + 1, 3, 31),
      true
    );
    _fy_count := 1;
  END IF;

  -- ============ APPROVAL WORKFLOW ============
  IF NOT EXISTS (
    SELECT 1 FROM public.approval_workflows
    WHERE organization_id = _org_id AND workflow_type = 'expense'
  ) THEN
    INSERT INTO public.approval_workflows (
      organization_id, workflow_type, threshold_amount, required_role
    ) VALUES (
      _org_id, 'expense', 5000, 'admin'
    );
    _wf_count := 1;
  END IF;

  -- ============ AI CALIBRATION ============
  INSERT INTO public.ai_calibration (
    organization_id,
    monthly_revenue_range,
    avg_ticket_size,
    employee_count,
    revenue_model,
    initialized_at,
    updated_at
  ) VALUES (
    _org_id,
    COALESCE(_calibration->>'monthly_revenue_range', 'unknown'),
    COALESCE((_calibration->>'avg_ticket_size')::numeric, 0),
    COALESCE((_calibration->>'employee_count')::int, 0),
    COALESCE(_calibration->>'revenue_model', 'unknown'),
    now(),
    now()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    monthly_revenue_range = COALESCE(EXCLUDED.monthly_revenue_range, ai_calibration.monthly_revenue_range),
    avg_ticket_size = COALESCE(EXCLUDED.avg_ticket_size, ai_calibration.avg_ticket_size),
    employee_count = COALESCE(EXCLUDED.employee_count, ai_calibration.employee_count),
    revenue_model = COALESCE(EXCLUDED.revenue_model, ai_calibration.revenue_model),
    updated_at = now();

  -- ============ SNAPSHOT ============
  SELECT COALESCE(MAX(version), 0) + 1 INTO _snapshot_version
  FROM public.onboarding_snapshots WHERE organization_id = _org_id;

  _config_hash := md5(
    _coa_count::text || ':' || _tax_count::text || ':' ||
    _fy_count::text || ':' || _wf_count::text || ':' ||
    _org_id::text || ':' || now()::text
  );

  INSERT INTO public.onboarding_snapshots (
    organization_id, config_hash, version
  ) VALUES (
    _org_id, _config_hash, _snapshot_version
  );

  -- ============ ACTIVATE ============
  UPDATE public.organizations SET org_state = 'active', updated_at = now()
  WHERE id = _org_id;

  -- Log
  INSERT INTO public.audit_logs (
    actor_id, organization_id, action, entity_type,
    entity_id, actor_role, metadata
  ) VALUES (
    auth.uid(), _org_id, 'FINANCIAL_OS_INITIALIZED', 'organization',
    _org_id, 'super_admin',
    jsonb_build_object(
      'coa_seeded', _coa_count,
      'tax_ledgers', _tax_count,
      'financial_year', _fy_count,
      'approval_workflows', _wf_count,
      'calibration', _calibration,
      'snapshot_version', _snapshot_version,
      'config_hash', _config_hash
    )
  );

  -- Run integrity audit
  _audit_result := run_integrity_audit(_org_id);

  RETURN jsonb_build_object(
    'success', true,
    'org_id', _org_id,
    'org_name', _org_name,
    'new_state', 'active',
    'coa_seeded', _coa_count,
    'tax_ledgers', _tax_count,
    'financial_year_created', _fy_count > 0,
    'approval_workflow_created', _wf_count > 0,
    'snapshot_version', _snapshot_version,
    'integrity_audit', _audit_result
  );
END;
$$;
