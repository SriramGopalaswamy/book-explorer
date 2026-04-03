-- Add JSONB column to organization_settings for admin email alert configuration
-- This stores the full email alert config (sender info + per-rule settings) as JSON
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS email_alert_config jsonb DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN public.organization_settings.email_alert_config IS
  'Admin-configurable email alert settings: sender email/name, per-rule enable/disable, frequency, schedule';
