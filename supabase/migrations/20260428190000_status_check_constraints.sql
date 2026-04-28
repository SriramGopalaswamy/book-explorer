-- Item 26: CHECK constraints on status columns for tables that lacked them.
--
-- invoices, bills, purchase_orders, sales_orders, payroll_runs: already constrained.
--
-- leave_requests: inline CHECK only covers ('pending','approved','rejected') but
--   'cancelled' has been used in practice — expand it.
--
-- payroll_records: default='draft', values seen: draft, completed, approved, superseded.
--
-- payroll_entries: default='computed', values documented: computed, approved, locked.

-- ─── leave_requests: expand to include 'cancelled' ────────────────────────────

ALTER TABLE public.leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_status_check;

ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

-- ─── payroll_records ──────────────────────────────────────────────────────────

ALTER TABLE public.payroll_records
  DROP CONSTRAINT IF EXISTS payroll_records_status_check;

ALTER TABLE public.payroll_records
  ADD CONSTRAINT payroll_records_status_check
  CHECK (status IN (
    'draft',        -- editable, not yet processed
    'completed',    -- processed by payroll engine
    'approved',     -- HR/Finance sign-off
    'superseded'    -- replaced by a revised payroll record
  ));

-- ─── payroll_entries ─────────────────────────────────────────────────────────

ALTER TABLE public.payroll_entries
  DROP CONSTRAINT IF EXISTS payroll_entries_status_check;

ALTER TABLE public.payroll_entries
  ADD CONSTRAINT payroll_entries_status_check
  CHECK (status IN (
    'computed',     -- calculated, not yet approved
    'approved',     -- approved, ready for disbursement
    'locked'        -- immutable post-disbursement
  ));
