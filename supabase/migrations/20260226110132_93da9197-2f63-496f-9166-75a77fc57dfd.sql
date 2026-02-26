
-- Payslip dispute system with Manager → HR → Finance approval chain
CREATE TABLE public.payslip_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_record_id UUID NOT NULL REFERENCES public.payroll_records(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  pay_period TEXT NOT NULL,
  dispute_category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_manager',
  -- Manager step
  manager_reviewed_at TIMESTAMPTZ,
  manager_reviewed_by UUID,
  manager_notes TEXT,
  -- HR step
  hr_reviewed_at TIMESTAMPTZ,
  hr_reviewed_by UUID,
  hr_notes TEXT,
  -- Finance step
  finance_reviewed_at TIMESTAMPTZ,
  finance_reviewed_by UUID,
  finance_notes TEXT,
  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  -- Versioning
  revised_payroll_record_id UUID REFERENCES public.payroll_records(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add version tracking to payroll_records
ALTER TABLE public.payroll_records 
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_superseded BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES public.payroll_records(id),
  ADD COLUMN IF NOT EXISTS original_record_id UUID REFERENCES public.payroll_records(id);

-- Enable RLS
ALTER TABLE public.payslip_disputes ENABLE ROW LEVEL SECURITY;

-- RLS: employees can view their own disputes
CREATE POLICY "employees_view_own_disputes" ON public.payslip_disputes
  FOR SELECT TO authenticated
  USING (
    profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR is_org_admin_or_hr(auth.uid(), organization_id)
    OR is_org_admin_or_finance(auth.uid(), organization_id)
  );

-- RLS: employees can insert their own disputes
CREATE POLICY "employees_insert_own_disputes" ON public.payslip_disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND is_org_active(organization_id)
  );

-- RLS: managers, HR, finance can update disputes they review
CREATE POLICY "reviewers_update_disputes" ON public.payslip_disputes
  FOR UPDATE TO authenticated
  USING (
    -- Manager of the employee
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = payslip_disputes.profile_id 
      AND p.manager_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    )
    OR is_org_admin_or_hr(auth.uid(), organization_id)
    OR is_org_admin_or_finance(auth.uid(), organization_id)
  );

-- Auto-set organization_id
CREATE TRIGGER trg_auto_org_payslip_dispute
  BEFORE INSERT ON public.payslip_disputes
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_organization_id();

-- Index for fast queries
CREATE INDEX idx_payslip_disputes_profile ON public.payslip_disputes(profile_id);
CREATE INDEX idx_payslip_disputes_org_status ON public.payslip_disputes(organization_id, status);
CREATE INDEX idx_payslip_disputes_pay_period ON public.payslip_disputes(pay_period);
CREATE INDEX idx_payroll_records_superseded ON public.payroll_records(is_superseded) WHERE is_superseded = true;
