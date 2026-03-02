
CREATE OR REPLACE FUNCTION public.redeem_subscription_key(_passkey text, _org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _key_id uuid;
  _plan text;
  _modules text[];
  _sub_id uuid;
  _existing_sub RECORD;
  _key_hash text;
BEGIN
  SELECT id, status INTO _existing_sub
  FROM public.subscriptions
  WHERE organization_id = _org_id AND status = 'active'
  LIMIT 1;

  IF _existing_sub.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization already has an active subscription');
  END IF;

  _key_hash := encode(extensions.digest(_passkey::bytea, 'sha256'), 'hex');

  SELECT id, plan, enabled_modules INTO _key_id, _plan, _modules
  FROM public.subscription_keys
  WHERE key_hash = _key_hash
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
    AND used_count < max_uses
  FOR UPDATE;

  IF _key_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired subscription key');
  END IF;

  UPDATE public.subscription_keys
  SET used_count = used_count + 1
  WHERE id = _key_id;

  INSERT INTO public.subscriptions (organization_id, plan, status, source, is_read_only, enabled_modules)
  VALUES (_org_id, _plan, 'active', 'passkey', false, _modules)
  RETURNING id INTO _sub_id;

  UPDATE public.organizations
  SET org_state = 'initializing', updated_at = now()
  WHERE id = _org_id;

  INSERT INTO public.subscription_redemptions (subscription_key_id, organization_id, redeemed_by)
  VALUES (_key_id, _org_id, auth.uid());

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, organization_id, metadata)
  VALUES (auth.uid(), 'subscription_activated', 'subscription', _sub_id, _org_id,
    jsonb_build_object('plan', _plan, 'source', 'passkey', 'key_id', _key_id, 'enabled_modules', to_jsonb(_modules)));

  RETURN jsonb_build_object('success', true, 'subscription_id', _sub_id, 'plan', _plan, 'enabled_modules', to_jsonb(_modules));
END;
$$;
