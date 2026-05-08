
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata';

CREATE OR REPLACE FUNCTION public.validate_organization_timezone()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone
  ) THEN
    RAISE EXCEPTION 'Invalid timezone: %', NEW.timezone;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_org_timezone ON public.organizations;
CREATE TRIGGER trg_validate_org_timezone
  BEFORE INSERT OR UPDATE OF timezone ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.validate_organization_timezone();

CREATE OR REPLACE FUNCTION public.get_org_timezone(p_org_id uuid DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT timezone FROM public.organizations
  WHERE id = COALESCE(p_org_id, public.get_user_organization_id(auth.uid()))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.org_now()
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT now();
$$;

GRANT EXECUTE ON FUNCTION public.get_org_timezone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_now() TO authenticated;
