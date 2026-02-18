
-- Add new columns to memos table
ALTER TABLE public.memos
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_notes TEXT;

-- Create storage bucket for memo attachments (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'memo-attachments',
  'memo-attachments',
  false,
  20971520,  -- 20MB limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for memo-attachments bucket
CREATE POLICY "Authenticated users can upload memo attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'memo-attachments' AND
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can view memo attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'memo-attachments' AND
  auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete own memo attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'memo-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
