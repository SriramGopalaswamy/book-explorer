
-- Sandbox invite links for shareable access
CREATE TABLE public.sandbox_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  sandbox_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sandbox_invite_links ENABLE ROW LEVEL SECURITY;

-- Super admins can manage links
CREATE POLICY "Super admins manage sandbox invite links"
  ON public.sandbox_invite_links
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.platform_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- Any authenticated user can read active links (to validate tokens)
CREATE POLICY "Authenticated users can validate sandbox tokens"
  ON public.sandbox_invite_links
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- RPC: Join sandbox via token - validates token and sets session context
CREATE OR REPLACE FUNCTION public.join_sandbox_via_token(_token TEXT, _sandbox_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _link RECORD;
  _sandbox_user RECORD;
  _org RECORD;
BEGIN
  -- Validate token
  SELECT * INTO _link FROM sandbox_invite_links
  WHERE token = _token AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite link';
  END IF;
  
  -- Check expiry
  IF _link.expires_at IS NOT NULL AND _link.expires_at < now() THEN
    RAISE EXCEPTION 'This invite link has expired';
  END IF;
  
  -- Validate sandbox user belongs to this org
  SELECT * INTO _sandbox_user FROM sandbox_users
  WHERE id = _sandbox_user_id AND sandbox_org_id = _link.sandbox_org_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid sandbox persona';
  END IF;
  
  -- Validate org is sandbox type
  SELECT * INTO _org FROM organizations
  WHERE id = _link.sandbox_org_id AND environment_type = 'sandbox';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization is not a sandbox environment';
  END IF;
  
  -- Set session context for sandbox
  PERFORM set_config('app.current_org', _link.sandbox_org_id::text, true);
  PERFORM set_config('app.sandbox_role', _sandbox_user.persona_role, true);
  PERFORM set_config('app.sandbox_user_id', _sandbox_user_id::text, true);
  
  RETURN json_build_object(
    'success', true,
    'org_id', _link.sandbox_org_id,
    'org_name', _org.name,
    'persona_role', _sandbox_user.persona_role,
    'display_name', _sandbox_user.display_name
  );
END;
$$;
