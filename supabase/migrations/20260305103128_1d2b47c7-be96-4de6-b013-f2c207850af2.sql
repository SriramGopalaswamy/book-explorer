
-- Goal Cycle Configuration table for HR to manage goal deadlines
CREATE TABLE public.goal_cycle_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cycle_month TEXT NOT NULL, -- e.g. '2026-03' or '*' for default
  input_start_day INT NOT NULL DEFAULT 1,
  input_deadline_day INT NOT NULL DEFAULT 7,
  scoring_start_day INT NOT NULL DEFAULT 25,
  scoring_deadline_day INT NOT NULL DEFAULT 28,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, cycle_month)
);

ALTER TABLE public.goal_cycle_config ENABLE ROW LEVEL SECURITY;

-- RLS: org members can read, admin/hr can write
CREATE POLICY "Members can view goal cycle config"
  ON public.goal_cycle_config FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admin/HR can manage goal cycle config"
  ON public.goal_cycle_config FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND organization_id = goal_cycle_config.organization_id
        AND role IN ('admin', 'hr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND organization_id = goal_cycle_config.organization_id
        AND role IN ('admin', 'hr')
    )
  );

-- Function for superadmin to do a fresh re-onboarding (delete all data, restart onboarding)
CREATE OR REPLACE FUNCTION public.fresh_reonboard_tenant(_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_name TEXT;
  _deleted_count INT := 0;
  _tbl TEXT;
  _tables TEXT[] := ARRAY[
    'payslip_disputes', 'payroll_records', 'payroll_runs',
    'reimbursement_requests', 'goal_plans', 'goal_cycle_config', 'memos', 'notifications',
    'attendance_daily', 'attendance_punches', 'attendance_records',
    'attendance_correction_requests', 'attendance_parse_diagnostics', 'attendance_upload_logs',
    'leave_requests', 'leave_balances', 'leave_types',
    'investment_declarations', 'employee_documents',
    'asset_depreciation_entries', 'assets',
    'quote_items', 'quotes',
    'invoice_items', 'invoices',
    'bill_items', 'bills',
    'vendor_credits', 'credit_notes',
    'bank_transactions', 'bank_accounts',
    'expenses', 'budgets',
    'compensation_revision_requests', 'compensation_components', 'compensation_structures',
    'holidays', 'profile_change_requests',
    'chart_of_accounts',
    'ai_alerts', 'ai_calibration', 'ai_customer_profiles', 'ai_financial_snapshots',
    'ai_risk_scores', 'ai_vendor_profiles',
    'audit_ai_anomalies', 'audit_ai_narratives', 'audit_ai_samples',
    'audit_compliance_checks', 'audit_compliance_runs',
    'audit_ifc_assessments', 'audit_pack_exports', 'audit_risk_themes',
    'audit_logs',
    'approval_workflows',
    'bank_transfer_batches',
    'customers', 'vendors'
  ];
BEGIN
  SELECT name INTO _org_name FROM organizations WHERE id = _org_id;
  IF _org_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization not found');
  END IF;

  -- Disable immutability triggers temporarily
  BEGIN
    EXECUTE 'ALTER TABLE journal_lines DISABLE TRIGGER trg_immutable_jl';
    EXECUTE 'ALTER TABLE journal_entries DISABLE TRIGGER trg_immutable_je';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Delete journal data
  DELETE FROM journal_lines WHERE journal_entry_id IN (
    SELECT id FROM journal_entries WHERE organization_id = _org_id
  );
  GET DIAGNOSTICS _deleted_count = ROW_COUNT;
  
  DELETE FROM journal_entries WHERE organization_id = _org_id;
  
  -- Delete financial records
  DELETE FROM financial_records WHERE organization_id = _org_id;

  -- Delete GL accounts
  DELETE FROM gl_accounts WHERE organization_id = _org_id;

  -- Delete fiscal periods and financial years
  DELETE FROM fiscal_periods WHERE organization_id = _org_id;
  DELETE FROM financial_years WHERE organization_id = _org_id;

  -- Re-enable triggers
  BEGIN
    EXECUTE 'ALTER TABLE journal_lines ENABLE TRIGGER trg_immutable_jl';
    EXECUTE 'ALTER TABLE journal_entries ENABLE TRIGGER trg_immutable_je';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Delete all org-scoped tables
  FOREACH _tbl IN ARRAY _tables LOOP
    BEGIN
      EXECUTE format('DELETE FROM %I WHERE organization_id = $1', _tbl) USING _org_id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  -- Delete user roles and org members (but keep profiles)
  DELETE FROM user_roles WHERE organization_id = _org_id;
  DELETE FROM organization_members WHERE organization_id = _org_id;

  -- Reset organization state
  UPDATE organizations SET
    org_state = 'initializing',
    onboarding_completed = false,
    onboarding_step = 0
  WHERE id = _org_id;

  -- Reset onboarding compliance
  DELETE FROM onboarding_compliance WHERE organization_id = _org_id;
  DELETE FROM organization_settings WHERE organization_id = _org_id;

  RETURN jsonb_build_object(
    'success', true,
    'org_name', _org_name,
    'org_state', 'initializing',
    'message', 'All tenant data deleted. Onboarding restarted from scratch.'
  );
END;
$$;
