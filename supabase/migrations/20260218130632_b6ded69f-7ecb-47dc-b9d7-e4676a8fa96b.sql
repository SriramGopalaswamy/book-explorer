
-- ── Reimbursement Requests Table ──────────────────────────────────────────────
CREATE TABLE public.reimbursement_requests (
  id                    UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID NOT NULL,
  profile_id            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Bill document
  attachment_url        TEXT,
  file_name             TEXT,
  file_type             TEXT,

  -- AI extracted + user-editable
  vendor_name           TEXT,
  amount                NUMERIC NOT NULL DEFAULT 0,
  expense_date          DATE,
  category              TEXT,
  description           TEXT,
  ai_extracted          BOOLEAN NOT NULL DEFAULT false,
  ai_raw_data           JSONB,

  -- Workflow status
  -- pending_manager | manager_approved | manager_rejected | pending_finance | paid | finance_rejected
  status                TEXT NOT NULL DEFAULT 'pending_manager',
  manager_notes         TEXT,
  finance_notes         TEXT,

  -- Linked expense once finance records it
  expense_id            UUID REFERENCES public.expenses(id) ON DELETE SET NULL,

  -- Audit timestamps
  submitted_at          TIMESTAMP WITH TIME ZONE DEFAULT now(),
  manager_reviewed_at   TIMESTAMP WITH TIME ZONE,
  manager_reviewed_by   UUID,
  finance_reviewed_at   TIMESTAMP WITH TIME ZONE,
  finance_reviewed_by   UUID,

  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE TRIGGER update_reimbursement_requests_updated_at
  BEFORE UPDATE ON public.reimbursement_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.reimbursement_requests ENABLE ROW LEVEL SECURITY;

-- Employees can create their own
CREATE POLICY "Users can create own reimbursements"
  ON public.reimbursement_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Employees can view/update their own (for editing before submit)
CREATE POLICY "Users can view own reimbursements"
  ON public.reimbursement_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Managers / HR / Admin can view all (to approve their team's)
CREATE POLICY "Managers HR Admin can view all reimbursements"
  ON public.reimbursement_requests FOR SELECT
  USING (is_admin_hr_or_manager(auth.uid()));

-- Managers / HR / Admin can update (to approve/reject)
CREATE POLICY "Managers HR Admin can update reimbursements"
  ON public.reimbursement_requests FOR UPDATE
  USING (is_admin_hr_or_manager(auth.uid()));

-- Finance / Admin can view all (for finance inbox)
CREATE POLICY "Finance Admin can view all reimbursements"
  ON public.reimbursement_requests FOR SELECT
  USING (is_admin_or_finance(auth.uid()));

-- Finance / Admin can update (to record as expense and mark paid)
CREATE POLICY "Finance Admin can update reimbursements"
  ON public.reimbursement_requests FOR UPDATE
  USING (is_admin_or_finance(auth.uid()));

-- ── Storage bucket for reimbursement attachments ───────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('reimbursement-attachments', 'reimbursement-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload to their own folder
CREATE POLICY "Users can upload reimbursement docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'reimbursement-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can view their own uploads
CREATE POLICY "Users can view own reimbursement docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'reimbursement-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Managers / Finance / Admin can view all uploads (needed for approval workflow)
CREATE POLICY "Managers Finance Admin can view all reimbursement docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'reimbursement-attachments'
    AND (is_admin_hr_or_manager(auth.uid()) OR is_admin_or_finance(auth.uid()))
  );
