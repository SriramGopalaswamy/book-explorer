-- ═══════════════════════════════════════════════════════════════════════
-- FIX: payroll_runs.status CHECK constraint
--
-- The original constraint (payroll_safety.sql) only allowed:
--   ('draft', 'pending', 'processed', 'cancelled')
--
-- But the Payroll Approval Workflow migration (phase7) added a state machine
-- with transitions: draft → under_review → approved → locked
-- and later migrations reference: 'processing', 'computed', 'completed',
-- 'finalized', 'failed' — none of which fit the original constraint.
--
-- This caused every WF8 / MR-Payroll status update to violate the CHECK,
-- silently failing or being blocked by the DB engine.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_status_check;

ALTER TABLE public.payroll_runs
  ADD CONSTRAINT payroll_runs_status_check
  CHECK (status IN (
    'draft',          -- initial state, editable
    'processing',     -- calculation running (async)
    'computed',       -- calculation complete, ready for review
    'under_review',   -- submitted to reviewer (maker)
    'approved',       -- reviewer approved (checker) → next step is lock
    'locked',         -- immutable; payslips dispatched
    'completed',      -- alias used by older code paths (≡ locked)
    'finalized',      -- alias used by payroll engine (≡ locked)
    'failed',         -- calculation or posting error
    'cancelled'       -- voided before locking
  ));

-- Add index on status for the common audit queries
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status
  ON public.payroll_runs(status)
  WHERE status NOT IN ('locked', 'completed', 'finalized');
