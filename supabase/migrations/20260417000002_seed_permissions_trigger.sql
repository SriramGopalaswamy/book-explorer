-- Auto-seed role permissions whenever a new organisation is created.
-- Fires AFTER INSERT on organisations so the org row is committed before seeding.

CREATE OR REPLACE FUNCTION public.on_org_created_seed_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_role_permissions(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_role_permissions_on_org_create ON public.organizations;

CREATE TRIGGER trg_seed_role_permissions_on_org_create
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.on_org_created_seed_permissions();

COMMENT ON TRIGGER trg_seed_role_permissions_on_org_create ON public.organizations IS
  'Seeds default role_permissions rows for every new organisation automatically.';
