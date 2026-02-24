
-- Diagnostic table for attendance parse analysis
CREATE TABLE public.attendance_parse_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  file_name TEXT,
  raw_excerpt TEXT,
  metrics JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.attendance_parse_diagnostics ENABLE ROW LEVEL SECURITY;

-- Only org admins/HR can view diagnostics
CREATE POLICY "Org admins can view diagnostics"
  ON public.attendance_parse_diagnostics
  FOR SELECT
  TO authenticated
  USING (is_org_admin_or_hr(auth.uid(), organization_id));

-- Insert via service role only (edge function uses admin client)
CREATE POLICY "Service insert diagnostics"
  ON public.attendance_parse_diagnostics
  FOR INSERT
  TO authenticated
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

-- Index for org lookup
CREATE INDEX idx_parse_diagnostics_org ON public.attendance_parse_diagnostics(organization_id, created_at DESC);
