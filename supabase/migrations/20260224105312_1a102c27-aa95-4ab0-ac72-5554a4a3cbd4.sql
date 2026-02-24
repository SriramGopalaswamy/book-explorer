
-- =============================================
-- PHASE 7: Payroll Approval Workflow (Maker-Checker)
-- =============================================

-- Add approval columns to payroll_runs
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- State transition enforcement trigger
CREATE OR REPLACE FUNCTION public.enforce_payroll_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Block any change if old status is locked
  IF OLD.status = 'locked' THEN
    RAISE EXCEPTION 'Cannot modify a locked payroll run';
  END IF;

  -- Validate allowed transitions
  IF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'under_review') THEN
    RAISE EXCEPTION 'Draft can only transition to under_review, got: %', NEW.status;
  END IF;
  IF OLD.status = 'processing' AND NEW.status NOT IN ('processing', 'completed', 'draft') THEN
    RAISE EXCEPTION 'Processing can only transition to completed or draft';
  END IF;
  IF OLD.status = 'completed' AND NEW.status NOT IN ('completed', 'under_review') THEN
    RAISE EXCEPTION 'Completed can only transition to under_review, got: %', NEW.status;
  END IF;
  IF OLD.status = 'under_review' AND NEW.status NOT IN ('under_review', 'approved') THEN
    RAISE EXCEPTION 'under_review can only transition to approved, got: %', NEW.status;
  END IF;
  IF OLD.status = 'approved' AND NEW.status NOT IN ('approved', 'locked') THEN
    RAISE EXCEPTION 'Approved can only transition to locked, got: %', NEW.status;
  END IF;

  -- Auto-set timestamps
  IF NEW.status = 'under_review' AND OLD.status != 'under_review' THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
  END IF;
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    NEW.approved_by := auth.uid();
    NEW.approved_at := now();
  END IF;
  IF NEW.status = 'locked' AND OLD.status != 'locked' THEN
    NEW.locked_by := auth.uid();
    NEW.locked_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Drop old trigger if exists and create new one
DROP TRIGGER IF EXISTS trg_payroll_state_transition ON public.payroll_runs;
CREATE TRIGGER trg_payroll_state_transition
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payroll_state_transition();

-- =============================================
-- PHASE 8: Payslip PDF Engine columns on payroll_entries
-- =============================================

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS per_day_salary NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_ctc_snapshot NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pf_employee NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pf_employer NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS esi_employee NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS esi_employer NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payslip_url TEXT,
  ADD COLUMN IF NOT EXISTS payslip_generated_at TIMESTAMPTZ;

-- Payslips storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('payslips', 'payslips', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for payslips
CREATE POLICY "HR/Admin can manage payslips" ON storage.objects
  FOR ALL USING (
    bucket_id = 'payslips'
    AND is_org_admin_or_hr(auth.uid(), (SELECT organization_id FROM profiles WHERE user_id = auth.uid() LIMIT 1))
  );

CREATE POLICY "Finance can read payslips" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'payslips'
    AND is_admin_or_finance(auth.uid())
  );

CREATE POLICY "Employees can read own payslips" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'payslips'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- =============================================
-- PHASE 9: Full Indian TDS Engine
-- =============================================

CREATE TABLE IF NOT EXISTS public.tax_regimes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  financial_year TEXT NOT NULL DEFAULT '2025-2026',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tax_regimes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read tax_regimes" ON public.tax_regimes
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.tax_slabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regime_id UUID NOT NULL REFERENCES public.tax_regimes(id) ON DELETE CASCADE,
  income_from NUMERIC NOT NULL DEFAULT 0,
  income_to NUMERIC NOT NULL DEFAULT 0,
  tax_percentage NUMERIC NOT NULL DEFAULT 0,
  cess_percentage NUMERIC NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tax_slabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read tax_slabs" ON public.tax_slabs
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.employee_tax_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  regime_id UUID REFERENCES public.tax_regimes(id),
  financial_year TEXT NOT NULL DEFAULT '2025-2026',
  declared_80c NUMERIC DEFAULT 0,
  declared_80d NUMERIC DEFAULT 0,
  hra_exemption NUMERIC DEFAULT 0,
  standard_deduction NUMERIC DEFAULT 75000,
  other_deductions NUMERIC DEFAULT 0,
  previous_employer_income NUMERIC DEFAULT 0,
  previous_employer_tds NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, organization_id, financial_year)
);

