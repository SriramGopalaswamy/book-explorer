CREATE POLICY "Managers can view report leave attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'leave-attachments'
  AND EXISTS (
    SELECT 1 FROM profiles mgr
    JOIN profiles report ON report.manager_id = mgr.id
    WHERE mgr.user_id = auth.uid()
    AND report.user_id::text = (storage.foldername(name))[1]
  )
);