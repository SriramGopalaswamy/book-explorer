
-- Add attachment_url column to leave_requests
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS attachment_url text;

-- Create storage bucket for leave attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('leave-attachments', 'leave-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Users can upload their own leave attachments (folder = user_id)
CREATE POLICY "Users can upload leave attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'leave-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS: Users can view their own attachments
CREATE POLICY "Users can view own leave attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'leave-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS: Admin/HR can view all leave attachments
CREATE POLICY "Admin HR can view all leave attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'leave-attachments'
  AND is_org_admin_or_hr(auth.uid(), get_user_organization_id(auth.uid()))
);

-- RLS: Users can delete their own attachments
CREATE POLICY "Users can delete own leave attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'leave-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
