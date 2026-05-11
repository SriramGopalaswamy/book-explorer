-- 1. Make invoice-assets bucket private + drop permissive policy
UPDATE storage.buckets SET public = false WHERE id = 'invoice-assets';

DROP POLICY IF EXISTS "Anyone can view invoice assets" ON storage.objects;

-- 2. Create missing render_report bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('erp-documents-storage', 'erp-documents-storage', false)
ON CONFLICT (id) DO NOTHING;

-- Org-scoped read on erp-documents-storage: first folder segment = org id
DROP POLICY IF EXISTS "Org members can read erp-documents-storage" ON storage.objects;
CREATE POLICY "Org members can read erp-documents-storage"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'erp-documents-storage'
    AND (storage.foldername(name))[1] = (public.get_user_organization_id(auth.uid()))::text
  );

DROP POLICY IF EXISTS "Org members can write erp-documents-storage" ON storage.objects;
CREATE POLICY "Org members can write erp-documents-storage"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'erp-documents-storage'
    AND (storage.foldername(name))[1] = (public.get_user_organization_id(auth.uid()))::text
  );

DROP POLICY IF EXISTS "Org members can update erp-documents-storage" ON storage.objects;
CREATE POLICY "Org members can update erp-documents-storage"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'erp-documents-storage'
    AND (storage.foldername(name))[1] = (public.get_user_organization_id(auth.uid()))::text
  );

DROP POLICY IF EXISTS "Org members can delete erp-documents-storage" ON storage.objects;
CREATE POLICY "Org members can delete erp-documents-storage"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'erp-documents-storage'
    AND (storage.foldername(name))[1] = (public.get_user_organization_id(auth.uid()))::text
  );

-- Finance/admin full read of erp-documents-storage
DROP POLICY IF EXISTS "Finance admin can view all erp-documents-storage" ON storage.objects;
CREATE POLICY "Finance admin can view all erp-documents-storage"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'erp-documents-storage' AND public.is_admin_or_finance(auth.uid()));