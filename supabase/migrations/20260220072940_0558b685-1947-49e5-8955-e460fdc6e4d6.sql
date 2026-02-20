
-- ============================================================
-- STAGE 2: ORGANIZATION SCOPING
-- Purpose: Create organizations table, add org_id to all tables,
--          rewrite RLS from user-scoped to org-scoped
-- ============================================================

-- Step 1: Create organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Step 2: Create organization_members junction table
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Step 3: Add organization_id to profiles (the anchor table)
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Step 4: Create a default organization and backfill
INSERT INTO public.organizations (id, name, slug) 
VALUES ('00000000-0000-0000-0000-000000000001', 'GRX10 Solutions', 'grx10');

-- Backfill all profiles with default org
UPDATE public.profiles 
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Backfill organization_members for all existing users
INSERT INTO public.organization_members (organization_id, user_id)
SELECT '00000000-0000-0000-0000-000000000001', user_id
FROM public.profiles
WHERE user_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Step 5: Add organization_id to all scoped tables
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.reimbursement_requests ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.credit_card_transactions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.financial_records ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.goal_plans ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.chart_of_accounts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.credit_notes ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.vendor_credits ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.leave_balances ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.attendance_correction_requests ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.holidays ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.memos ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.scheduled_payments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.bulk_upload_history ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Step 6: Backfill organization_id on all tables using default org
UPDATE public.invoices SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.quotes SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.bills SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.expenses SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.reimbursement_requests SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.payroll_records SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.bank_accounts SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.bank_transactions SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.credit_card_transactions SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.financial_records SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.leave_requests SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.attendance_records SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.goal_plans SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.customers SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.vendors SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.chart_of_accounts SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.credit_notes SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.vendor_credits SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.credit_cards SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.leave_balances SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.attendance_correction_requests SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.holidays SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.memos SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.notifications SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.goals SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.scheduled_payments SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.bulk_upload_history SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.audit_logs SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.invoice_settings SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;

-- Step 7: Helper function to get user's organization
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.organization_members
  WHERE user_id = _user_id
  LIMIT 1;
$$;

-- Step 8: Helper function for org membership check
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id
  );
$$;

-- Step 9: Auto-populate organization_id trigger
CREATE OR REPLACE FUNCTION public.auto_set_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.organization_id := get_user_organization_id(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Attach auto-org trigger to all tables
CREATE TRIGGER trg_auto_org_invoices BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_quotes BEFORE INSERT ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_bills BEFORE INSERT ON public.bills FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_expenses BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_reimbursements BEFORE INSERT ON public.reimbursement_requests FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_payroll BEFORE INSERT ON public.payroll_records FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_bank_accounts BEFORE INSERT ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_bank_transactions BEFORE INSERT ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_cc_transactions BEFORE INSERT ON public.credit_card_transactions FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_financial_records BEFORE INSERT ON public.financial_records FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_leave_requests BEFORE INSERT ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_attendance BEFORE INSERT ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_goal_plans BEFORE INSERT ON public.goal_plans FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_customers BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_vendors BEFORE INSERT ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_coa BEFORE INSERT ON public.chart_of_accounts FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_credit_notes BEFORE INSERT ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_vendor_credits BEFORE INSERT ON public.vendor_credits FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_credit_cards BEFORE INSERT ON public.credit_cards FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_leave_balances BEFORE INSERT ON public.leave_balances FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_correction_requests BEFORE INSERT ON public.attendance_correction_requests FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_holidays BEFORE INSERT ON public.holidays FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_memos BEFORE INSERT ON public.memos FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_notifications BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_goals BEFORE INSERT ON public.goals FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_scheduled_payments BEFORE INSERT ON public.scheduled_payments FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_bulk_upload BEFORE INSERT ON public.bulk_upload_history FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_audit_logs BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
CREATE TRIGGER trg_auto_org_invoice_settings BEFORE INSERT ON public.invoice_settings FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

-- Step 10: Organization RLS policies
CREATE POLICY "Members can view their organization"
  ON public.organizations FOR SELECT
  USING (is_org_member(auth.uid(), id));

CREATE POLICY "Members can view org members"
  ON public.organization_members FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

-- Step 11: Add indexes for organization_id on high-volume tables
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_org ON public.expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_org ON public.financial_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_org ON public.payroll_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_org ON public.attendance_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_org ON public.leave_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
