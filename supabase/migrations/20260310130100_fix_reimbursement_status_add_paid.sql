-- ═══════════════════════════════════════════════════════════════════════
-- FIX: reimbursement_requests.status — add 'paid' terminal state
--
-- Original constraint: ('submitted', 'approved', 'rejected')
-- The finance team approves and then marks as paid after bank transfer.
-- 'paid' is a real business state that was missing from the schema
-- but was being used in the Multi-Role simulation (MR-Reimb workflow).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.reimbursement_requests
  DROP CONSTRAINT IF EXISTS reimbursement_requests_status_check;

ALTER TABLE public.reimbursement_requests
  ADD CONSTRAINT reimbursement_requests_status_check
  CHECK (status IN (
    'submitted',   -- employee filed the request
    'approved',    -- manager / finance approved
    'rejected',    -- request denied
    'paid'         -- finance processed the bank transfer / cash disbursement
  ));

-- Partial index to quickly find unprocessed requests in approval queues
CREATE INDEX IF NOT EXISTS idx_reimb_requests_pending
  ON public.reimbursement_requests(organization_id, status)
  WHERE status IN ('submitted', 'approved');
