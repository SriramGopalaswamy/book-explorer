-- Create erp-documents Storage bucket with RLS policies.
--
-- Path layout:
--   payslips/{org_id}/{employee_profile_id}/{filename}
--   disbursements/{org_id}/{filename}
--
-- Access rules:
--   payslips/  — readable by document owner (matching profile_id in path),
--                plus any org member with role admin or hr
--   disbursements/ — readable by org members with role finance or admin
--   uploads    — service_role only (Edge Functions)

-- ─── Bucket ───────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'erp-documents',
  'erp-documents',
  false,
  10485760,   -- 10 MB per file
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- ─── RLS on storage.objects ───────────────────────────────────────────────────

-- Helper: extract org_id segment from path  (segment index 1, 0-based)
-- Path: payslips/{org_id}/...  or  disbursements/{org_id}/...
CREATE OR REPLACE FUNCTION storage.erp_path_org_id(obj_name TEXT)
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT (string_to_array(obj_name, '/'))[2]::UUID;
$$;

-- Helper: extract employee profile_id from payslips path (segment index 2)
-- Path: payslips/{org_id}/{profile_id}/...
CREATE OR REPLACE FUNCTION storage.erp_payslip_profile_id(obj_name TEXT)
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT (string_to_array(obj_name, '/'))[3]::UUID;
$$;

-- ─── SELECT policies ──────────────────────────────────────────────────────────

-- payslips: owner can read their own payslip
DROP POLICY IF EXISTS "erp-docs payslip owner read" ON storage.objects;
CREATE POLICY "erp-docs payslip owner read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'erp-documents'
  AND (string_to_array(name, '/'))[1] = 'payslips'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = storage.erp_payslip_profile_id(name)
      AND p.user_id = auth.uid()
  )
);

-- payslips: admin and hr can read any payslip in their org
DROP POLICY IF EXISTS "erp-docs payslip admin-hr read" ON storage.objects;
CREATE POLICY "erp-docs payslip admin-hr read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'erp-documents'
  AND (string_to_array(name, '/'))[1] = 'payslips'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id = storage.erp_path_org_id(name)
      AND ur.role IN ('admin', 'hr')
  )
);

-- disbursements: finance and admin can read
DROP POLICY IF EXISTS "erp-docs disbursements finance-admin read" ON storage.objects;
CREATE POLICY "erp-docs disbursements finance-admin read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'erp-documents'
  AND (string_to_array(name, '/'))[1] = 'disbursements'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id = storage.erp_path_org_id(name)
      AND ur.role IN ('admin', 'finance')
  )
);

-- ─── INSERT / UPDATE / DELETE: service_role only (no anon/authenticated policy) ─
-- Supabase service_role bypasses RLS entirely, so no explicit INSERT policy
-- is needed — Edge Functions using the service key can upload freely.
-- We explicitly deny INSERT for authenticated (non-service) users by omitting
-- any INSERT policy for the 'authenticated' role on this bucket.
