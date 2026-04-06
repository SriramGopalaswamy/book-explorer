-- Add missing DELETE policy for eway_bills table
-- Without this, delete operations silently succeed (no error) but no rows are removed
CREATE POLICY "Users can delete own org eway_bills"
  ON public.eway_bills FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));
