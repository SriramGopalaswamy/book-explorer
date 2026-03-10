
-- Allow org admins to INSERT, UPDATE, DELETE approval workflows within their org
CREATE POLICY "Org admins can manage approval workflows"
  ON public.approval_workflows
  FOR ALL
  TO authenticated
  USING (is_org_admin(auth.uid(), organization_id))
  WITH CHECK (is_org_admin(auth.uid(), organization_id));
