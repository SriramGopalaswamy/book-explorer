-- ============================================================
-- GBC-17 — Cross-tenant storage leakage hard fix
-- Buckets in scope (per task):
--   memo-attachments, bill-attachments, credit-card-statements,
--   invoice-assets, employee-docs, payslip-exports
-- The last two do not exist in this project (actual buckets are
--   employee-documents / payslips); we leave their existing
--   policies alone per "do not touch any other storage policies".
-- ============================================================

-- 1) Helper: extract first path segment as UUID, NULL on bad input
CREATE OR REPLACE FUNCTION public.storage_path_org_id(object_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_seg TEXT;
  result UUID;
BEGIN
  IF object_name IS NULL OR object_name = '' THEN
    RETURN NULL;
  END IF;
  first_seg := split_part(object_name, '/', 1);
  IF first_seg IS NULL OR first_seg = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    result := first_seg::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN result;
END;
$$;

-- 2) Helper: TRUE iff auth.uid() belongs to the org encoded in the path
CREATE OR REPLACE FUNCTION public.user_in_path_org(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  path_org UUID;
  user_org UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  path_org := public.storage_path_org_id(object_name);
  IF path_org IS NULL THEN
    RETURN FALSE;
  END IF;
  user_org := public.get_user_organization_id(auth.uid());
  RETURN user_org IS NOT NULL AND user_org = path_org;
END;
$$;

GRANT EXECUTE ON FUNCTION public.storage_path_org_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_in_path_org(TEXT) TO authenticated;

-- 3) Drop existing app-created policies on the in-scope buckets
DROP POLICY IF EXISTS "Auth users can upload bill attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own bill attachments" ON storage.objects;
DROP POLICY IF EXISTS "Finance admin can view all bill attachments" ON storage.objects;
DROP POLICY IF EXISTS "Managers can view bill attachments of direct reports" ON storage.objects;

DROP POLICY IF EXISTS "Auth users can upload credit card statements" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own credit card statements" ON storage.objects;
DROP POLICY IF EXISTS "Finance admin can view all credit card statements" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can upload memo attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own memo attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own or org memo attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view memo attachments" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can read esign PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update esign PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload esign PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Finance admin can view all invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Finance and admin can delete invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Finance and admin can update invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Finance and admin can upload invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can view invoice assets" ON storage.objects;

-- 4) Re-create per-bucket org-scoped policies
DO $$
DECLARE
  bkt TEXT;
  buckets TEXT[] := ARRAY['memo-attachments','bill-attachments','credit-card-statements','invoice-assets'];
BEGIN
  FOREACH bkt IN ARRAY buckets LOOP
    EXECUTE format($f$
      CREATE POLICY %I ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = %L AND public.user_in_path_org(name) = true);
    $f$, 'gbc17 ' || bkt || ' select', bkt);

    EXECUTE format($f$
      CREATE POLICY %I ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = %L AND public.user_in_path_org(name) = true);
    $f$, 'gbc17 ' || bkt || ' insert', bkt);

    EXECUTE format($f$
      CREATE POLICY %I ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = %L AND public.user_in_path_org(name) = true)
      WITH CHECK (bucket_id = %L AND public.user_in_path_org(name) = true);
    $f$, 'gbc17 ' || bkt || ' update', bkt, bkt);

    EXECUTE format($f$
      CREATE POLICY %I ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = %L
        AND public.user_in_path_org(name) = true
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
      );
    $f$, 'gbc17 ' || bkt || ' delete', bkt);
  END LOOP;
END $$;

-- 5) Confirm invoice-assets is private (already is — idempotent)
UPDATE storage.buckets SET public = false WHERE id = 'invoice-assets';
