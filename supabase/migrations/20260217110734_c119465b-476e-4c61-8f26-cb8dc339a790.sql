-- Allow managers to view their direct reports' profiles
CREATE POLICY "Managers can view direct reports profiles"
ON public.profiles
FOR SELECT
USING (
  manager_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
