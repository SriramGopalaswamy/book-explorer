
CREATE TABLE IF NOT EXISTS public.export_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  profile_id uuid,
  module text NOT NULL,
  format text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer NOT NULL DEFAULT 0,
  file_url text,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_audit_log_org_created
  ON public.export_audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_audit_log_user
  ON public.export_audit_log (user_id, created_at DESC);

ALTER TABLE public.export_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS export_audit_log_select ON public.export_audit_log;
CREATE POLICY export_audit_log_select ON public.export_audit_log
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS export_audit_log_insert ON public.export_audit_log;
CREATE POLICY export_audit_log_insert ON public.export_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND user_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.record_export(
  p_module text,
  p_format text,
  p_scope jsonb DEFAULT '{}'::jsonb,
  p_row_count integer DEFAULT 0,
  p_file_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_profile uuid;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No organization context';
  END IF;
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.export_audit_log (organization_id, user_id, profile_id, module, format, scope, row_count, file_url)
  VALUES (v_org, auth.uid(), v_profile, p_module, p_format, p_scope, p_row_count, p_file_url)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_export(text, text, jsonb, integer, text) TO authenticated;
