ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS allow_email_signin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_email_signup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_google_signin boolean NOT NULL DEFAULT false;