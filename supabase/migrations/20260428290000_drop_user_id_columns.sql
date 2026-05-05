-- Item 36: Drop legacy user_id columns from the four tables that were migrated
-- to profile_id in 20260224051635.
--
-- Safety guards: abort with an error if any row still has a NULL profile_id,
-- which would indicate the backfill did not complete and the column is still
-- needed for data integrity.
--
-- Tables: attendance_records, expenses, payroll_records, reimbursement_requests

DO $$
DECLARE
  null_count INTEGER;
BEGIN
  -- attendance_records
  SELECT COUNT(*) INTO null_count FROM public.attendance_records WHERE profile_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'attendance_records has % rows with NULL profile_id — run backfill first', null_count;
  END IF;

  -- expenses
  SELECT COUNT(*) INTO null_count FROM public.expenses WHERE profile_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'expenses has % rows with NULL profile_id — run backfill first', null_count;
  END IF;

  -- payroll_records
  SELECT COUNT(*) INTO null_count FROM public.payroll_records WHERE profile_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'payroll_records has % rows with NULL profile_id — run backfill first', null_count;
  END IF;

  -- reimbursement_requests
  SELECT COUNT(*) INTO null_count FROM public.reimbursement_requests WHERE profile_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'reimbursement_requests has % rows with NULL profile_id — run backfill first', null_count;
  END IF;
END $$;

-- Drop the auto-populate trigger from expenses (no longer needed after this migration)
DROP TRIGGER IF EXISTS trg_expense_profile_id ON public.expenses;
DROP FUNCTION IF EXISTS public.auto_set_expense_profile_id();

-- Drop user_id columns
ALTER TABLE public.attendance_records      DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.expenses                DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.payroll_records         DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.reimbursement_requests  DROP COLUMN IF EXISTS user_id;
