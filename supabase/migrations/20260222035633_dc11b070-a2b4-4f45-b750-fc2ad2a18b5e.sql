
-- Fix memo-attachments storage bucket: replace overly permissive SELECT policy with org-scoped policy

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view memo attachments" ON storage.objects;

-- Create organization-scoped SELECT policy
CREATE POLICY "Users can view own or org memo attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'memo-attachments' AND
  auth.role() = 'authenticated' AND
  (
    -- Own uploaded files (user_id folder)
    auth.uid()::text = (storage.foldername(name))[1]
    -- OR file belongs to a published memo in user's org
    OR EXISTS (
      SELECT 1 FROM public.memos m
      WHERE m.attachment_url LIKE '%' || storage.filename(name)
        AND m.status = 'published'
        AND m.organization_id = get_user_organization_id(auth.uid())
    )
    -- OR user is org admin/HR (can view all org memos)
    OR EXISTS (
      SELECT 1 FROM public.memos m
      WHERE m.attachment_url LIKE '%' || storage.filename(name)
        AND is_org_admin_or_hr(auth.uid(), m.organization_id)
    )
  )
);
