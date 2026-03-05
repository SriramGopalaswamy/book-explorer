CREATE TABLE public.organization_oauth_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('microsoft', 'google')),
  client_id text NOT NULL,
  client_secret text NOT NULL,
  tenant_id text,
  sender_email text,
  scopes text[] DEFAULT '{}',
  is_verified boolean DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  UNIQUE(organization_id, provider)
);

ALTER TABLE public.organization_oauth_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage oauth configs"
  ON public.organization_oauth_configs
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Super admins can manage all oauth configs"
  ON public.organization_oauth_configs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid() AND pr.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid() AND pr.role = 'super_admin'
    )
  );