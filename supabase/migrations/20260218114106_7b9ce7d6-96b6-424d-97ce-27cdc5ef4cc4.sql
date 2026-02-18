
-- Fix the overly permissive SELECT policy — require auth
DROP POLICY IF EXISTS "Authenticated users can view memo attachments" ON storage.objects;

CREATE POLICY "Authenticated users can view memo attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'memo-attachments' AND
  auth.uid() IS NOT NULL
);
