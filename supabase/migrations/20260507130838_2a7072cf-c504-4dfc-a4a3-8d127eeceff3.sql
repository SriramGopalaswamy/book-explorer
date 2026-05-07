-- GBC-7 / GBC-15: Tighten invoice-assets bucket to org-scoped path tenancy.
DROP POLICY IF EXISTS "Authenticated users can view invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can manage own invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can view invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete invoice assets" ON storage.objects;
DROP POLICY IF EXISTS "Finance admin can view all invoice assets" ON storage.objects;

CREATE POLICY "Org members can view invoice assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'invoice-assets'
    AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
  );

CREATE POLICY "Org members can upload invoice assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'invoice-assets'
    AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
  );

CREATE POLICY "Org members can update invoice assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'invoice-assets'
    AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
  );

CREATE POLICY "Org members can delete invoice assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'invoice-assets'
    AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
  );

CREATE POLICY "Finance admin can view all invoice assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'invoice-assets'
    AND public.is_admin_or_finance(auth.uid())
  );

-- One-shot rename of legacy paths into <orgId>/... layout.
-- path_tokens is a generated column, so we only update name; tokens recompute automatically.
DO $$
DECLARE
  obj record;
  new_name text;
  resolved_org uuid;
  tail text;
BEGIN
  FOR obj IN
    SELECT id, name, owner
      FROM storage.objects
     WHERE bucket_id = 'invoice-assets'
  LOOP
    new_name := NULL;
    resolved_org := NULL;

    IF obj.name LIKE 'esign/%' THEN
      BEGIN
        resolved_org := NULLIF(split_part(obj.name, '/', 2), '')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN resolved_org := NULL;
      END;
      IF resolved_org IS NOT NULL THEN
        new_name := resolved_org::text || '/esign/'
                 || split_part(obj.name, '/', 3) || '/'
                 || split_part(obj.name, '/', 4);
      END IF;

    ELSIF obj.name ~ '^[0-9a-f-]{36}/' THEN
      IF EXISTS (SELECT 1 FROM public.organizations o
                  WHERE o.id::text = split_part(obj.name, '/', 1)) THEN
        CONTINUE;
      END IF;
      SELECT p.organization_id INTO resolved_org
        FROM public.profiles p
       WHERE p.user_id::text = split_part(obj.name, '/', 1)
       LIMIT 1;
      IF resolved_org IS NOT NULL THEN
        tail := substring(obj.name from position('/' in obj.name) + 1);
        new_name := resolved_org::text || '/logos/' || tail;
      END IF;
    END IF;

    IF new_name IS NOT NULL AND new_name <> obj.name THEN
      IF NOT EXISTS (
        SELECT 1 FROM storage.objects o2
         WHERE o2.bucket_id = 'invoice-assets'
           AND o2.name = new_name
      ) THEN
        UPDATE storage.objects
           SET name = new_name
         WHERE id = obj.id;

        BEGIN
          EXECUTE 'UPDATE public.invoices SET original_pdf_path = $1 WHERE original_pdf_path = $2'
            USING new_name, obj.name;
        EXCEPTION WHEN undefined_column THEN NULL;
        END;
        BEGIN
          EXECUTE 'UPDATE public.invoices SET signed_pdf_path = $1 WHERE signed_pdf_path = $2'
            USING new_name, obj.name;
        EXCEPTION WHEN undefined_column THEN NULL;
        END;
      END IF;
    END IF;
  END LOOP;
END $$;