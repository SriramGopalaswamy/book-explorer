INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('erp-documents','erp-documents',false,10485760,ARRAY['application/pdf','image/png','image/jpeg','application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "erp-docs payslip owner read" ON storage.objects;
CREATE POLICY "erp-docs payslip owner read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='erp-documents' AND (string_to_array(name,'/'))[1]='payslips'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text = (string_to_array(name,'/'))[3] AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "erp-docs payslip admin-hr read" ON storage.objects;
CREATE POLICY "erp-docs payslip admin-hr read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='erp-documents' AND (string_to_array(name,'/'))[1]='payslips'
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.organization_id::text = (string_to_array(name,'/'))[2] AND ur.role IN ('admin','hr')));

DROP POLICY IF EXISTS "erp-docs disbursements finance-admin read" ON storage.objects;
CREATE POLICY "erp-docs disbursements finance-admin read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='erp-documents' AND (string_to_array(name,'/'))[1]='disbursements'
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.organization_id::text = (string_to_array(name,'/'))[2] AND ur.role IN ('admin','finance')));