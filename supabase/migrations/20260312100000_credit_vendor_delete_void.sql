-- Allow users to delete their own credit notes in 'draft' or 'void' status.
-- The org finance "FOR ALL" policy already covers finance users without restriction.
-- This policy covers individual non-finance users.

-- CREDIT NOTES
DROP POLICY IF EXISTS "Users can delete own draft or void credit notes" ON public.credit_notes;

CREATE POLICY "Users can delete own draft or void credit notes"
  ON public.credit_notes FOR DELETE
  USING (
    auth.uid() = user_id
    AND organization_id = get_user_organization_id(auth.uid())
    AND status IN ('draft', 'void')
  );

-- VENDOR CREDITS
DROP POLICY IF EXISTS "Users can delete own draft or void vendor credits" ON public.vendor_credits;

CREATE POLICY "Users can delete own draft or void vendor credits"
  ON public.vendor_credits FOR DELETE
  USING (
    auth.uid() = user_id
    AND organization_id = get_user_organization_id(auth.uid())
    AND status IN ('draft', 'void')
  );
