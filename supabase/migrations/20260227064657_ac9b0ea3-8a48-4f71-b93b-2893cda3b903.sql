
-- Fix: Employee document download policy uses profile_id as folder name,
-- but current policy checks auth.uid(). We need to check the user's profile_id instead.

-- Drop the old broken policy
DROP POLICY IF EXISTS "Employees can view own documents" ON storage.objects;

-- Create corrected policy: look up the user's profile_id and match against folder name
CREATE POLICY "Employees can view own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
  )
);
