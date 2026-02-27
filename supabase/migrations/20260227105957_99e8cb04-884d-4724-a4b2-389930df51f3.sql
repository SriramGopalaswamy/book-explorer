
-- Fix: manager_id stores profile.id, not auth.uid()
-- Must compare manager_id against get_current_user_profile_id()

-- Drop broken policies
DROP POLICY IF EXISTS "Managers can view direct reports expenses" ON public.expenses;
DROP POLICY IF EXISTS "Managers can update direct reports expenses" ON public.expenses;

-- Recreate with correct join
CREATE POLICY "Managers can view direct reports expenses"
ON public.expenses FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = expenses.profile_id
      AND p.manager_id = get_current_user_profile_id()
  )
);

CREATE POLICY "Managers can update direct reports expenses"
ON public.expenses FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = expenses.profile_id
      AND p.manager_id = get_current_user_profile_id()
  )
);
