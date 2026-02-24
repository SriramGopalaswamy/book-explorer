
-- Fix DELETE policy to allow deleting rejected plans too
DROP POLICY IF EXISTS "Users can delete own draft goal plans" ON public.goal_plans;
CREATE POLICY "Users can delete own draft or rejected goal plans"
  ON public.goal_plans
  FOR DELETE
  USING (auth.uid() = user_id AND status IN ('draft', 'rejected'));
