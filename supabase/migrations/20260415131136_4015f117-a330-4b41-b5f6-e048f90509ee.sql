INSERT INTO public.organization_settings (organization_id, sso_domain, sso_only, ms365_provisioned_count, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'grx10.com', false, 0, now())
ON CONFLICT (organization_id) DO NOTHING;