ALTER TABLE public.employee_tax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own tax settings" ON public.employee_tax_settings
  FOR SELECT TO authenticated
  USING (profile_id = get_current_user_profile_id() OR is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Employees can update own tax settings" ON public.employee_tax_settings
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = get_current_user_profile_id() OR is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Employees can modify own tax settings" ON public.employee_tax_settings
  FOR UPDATE TO authenticated
  USING (profile_id = get_current_user_profile_id() OR is_org_admin_or_hr(auth.uid(), organization_id));

CREATE TABLE IF NOT EXISTS public.investment_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  financial_year TEXT NOT NULL,
  section_type TEXT NOT NULL,
  declared_amount NUMERIC DEFAULT 0,
  approved_amount NUMERIC DEFAULT 0,
  proof_url TEXT,
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.investment_declarations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can manage own declarations" ON public.investment_declarations
  FOR ALL TO authenticated
  USING (profile_id = get_current_user_profile_id() OR is_org_admin_or_hr(auth.uid(), organization_id))
  WITH CHECK (profile_id = get_current_user_profile_id() OR is_org_admin_or_hr(auth.uid(), organization_id));

-- Seed default tax regimes and slabs (New Regime FY 2025-26)
INSERT INTO public.tax_regimes (name, description, is_default, financial_year) VALUES
  ('new', 'New Tax Regime (Default from FY 2023-24)', true, '2025-2026'),
  ('old', 'Old Tax Regime (with deductions)', false, '2025-2026')
ON CONFLICT (name) DO NOTHING;

-- New Regime Slabs (FY 2025-26)
INSERT INTO public.tax_slabs (regime_id, income_from, income_to, tax_percentage, cess_percentage)
SELECT r.id, v.income_from, v.income_to, v.tax_pct, 4
FROM public.tax_regimes r,
(VALUES 
  (0, 400000, 0),
  (400001, 800000, 5),
  (800001, 1200000, 10),
  (1200001, 1600000, 15),
  (1600001, 2000000, 20),
  (2000001, 2400000, 25),
  (2400001, 999999999, 30)
) AS v(income_from, income_to, tax_pct)
WHERE r.name = 'new'
ON CONFLICT DO NOTHING;

-- Old Regime Slabs
INSERT INTO public.tax_slabs (regime_id, income_from, income_to, tax_percentage, cess_percentage)
SELECT r.id, v.income_from, v.income_to, v.tax_pct, 4
FROM public.tax_regimes r,
(VALUES 
  (0, 250000, 0),
  (250001, 500000, 5),
  (500001, 1000000, 20),
  (1000001, 999999999, 30)
) AS v(income_from, income_to, tax_pct)
WHERE r.name = 'old'
ON CONFLICT DO NOTHING;

-- =============================================
-- PHASE 10-11: PF ECR + Bank Transfer
-- =============================================

CREATE TABLE IF NOT EXISTS public.bank_transfer_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  bank_format_type TEXT NOT NULL DEFAULT 'generic_neft',
  file_url TEXT,
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.bank_transfer_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can manage bank transfers" ON public.bank_transfer_batches
  FOR ALL TO authenticated
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

-- =============================================
-- PHASE 12: Form 16 Records
-- =============================================

CREATE TABLE IF NOT EXISTS public.form16_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  financial_year TEXT NOT NULL,
  total_salary NUMERIC DEFAULT 0,
  total_tds NUMERIC DEFAULT 0,
  total_pf NUMERIC DEFAULT 0,
  exemptions_json JSONB DEFAULT '{}',
  form16_pdf_url TEXT,
  generated_at TIMESTAMPTZ,
  generated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, organization_id, financial_year)
);

ALTER TABLE public.form16_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own Form 16" ON public.form16_records
  FOR SELECT TO authenticated
  USING (profile_id = get_current_user_profile_id() OR is_org_admin_or_hr(auth.uid(), organization_id) OR is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Admin/Finance can manage Form 16" ON public.form16_records
  FOR ALL TO authenticated
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));
