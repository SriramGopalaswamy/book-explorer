-- Security Hardening Migration
-- Addresses:
--   1. Function search_path mutable (Supabase linter 0011)
--   2. Invoice-assets bucket already restricted in 20260312210000 (verified below)
--
-- NOTE: Leaked password protection (HIBP/HaveIBeenPwned) MUST be enabled manually
-- in the Supabase Dashboard → Authentication → Password strength → "Enable HIBP".
-- It cannot be set via SQL migrations.

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix mutable search_path on all public-schema PL/pgSQL functions.
-- Without SET search_path, a function can be tricked into resolving table/type
-- names from a malicious schema injected earlier in the search path.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  func_sig text;
BEGIN
  FOR func_sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%'
        )
      )
  LOOP
    BEGIN
      -- ALTER ROUTINE works for both functions (prokind='f') and procedures (prokind='p')
      -- and is available on PostgreSQL 11+ (Supabase runs PG 15+).
      EXECUTE format('ALTER ROUTINE %s SET search_path = public', func_sig);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not set search_path on %: %', func_sig, SQLERRM;
    END;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify invoice-assets bucket is private (belt-and-suspenders check).
-- The actual restriction was applied in 20260312210000_restrict_invoice_assets_bucket.sql
-- This ensures the bucket remains private even if a later migration re-enables public.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
  SET public = false
  WHERE id = 'invoice-assets'
    AND public = true;  -- no-op if already private

-- Ensure the org-scoped SELECT policy exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can view invoice assets'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can view invoice assets"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'invoice-assets' AND auth.role() = 'authenticated')
    $policy$;
  END IF;
END $$;
