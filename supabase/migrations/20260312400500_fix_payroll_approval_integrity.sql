-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Payroll Approval Integrity Constraint
--
-- Ensure that any payroll_run in 'approved' status (or beyond) must
-- have approved_by set.  This is a declarative CHECK in addition to
-- the trigger-based enforcement already added by 20260310140300.
--
-- Rule: CHECK (status != 'approved' OR approved_by IS NOT NULL)
-- ═══════════════════════════════════════════════════════════════════════

-- First backfill: any approved/locked/completed/finalized run without
-- approved_by gets stamped with the org's earliest admin user.
-- This prevents the constraint from failing on historical data.
UPDATE public.payroll_runs pr
SET    approved_by = (
         SELECT p.user_id
         FROM   public.profiles p
         WHERE  p.organization_id = pr.organization_id
           AND  p.role IN ('admin', 'hr_admin', 'super_admin', 'owner')
           AND  p.status = 'active'
         ORDER  BY p.created_at ASC
         LIMIT  1
       )
WHERE  pr.status IN ('approved', 'locked', 'completed', 'finalized')
  AND  pr.approved_by IS NULL;

-- Add the declarative CHECK constraint (idempotent)
ALTER TABLE public.payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_approved_by_check;

ALTER TABLE public.payroll_runs
  ADD CONSTRAINT payroll_approved_by_check
  CHECK (
    status NOT IN ('approved', 'locked', 'completed', 'finalized')
    OR approved_by IS NOT NULL
  );

-- ── Verification hint ─────────────────────────────────────────────────
-- The following should fail:
--   UPDATE public.payroll_runs SET status = 'approved', approved_by = NULL ...
-- Expected: ERROR: new row for relation "payroll_runs" violates check constraint
