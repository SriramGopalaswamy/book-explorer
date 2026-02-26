CREATE POLICY "Finance can view all org profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'finance'
        AND organization_id = profiles.organization_id
    )
  );