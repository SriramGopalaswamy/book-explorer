CREATE OR REPLACE FUNCTION public.is_admin_in_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _user_id
      AND p.organization_id = _org_id
      AND public.has_role(_user_id, 'admin'::app_role)
  )
$$;

DROP POLICY IF EXISTS "Users can delete their own adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS org_sa_delete ON public.stock_adjustments;

CREATE POLICY org_sa_delete ON public.stock_adjustments
FOR DELETE TO authenticated
USING (
  status = 'draft'
  AND public.is_admin_in_org(auth.uid(), organization_id)
);