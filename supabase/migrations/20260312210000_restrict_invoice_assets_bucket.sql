-- Restrict invoice-assets bucket: make it private and limit read access to
-- authenticated users only.  Logos and signatures are proprietary assets and
-- should not be publicly accessible without authentication.

-- 1. Make the bucket private (disables public CDN URLs)
UPDATE storage.buckets
  SET public = false
  WHERE id = 'invoice-assets';

-- 2. Drop the open "Anyone can view" policy
DROP POLICY IF EXISTS "Anyone can view invoice assets" ON storage.objects;

-- 3. Replace with authenticated-only read access
CREATE POLICY "Authenticated users can view invoice assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invoice-assets' AND auth.role() = 'authenticated');
