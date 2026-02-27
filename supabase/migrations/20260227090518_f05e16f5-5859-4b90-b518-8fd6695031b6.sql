
-- Helper: check if the calling user is the manager of a given profile_id
CREATE OR REPLACE FUNCTION public.is_manager_of_profile(_user_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles mgr
    JOIN public.profiles emp ON emp.manager_id = mgr.id
    WHERE mgr.user_id = _user_id
      AND emp.id = _profile_id
  );
$$;

-- Managers can view their direct reports' change requests
CREATE POLICY "Managers can view direct reports change requests"
ON public.profile_change_requests
FOR SELECT
TO authenticated
USING (is_manager_of_profile(auth.uid(), profile_id));

-- Managers can update (approve/reject) their direct reports' change requests
CREATE POLICY "Managers can update direct reports change requests"
ON public.profile_change_requests
FOR UPDATE
TO authenticated
USING (is_manager_of_profile(auth.uid(), profile_id))
WITH CHECK (is_manager_of_profile(auth.uid(), profile_id));
