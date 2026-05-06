CREATE OR REPLACE FUNCTION public.get_my_session_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_super boolean := false;
  v_org_id uuid;
  v_roles text[];
  v_org jsonb;
  v_sub jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'is_super_admin', false,
      'organization_id', null,
      'roles', '[]'::jsonb,
      'organization', null,
      'subscription', null
    );
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

  IF v_org_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'id', o.id,
             'name', o.name,
             'status', o.status,
             'org_state', o.org_state,
             'created_at', o.created_at
           )
      INTO v_org
      FROM organizations o WHERE o.id = v_org_id;

    SELECT jsonb_build_object(
             'id', s.id,
             'plan', s.plan,
             'status', s.status,
             'source', s.source,
             'valid_until', s.valid_until,
             'is_read_only', s.is_read_only,
             'enabled_modules', s.enabled_modules
           )
      INTO v_sub
      FROM subscriptions s
     WHERE s.organization_id = v_org_id
     ORDER BY s.created_at DESC
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'is_super_admin', v_is_super,
    'organization_id', v_org_id,
    'roles', to_jsonb(COALESCE(v_roles, ARRAY[]::text[])),
    'organization', v_org,
    'subscription', v_sub
  );
END;
$function$;