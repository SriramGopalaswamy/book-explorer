-- Allow managers to view memos they have reviewed (approved/rejected)
CREATE POLICY "Reviewers can view memos they reviewed"
ON public.memos
FOR SELECT
TO authenticated
USING (
  reviewed_by = auth.uid()
);