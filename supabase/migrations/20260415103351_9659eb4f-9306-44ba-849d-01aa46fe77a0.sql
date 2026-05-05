ALTER TABLE public.organization_settings 
  ADD COLUMN IF NOT EXISTS sso_domain text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sso_only boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_ms365_sync_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ms365_provisioned_count integer DEFAULT 0;