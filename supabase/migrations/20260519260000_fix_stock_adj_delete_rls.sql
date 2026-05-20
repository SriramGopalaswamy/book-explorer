BEGIN;

-- KAN-768: Admin (and any org member) cannot delete stock adjustments.
--
-- Migration 20260514074512 replaced the broad org-membership DELETE policy
-- with one that requires is_admin_in_org(), which calls has_role() against
-- the user_roles table. Admins whose role is stored only in profiles.role
-- (not in user_roles) fail the check silently — the delete returns 0 rows
-- and the frontend shows "Adjustment not found or could not be deleted."
--
-- The UI already restricts the Delete button to status='draft' rows, so
-- the status guard in the DB policy is redundant. Replace with the same
-- org-membership pattern used by INSERT/SELECT/UPDATE.

DROP POLICY IF EXISTS org_sa_delete ON public.stock_adjustments;

CREATE POLICY org_sa_delete ON public.stock_adjustments
  FOR DELETE TO authenticated
  USING (
    status = 'draft'
    AND organization_id IN (
      SELECT organization_id
      FROM public.profiles
      WHERE user_id = auth.uid()
    )
  );

COMMIT;
