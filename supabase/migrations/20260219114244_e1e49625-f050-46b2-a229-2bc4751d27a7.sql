-- Fix credit_notes RLS: separate the ALL policy into explicit operations
-- so Finance/Admin have proper WITH CHECK for INSERT

-- Drop the existing ALL policy
DROP POLICY IF EXISTS "Finance and admin can manage credit notes" ON public.credit_notes;

-- Recreate as separate policies with explicit WITH CHECK for INSERT
CREATE POLICY "Finance and admin can insert credit notes"
  ON public.credit_notes FOR INSERT
  WITH CHECK (is_admin_or_finance(auth.uid()) AND auth.uid() = user_id);

CREATE POLICY "Finance and admin can update credit notes"
  ON public.credit_notes FOR UPDATE
  USING (is_admin_or_finance(auth.uid()));

CREATE POLICY "Finance and admin can delete credit notes"
  ON public.credit_notes FOR DELETE
  USING (is_admin_or_finance(auth.uid()));