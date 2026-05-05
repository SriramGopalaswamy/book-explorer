-- Leave types RLS: restrict INSERT/UPDATE/DELETE to HR and Admin roles.
--
-- Previously, leave_types had no write policies — the only enforcement was an
-- application-side role check in useCreateLeaveType / useUpdateLeaveType
-- (useLeaves.ts), which can be bypassed by direct API calls.
--
-- This migration adds DB-level policies so the check is authoritative regardless
-- of the caller. Helper functions (is_org_member, is_admin_or_hr_in_org,
-- is_admin_in_org) are defined in migration 20260325000001.

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

-- Drop the legacy FOR ALL policy (migration 20260223102730) before adding
-- role-split policies. RLS is permissive by default, so the old policy would
-- keep authorising HR deletes and make the new Admin-only DELETE restriction
-- ineffective if left in place.
DROP POLICY IF EXISTS "HR and Admin can manage leave types" ON public.leave_types;

-- SELECT: all org members can read leave types
DROP POLICY IF EXISTS "Org members can view leave types" ON public.leave_types;
CREATE POLICY "Org members can view leave types"
  ON public.leave_types FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

-- INSERT: HR and Admin only
DROP POLICY IF EXISTS "HR or Admin can create leave types" ON public.leave_types;
CREATE POLICY "HR or Admin can create leave types"
  ON public.leave_types FOR INSERT
  WITH CHECK (is_admin_or_hr_in_org(auth.uid(), organization_id));

-- UPDATE: HR and Admin only
DROP POLICY IF EXISTS "HR or Admin can update leave types" ON public.leave_types;
CREATE POLICY "HR or Admin can update leave types"
  ON public.leave_types FOR UPDATE
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

-- DELETE: Admin only (deleting a leave type is destructive)
DROP POLICY IF EXISTS "Admin can delete leave types" ON public.leave_types;
CREATE POLICY "Admin can delete leave types"
  ON public.leave_types FOR DELETE
  USING (is_admin_in_org(auth.uid(), organization_id));
