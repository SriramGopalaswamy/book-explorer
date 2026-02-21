
-- Fix storage policies for bill-attachments and credit-card-statements
DROP POLICY IF EXISTS "Auth users can view bill attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can view credit card statements" ON storage.objects;

-- Owner-scoped policies for bill-attachments
CREATE POLICY "Users can view own bill attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'bill-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Finance admin can view all bill attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'bill-attachments'
    AND public.is_admin_or_finance(auth.uid())
  );

-- Owner-scoped policies for credit-card-statements
CREATE POLICY "Users can view own credit card statements"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'credit-card-statements'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Finance admin can view all credit card statements"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'credit-card-statements'
    AND public.is_admin_or_finance(auth.uid())
  );
