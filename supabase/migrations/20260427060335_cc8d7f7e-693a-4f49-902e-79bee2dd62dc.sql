CREATE OR REPLACE FUNCTION public.is_org_admin_or_hr(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'hr', 'payroll')
      AND organization_id = _org_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_org_admin_or_finance(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'finance', 'payroll')
      AND organization_id = _org_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_org_admin_hr_or_manager(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'hr', 'manager', 'payroll')
      AND organization_id = _org_id
  );
$function$;

DROP POLICY IF EXISTS "Org payroll can view profiles" ON public.profiles;
CREATE POLICY "Org payroll can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id = profiles.organization_id
      AND ur.role = 'payroll'
  )
);