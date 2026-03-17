
DROP POLICY IF EXISTS "Admins can update org settings" ON public.organization_settings;
CREATE POLICY "Admins can update org settings"
  ON public.organization_settings
  FOR UPDATE
  TO authenticated
  USING (is_org_admin(auth.uid(), organization_id))
  WITH CHECK (is_org_admin(auth.uid(), organization_id));
