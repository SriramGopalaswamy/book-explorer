
-- Bulk upload history/audit log
CREATE TABLE public.bulk_upload_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module TEXT NOT NULL,  -- 'payroll', 'attendance', 'roles'
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  successful_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  errors TEXT[] DEFAULT '{}',
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bulk_upload_history ENABLE ROW LEVEL SECURITY;

-- Admins and HR can view all upload history
CREATE POLICY "Admins and HR can view all upload history"
  ON public.bulk_upload_history FOR SELECT
  USING (is_admin_or_hr(auth.uid()));

-- Admins and HR can insert upload history
CREATE POLICY "Admins and HR can insert upload history"
  ON public.bulk_upload_history FOR INSERT
  WITH CHECK (is_admin_or_hr(auth.uid()));

-- Users can view their own upload history
CREATE POLICY "Users can view own upload history"
  ON public.bulk_upload_history FOR SELECT
  USING (auth.uid() = uploaded_by);
