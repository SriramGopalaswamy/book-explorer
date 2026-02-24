-- Create organization_settings table for tenant branding
CREATE TABLE IF NOT EXISTS public.organization_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  logo_url TEXT,
  favicon_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT org_settings_unique UNIQUE (organization_id)
);

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org settings"
  ON public.organization_settings FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can update org settings"
  ON public.organization_settings FOR UPDATE
  USING (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can insert org settings"
  ON public.organization_settings FOR INSERT
  WITH CHECK (is_org_admin(auth.uid(), organization_id));

-- Create tenant-branding storage bucket (public readable for logos)
INSERT INTO storage.buckets (id, name, public) VALUES ('tenant-branding', 'tenant-branding', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view tenant branding"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant-branding');

CREATE POLICY "Authenticated users can upload tenant branding"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tenant-branding' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update tenant branding"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'tenant-branding' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete tenant branding"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'tenant-branding' AND auth.role() = 'authenticated');