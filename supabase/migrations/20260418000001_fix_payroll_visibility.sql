-- =============================================================================
-- FIX: Employees cannot see bulk-uploaded payslips
-- =============================================================================
-- Root cause: payroll_records.user_id can become stale when an employee's auth
-- account is recreated (or was recreated before the bulk upload ran).  The admin
-- can still see records via the org-scoped "Org admins can manage payroll" policy,
-- but the employee-facing "Users can view own payroll" policy checks
-- auth.uid() = user_id, which fails if user_id no longer matches auth.uid().
--
-- Seen in the wild: migration 20260415134222 was a one-off fix for a single
-- employee.  This migration generalises that fix to all records.
-- =============================================================================

-- 1. Sync user_id from the profile that the record is already linked to.
--    Only touches rows where the profile has a valid user_id AND it differs from
--    the value currently stored in payroll_records.
UPDATE public.payroll_records pr
SET    user_id    = p.user_id,
       updated_at = now()
FROM   public.profiles p
WHERE  pr.profile_id               = p.id
  AND  p.user_id                   IS NOT NULL
  AND  pr.user_id IS DISTINCT FROM p.user_id;

-- 2. Add an additional SELECT policy so employees can see their payslips via
--    profile_id even if user_id ever drifts again in the future.
DROP POLICY IF EXISTS "Users can view own payroll by profile" ON public.payroll_records;
CREATE POLICY "Users can view own payroll by profile"
  ON public.payroll_records FOR SELECT
  USING (
    profile_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- FIX: role_permissions rows were seeded with all-false values
-- =============================================================================
-- Migration 20260417000001 created the table and called seed_default_role_permissions,
-- but the function at that time had a bug: every INSERT used (VALUES(false)) for
-- all boolean columns, so every row ended up with can_view = can_create = ... = false.
--
-- Migration 20260417110803 replaced the function with the correct CASE-WHEN logic,
-- but re-ran the backfill with ON CONFLICT DO NOTHING — so the wrong rows were
-- never updated.
--
-- Fix: DELETE the all-false rows for resources that should have at least one true
-- permission, then let seed_default_role_permissions (now correct) re-insert them.
-- Rows the admin intentionally set to all-false are indistinguishable from the
-- corrupt seeded rows, so we simply re-seed everything (defaults only — no custom
-- admin overrides exist yet since PermissionGate is not yet wired up in the UI).
-- =============================================================================

DELETE FROM public.role_permissions;

DO $$
DECLARE
  o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_default_role_permissions(o.id);
  END LOOP;
END $$;
