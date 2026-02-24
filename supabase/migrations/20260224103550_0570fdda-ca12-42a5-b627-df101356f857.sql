
-- =============================================
-- PHASE 3: Employee Documents
-- =============================================

-- Storage bucket for employee documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "HR admins can manage employee documents"
ON storage.objects FOR ALL
USING (bucket_id = 'employee-documents' AND is_org_admin_or_hr(auth.uid(), get_user_organization_id(auth.uid())))
WITH CHECK (bucket_id = 'employee-documents' AND is_org_admin_or_hr(auth.uid(), get_user_organization_id(auth.uid())));

CREATE POLICY "Employees can view own documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'employee-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Employee documents table
CREATE TABLE public.employee_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  document_type TEXT NOT NULL DEFAULT 'other',
  document_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  uploaded_by UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR admins can manage employee docs"
ON public.employee_documents FOR ALL
USING (is_org_admin_or_hr(auth.uid(), organization_id))
WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Employees can view own docs"
ON public.employee_documents FOR SELECT
USING (profile_id = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1));

-- =============================================
-- PHASE 5: Payroll Engine
-- =============================================

-- Payroll runs (batch processing)
CREATE TABLE public.payroll_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  pay_period TEXT NOT NULL, -- e.g. '2026-02'
  status TEXT NOT NULL DEFAULT 'draft', -- draft, processing, completed, locked
  total_gross NUMERIC NOT NULL DEFAULT 0,
  total_deductions NUMERIC NOT NULL DEFAULT 0,
  total_net NUMERIC NOT NULL DEFAULT 0,
  employee_count INTEGER NOT NULL DEFAULT 0,
  generated_by UUID NOT NULL,
  locked_at TIMESTAMPTZ,
  locked_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, pay_period)
);

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR/Finance can manage payroll runs"
ON public.payroll_runs FOR ALL
USING (is_org_admin_or_hr(auth.uid(), organization_id) OR is_org_admin_or_finance(auth.uid(), organization_id))
WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id) OR is_org_admin_or_finance(auth.uid(), organization_id));

-- Payroll entries (per employee per run)
CREATE TABLE public.payroll_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  compensation_structure_id UUID REFERENCES public.compensation_structures(id),
  annual_ctc NUMERIC NOT NULL DEFAULT 0,
  gross_earnings NUMERIC NOT NULL DEFAULT 0,
  total_deductions NUMERIC NOT NULL DEFAULT 0,
  net_pay NUMERIC NOT NULL DEFAULT 0,
  lwp_days INTEGER NOT NULL DEFAULT 0,
  lwp_deduction NUMERIC NOT NULL DEFAULT 0,
  working_days INTEGER NOT NULL DEFAULT 0,
  paid_days INTEGER NOT NULL DEFAULT 0,
  earnings_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  deductions_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'computed', -- computed, approved, locked
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payroll_run_id, profile_id)
);

ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR/Finance can manage payroll entries"
ON public.payroll_entries FOR ALL
USING (is_org_admin_or_hr(auth.uid(), organization_id) OR is_org_admin_or_finance(auth.uid(), organization_id))
WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id) OR is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Employees can view own payroll entries"
ON public.payroll_entries FOR SELECT
USING (profile_id = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1));

-- Prevent modifications to locked payroll runs
CREATE OR REPLACE FUNCTION public.trg_prevent_locked_payroll_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'locked' THEN
    RAISE EXCEPTION 'Cannot modify a locked payroll run';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_locked_payroll_update
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_prevent_locked_payroll_mutation();

-- Prevent modifications to entries of locked runs
CREATE OR REPLACE FUNCTION public.trg_prevent_locked_entry_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM payroll_runs WHERE id = OLD.payroll_run_id AND status = 'locked') THEN
    RAISE EXCEPTION 'Cannot modify entries of a locked payroll run';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_locked_entry_update
  BEFORE UPDATE OR DELETE ON public.payroll_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_prevent_locked_entry_mutation();

-- Audit trigger for payroll locking
CREATE OR REPLACE FUNCTION public.trg_audit_payroll_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'locked' AND OLD.status != 'locked' THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, organization_id, metadata)
    VALUES (
      auth.uid(),
      'payroll_locked',
      'payroll_run',
      NEW.id,
      NEW.organization_id,
      jsonb_build_object('pay_period', NEW.pay_period, 'employee_count', NEW.employee_count, 'total_net', NEW.total_net)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_payroll_lock
  AFTER UPDATE ON public.payroll_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_payroll_lock();
