-- AI usage quota table: tracks per-org monthly AI agent request counts.
-- The ai-agent Edge Function uses the service_role key, so no user-facing
-- RLS SELECT policy is needed here. Super-admins can read via service_role.
CREATE TABLE IF NOT EXISTS ai_usage_quotas (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month           TEXT NOT NULL,           -- YYYY-MM
  request_count   INTEGER NOT NULL DEFAULT 0,
  quota_limit     INTEGER NOT NULL DEFAULT 500,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, month)
);

ALTER TABLE ai_usage_quotas ENABLE ROW LEVEL SECURITY;

-- Atomically increment request_count and return the new value.
-- SECURITY DEFINER so the Edge Function (service_role) can call it even if
-- the user JWT doesn't have direct INSERT rights on this table.
CREATE OR REPLACE FUNCTION increment_ai_usage(p_org_id UUID, p_month TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO ai_usage_quotas (organization_id, month, request_count, updated_at)
  VALUES (p_org_id, p_month, 1, now())
  ON CONFLICT (organization_id, month) DO UPDATE
    SET request_count = ai_usage_quotas.request_count + 1,
        updated_at    = now()
  RETURNING request_count INTO v_count;
  RETURN v_count;
END;
$$;
