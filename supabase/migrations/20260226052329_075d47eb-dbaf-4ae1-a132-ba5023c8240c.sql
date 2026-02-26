-- Allow users with 'manager' role to approve/reject pending memos within their org
CREATE POLICY "Managers by role can approve pending memos"
ON public.memos
FOR UPDATE
TO authenticated
USING (
  status = 'pending_approval'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'manager'
      AND organization_id = memos.organization_id
  )
)
WITH CHECK (
  status IN ('published', 'rejected')
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'manager'
      AND organization_id = memos.organization_id
  )
);

-- Also allow managers by role to SELECT pending memos in their org (not just direct reports)
CREATE POLICY "Managers by role can view pending memos"
ON public.memos
FOR SELECT
TO authenticated
USING (
  status = 'pending_approval'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'manager'
      AND organization_id = memos.organization_id
  )
);