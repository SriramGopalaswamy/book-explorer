-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Payroll Lifecycle State Machine
--
-- Implements a proper payroll status state machine:
--   draft → under_review → approved → locked
--
-- Rules:
--   • approved records cannot be modified (except approved → locked)
--   • locked records cannot be modified at all
--   • explicit transition_payroll_status() function enforces valid paths
--   • illegal transitions are rejected with a descriptive error
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Explicit state-machine transition function ─────────────────────
CREATE OR REPLACE FUNCTION public.transition_payroll_status(
  p_run_id    UUID,
  p_new_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current TEXT;
BEGIN
  SELECT status INTO v_current
  FROM   public.payroll_runs
  WHERE  id = p_run_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payroll_run % not found', p_run_id;
  END IF;

  -- Validate transition
  IF NOT (
       (v_current = 'draft'        AND p_new_status = 'under_review')
    OR (v_current = 'under_review' AND p_new_status = 'approved')
    OR (v_current = 'approved'     AND p_new_status = 'locked')
  ) THEN
    RAISE EXCEPTION
      'Invalid payroll status transition: % → % (allowed: draft→under_review, under_review→approved, approved→locked)',
      v_current, p_new_status;
  END IF;

  UPDATE public.payroll_runs
  SET    status     = p_new_status,
         updated_at = now()
  WHERE  id = p_run_id;
END;
$$;

COMMENT ON FUNCTION public.transition_payroll_status(UUID, TEXT) IS
  'Explicit payroll status state-machine: draft→under_review→approved→locked. Rejects all illegal transitions.';

-- ── 2. Trigger function: block modifications on approved / locked ──────
CREATE OR REPLACE FUNCTION public.enforce_payroll_run_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow approved → locked transition (the only permitted mutation on approved)
  IF OLD.status = 'approved' AND NEW.status = 'locked'
     AND OLD.id = NEW.id THEN
    RETURN NEW;
  END IF;

  -- Block all other changes to approved records
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION
      'payroll_run % is in approved state and cannot be modified (except locking). Use transition_payroll_status() to lock.',
      OLD.id;
  END IF;

  -- Block all changes to locked records
  IF OLD.status = 'locked' THEN
    RAISE EXCEPTION
      'payroll_run % is locked and immutable.',
      OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop old terminal-state trigger if it already covers payroll_runs,
-- then install the new, more precise one.
DROP TRIGGER IF EXISTS enforce_payroll_run_immutability ON public.payroll_runs;

CREATE TRIGGER enforce_payroll_run_immutability
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payroll_run_immutability();

-- ── 3. Ensure status constraint covers all state-machine values ───────
-- (Idempotent — already set by 20260310130000 but re-applied here for
--  safety in case the migration was not applied)
ALTER TABLE public.payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_status_check;

ALTER TABLE public.payroll_runs
  ADD CONSTRAINT payroll_runs_status_check
  CHECK (status IN (
    'draft',
    'processing',
    'computed',
    'under_review',
    'approved',
    'locked',
    'completed',
    'finalized',
    'failed',
    'cancelled'
  ));

-- ── Verification hint ──────────────────────────────────────────────────
-- SELECT transition_payroll_status('<run_id>', 'under_review');  -- OK
-- SELECT transition_payroll_status('<run_id>', 'locked');        -- FAIL (illegal)
