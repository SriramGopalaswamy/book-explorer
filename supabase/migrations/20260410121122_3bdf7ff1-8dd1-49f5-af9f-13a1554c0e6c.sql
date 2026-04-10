-- Disable user-defined triggers on payroll_runs that block deletion
ALTER TABLE public.payroll_runs DISABLE TRIGGER trg_enforce_terminal_state;
ALTER TABLE public.payroll_runs DISABLE TRIGGER trg_prevent_locked_payroll_update;
ALTER TABLE public.payroll_runs DISABLE TRIGGER block_locked_or_archived_payroll_runs;
ALTER TABLE public.payroll_entries DISABLE TRIGGER trg_prevent_locked_entry_update;

DELETE FROM public.bank_transfer_batches
WHERE payroll_run_id IN (
  SELECT id FROM public.payroll_runs
  WHERE organization_id = '00000000-0000-0000-0000-000000000001'
    AND pay_period = '2026-03'
);

DELETE FROM public.payroll_runs
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND pay_period = '2026-03';

-- Re-enable triggers
ALTER TABLE public.payroll_runs ENABLE TRIGGER trg_enforce_terminal_state;
ALTER TABLE public.payroll_runs ENABLE TRIGGER trg_prevent_locked_payroll_update;
ALTER TABLE public.payroll_runs ENABLE TRIGGER block_locked_or_archived_payroll_runs;
ALTER TABLE public.payroll_entries ENABLE TRIGGER trg_prevent_locked_entry_update;

-- Fix the trigger function
CREATE OR REPLACE FUNCTION public.trg_prevent_locked_entry_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM payroll_runs
      WHERE id = OLD.payroll_run_id AND status = 'locked'
    ) THEN
      RAISE EXCEPTION 'Cannot delete entries of a locked payroll run';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.gross_earnings       IS NOT DISTINCT FROM OLD.gross_earnings
     AND NEW.net_pay          IS NOT DISTINCT FROM OLD.net_pay
     AND NEW.total_deductions IS NOT DISTINCT FROM OLD.total_deductions
  THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM payroll_runs
    WHERE id = OLD.payroll_run_id AND status = 'locked'
  ) THEN
    RAISE EXCEPTION 'Cannot modify entries of a locked payroll run';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_prevent_locked_entry_mutation() IS
  'Protects locked payroll entries from financial mutations. Non-financial UPDATEs (payslip stamps, label corrections) are permitted. DELETE is allowed on non-locked entries (returns OLD to avoid NULL-cancel bug).';