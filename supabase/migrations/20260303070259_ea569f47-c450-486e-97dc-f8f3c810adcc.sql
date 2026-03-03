-- Allow users to delete their own expenses (only draft/pending ones for safety)
CREATE POLICY "Users can delete own draft expenses"
  ON public.expenses
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND status IN ('draft', 'pending')
  );
