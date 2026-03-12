-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Governance Controls — Maker-Checker Enforcement
--
-- Rule: approved_by (or reviewer/approver column) MUST differ from the
--       record creator (user_id / created_by / requested_by).
--
-- Apply to:
--   bills              — user_id  vs approved_by
--   expenses           — user_id  vs approved_by (if column exists)
--   reimbursement_requests — profile_id / user_id vs manager_reviewed_by
--   journal_entries    — created_by vs approved_by
--   payroll_runs       — generated_by vs approved_by
--   approval_requests  — requested_by vs approved_by
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Generic maker-checker trigger function ─────────────────────────
-- Creator column and approver column are passed via tgargs (TG_ARGV).
CREATE OR REPLACE FUNCTION public.enforce_maker_checker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _creator_col  TEXT := TG_ARGV[0];  -- e.g. 'user_id'
  _approver_col TEXT := TG_ARGV[1];  -- e.g. 'approved_by'
  _creator_val  UUID;
  _approver_val UUID;
  _row_json     JSONB;
BEGIN
  _row_json := row_to_json(NEW)::JSONB;

  _creator_val  := (_row_json ->> _creator_col)::UUID;
  _approver_val := (_row_json ->> _approver_col)::UUID;

  -- Only enforce when approver is being set to a non-null value
  IF _approver_val IS NULL THEN
    RETURN NEW;
  END IF;

  IF _creator_val IS NOT NULL AND _creator_val = _approver_val THEN
    RAISE EXCEPTION
      'Maker-checker violation on %: creator (%) cannot also be the approver (%)',
      TG_TABLE_NAME, _creator_col, _approver_col
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_maker_checker() IS
  'Generic maker-checker trigger. Takes two TG_ARGV arguments: creator_column, approver_column.';

-- ── 2. bills — user_id vs approved_by ────────────────────────────────
DROP TRIGGER IF EXISTS trg_bills_maker_checker ON public.bills;
CREATE TRIGGER trg_bills_maker_checker
  BEFORE INSERT OR UPDATE ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_maker_checker('user_id', 'approved_by');

-- ── 3. reimbursement_requests — user_id vs manager_reviewed_by ───────
DROP TRIGGER IF EXISTS trg_reimb_maker_checker ON public.reimbursement_requests;
CREATE TRIGGER trg_reimb_maker_checker
  BEFORE INSERT OR UPDATE ON public.reimbursement_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_maker_checker('user_id', 'manager_reviewed_by');

-- ── 4. journal_entries — created_by vs approved_by ───────────────────
-- Only applies if journal_entries has an approved_by column; use a
-- separate narrow trigger function to avoid errors on tables that lack it.
CREATE OR REPLACE FUNCTION public.enforce_journal_maker_checker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row_json JSONB;
  _creator  UUID;
  _approver UUID;
BEGIN
  _row_json := row_to_json(NEW)::JSONB;
  _creator  := (_row_json ->> 'created_by')::UUID;
  _approver := (_row_json ->> 'approved_by')::UUID;

  IF _approver IS NOT NULL AND _creator IS NOT NULL AND _creator = _approver THEN
    RAISE EXCEPTION
      'Maker-checker violation: journal created_by and approved_by cannot be the same user (%)',
      _creator
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_maker_checker ON public.journal_entries;
CREATE TRIGGER trg_journal_maker_checker
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_maker_checker();

-- ── 5. payroll_runs — generated_by vs approved_by ────────────────────
DROP TRIGGER IF EXISTS trg_payroll_maker_checker ON public.payroll_runs;
CREATE TRIGGER trg_payroll_maker_checker
  BEFORE INSERT OR UPDATE ON public.payroll_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_maker_checker('generated_by', 'approved_by');

-- ── 6. approval_requests — requested_by vs approved_by ───────────────
DROP TRIGGER IF EXISTS trg_approval_req_maker_checker ON public.approval_requests;
CREATE TRIGGER trg_approval_req_maker_checker
  BEFORE INSERT OR UPDATE ON public.approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_maker_checker('requested_by', 'approved_by');

-- ── Verification hint ─────────────────────────────────────────────────
-- The following should raise check_violation:
--
--   UPDATE public.bills SET approved_by = user_id WHERE id = '<same_user>';
--
-- And this should succeed (different users):
--   UPDATE public.bills SET approved_by = '<different_user_uuid>' WHERE id = '...';
