CREATE OR REPLACE FUNCTION public.get_my_session_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_super boolean := false;
  v_org_id uuid;
  v_roles text[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('is_super_admin', false, 'organization_id', null, 'roles', '[]'::jsonb);
  END IF;

  SELECT EXISTS (SELECT 1 FROM platform_roles WHERE user_id = v_uid AND role = 'super_admin')
    INTO v_is_super;

  SELECT organization_id INTO v_org_id FROM profiles WHERE user_id = v_uid LIMIT 1;
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id FROM organization_members WHERE user_id = v_uid LIMIT 1;
  END IF;

  SELECT COALESCE(array_agg(role::text), ARRAY[]::text[])
    INTO v_roles
    FROM user_roles
   WHERE user_id = v_uid AND (v_org_id IS NULL OR organization_id = v_org_id);

  RETURN jsonb_build_object(
    'is_super_admin', v_is_super,
    'organization_id', v_org_id,
    'roles', to_jsonb(v_roles)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_session_context() TO authenticated;
NOTIFY pgrst, 'reload schema';