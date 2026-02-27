
-- Allow managers to view expense receipts in bill-attachments bucket
CREATE POLICY "Managers can view bill attachments of direct reports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'bill-attachments'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('manager', 'hr', 'admin')
  )
);
