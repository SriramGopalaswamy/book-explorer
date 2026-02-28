
-- ============ SUBSCRIPTIONS TABLE ============
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','expired','cancelled')),
  source text NOT NULL CHECK (source IN ('passkey','stripe')),
  valid_until timestamptz,
  is_read_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_org ON public.subscriptions(organization_id);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS: org members can read their own subscription
CREATE POLICY "Org members can view subscriptions"
ON public.subscriptions FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id));

-- RLS: super_admin can manage all
CREATE POLICY "Super admin full access subscriptions"
ON public.subscriptions FOR ALL TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- ============ SUBSCRIPTION KEYS TABLE ============
CREATE TABLE public.subscription_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL,
  plan text NOT NULL,
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscription_keys_hash ON public.subscription_keys(key_hash);
ALTER TABLE public.subscription_keys ENABLE ROW LEVEL SECURITY;

-- RLS: only super_admin
CREATE POLICY "Super admin manages subscription keys"
ON public.subscription_keys FOR ALL TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- ============ SUBSCRIPTION REDEMPTIONS TABLE ============
CREATE TABLE public.subscription_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_key_id uuid REFERENCES public.subscription_keys(id),
  organization_id uuid REFERENCES public.organizations(id),
  redeemed_by uuid REFERENCES auth.users(id),
  redeemed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_redemptions ENABLE ROW LEVEL SECURITY;

-- RLS: org members can view their redemptions
CREATE POLICY "Org members can view redemptions"
ON public.subscription_redemptions FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id));

-- RLS: super_admin full access
CREATE POLICY "Super admin full access redemptions"
ON public.subscription_redemptions FOR ALL TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- ============ CONCURRENCY-SAFE REDEMPTION RPC ============
CREATE OR REPLACE FUNCTION public.redeem_subscription_key(_passkey text, _org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _key_id uuid;
  _plan text;
  _sub_id uuid;
  _existing_sub RECORD;
  _key_hash text;
BEGIN
  -- Check if org already has active subscription
  SELECT id, status INTO _existing_sub
  FROM public.subscriptions
  WHERE organization_id = _org_id AND status = 'active'
  LIMIT 1;

  IF _existing_sub.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization already has an active subscription');
  END IF;

  -- Hash the passkey
  _key_hash := encode(digest(_passkey, 'sha256'), 'hex');

  -- Lock and validate the key
  SELECT id, plan INTO _key_id, _plan
  FROM public.subscription_keys
  WHERE key_hash = _key_hash
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
    AND used_count < max_uses
  FOR UPDATE;

  IF _key_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired subscription key');
  END IF;

  -- Increment used_count
  UPDATE public.subscription_keys
  SET used_count = used_count + 1
  WHERE id = _key_id;

  -- Create subscription
  INSERT INTO public.subscriptions (organization_id, plan, status, source, is_read_only)
  VALUES (_org_id, _plan, 'active', 'passkey', false)
  RETURNING id INTO _sub_id;

  -- Update org state to initializing (triggers onboarding)
  UPDATE public.organizations
  SET org_state = 'initializing', updated_at = now()
  WHERE id = _org_id;

  -- Record redemption
  INSERT INTO public.subscription_redemptions (subscription_key_id, organization_id, redeemed_by)
  VALUES (_key_id, _org_id, auth.uid());

  -- Audit log
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, organization_id, metadata)
  VALUES (auth.uid(), 'subscription_activated', 'subscription', _sub_id, _org_id,
    jsonb_build_object('plan', _plan, 'source', 'passkey', 'key_id', _key_id));

  RETURN jsonb_build_object('success', true, 'subscription_id', _sub_id, 'plan', _plan);
END;
$$;

-- Allow authenticated users to call this RPC (RLS on tables still applies)
-- The function is SECURITY DEFINER so it can write to all tables
