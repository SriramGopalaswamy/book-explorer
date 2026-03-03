-- Allow finance role users to view all leave requests in their organization
CREATE POLICY "Finance can view all leave requests"
ON public.leave_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'finance'
      AND organization_id = leave_requests.organization_id
  )
);
