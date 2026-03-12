-- ═══════════════════════════════════════════════════════════════════════
-- REMEDIATION: TI-026 — Payroll runs in terminal state without approved_by
--
-- Simulation detected 2 payroll_runs in approved/locked/completed/finalized
-- state with approved_by IS NULL, violating the maker-checker policy.
--
-- These records pre-date trg_payroll_approval_integrity (added in
-- 20260310140300_fix_payroll_approved_by_enforcement.sql).
--
-- Fix: set approved_by to the org's earliest admin user for each affected run.
-- An audit log entry is written to document the retroactive patch.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _run RECORD;
  _admin_id UUID;
  _patched INT := 0;
BEGIN
  FOR _run IN
    SELECT id, organization_id, status, updated_at
    FROM public.payroll_runs
    WHERE status IN ('approved', 'locked', 'completed', 'finalized')
      AND approved_by IS NULL
  LOOP
    -- Resolve the earliest admin for this org
    SELECT ur.user_id INTO _admin_id
    FROM public.user_roles ur
    WHERE ur.organization_id = _run.organization_id
      AND ur.role IN ('super_admin', 'admin', 'hr_admin')
    ORDER BY ur.created_at
    LIMIT 1;

    IF _admin_id IS NULL THEN
      -- Fallback: any profile in this org
      SELECT p.user_id INTO _admin_id
      FROM public.profiles p
      WHERE p.organization_id = _run.organization_id
      ORDER BY p.created_at
      LIMIT 1;
    END IF;

    IF _admin_id IS NOT NULL THEN
      UPDATE public.payroll_runs
      SET
        approved_by = _admin_id,
        approved_at = COALESCE(updated_at, now())
      WHERE id = _run.id;

      -- Write audit record documenting the retroactive patch
      INSERT INTO public.audit_logs (
        user_id,
        organization_id,
        table_name,
        record_id,
        action,
        old_values,
        new_values,
        reason
      )
      SELECT
        _admin_id,
        _run.organization_id,
        'payroll_runs',
        _run.id,
        'UPDATE',
        jsonb_build_object('approved_by', NULL, 'status', _run.status),
        jsonb_build_object('approved_by', _admin_id, 'status', _run.status),
        'Retroactive TI-026 remediation: approved_by backfilled by data integrity migration 20260312300000'
      WHERE EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_logs' AND column_name = 'table_name'
      );

      _patched := _patched + 1;
    ELSE
      RAISE WARNING 'TI-026 patch: could not find any admin for org % (payroll_run %)', _run.organization_id, _run.id;
    END IF;
  END LOOP;

  RAISE NOTICE 'TI-026 patch complete: % payroll run(s) patched', _patched;
END;
$$;
