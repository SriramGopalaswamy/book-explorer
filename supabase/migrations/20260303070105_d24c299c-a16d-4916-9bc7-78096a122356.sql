-- Drop the restrictive SELECT policy that only shows own uploads
DROP POLICY IF EXISTS "Users can view own upload history" ON public.bulk_upload_history;

-- Create a new SELECT policy allowing all authenticated org members to see their org's upload history
CREATE POLICY "Org members can view upload history"
  ON public.bulk_upload_history
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );