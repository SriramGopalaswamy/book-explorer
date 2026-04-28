-- Item 46: Deprecate payroll_records table.
--
-- All new payroll data is written to payroll_runs + payroll_entries (engine path).
-- Historical records in payroll_records remain readable until the legacy Payroll
-- Register UI is migrated. The table will be dropped once:
--   1. migrate-legacy-payroll Edge Function has been confirmed idempotent (item 31 ✓)
--   2. Payroll Register reads updated to use payroll_entries (pending)
--   3. useUpdatePayroll / useDeletePayroll updated to target payroll_entries (pending)
--
-- This migration:
--   - Marks the table deprecated via COMMENT
--   - Removes the INSERT RLS policy (no new rows should be created)
--   - Retains SELECT/UPDATE/DELETE policies for existing-row compatibility

COMMENT ON TABLE public.payroll_records IS
  'DEPRECATED (item 46, 2026-04-28): New payroll data is written to payroll_runs + payroll_entries. '
  'This table is read-only going forward; it will be dropped once the legacy Payroll Register UI '
  'is migrated to the engine path.';

-- Remove INSERT permission so the DB rejects accidental writes
DROP POLICY IF EXISTS "Users can insert their own payroll records" ON public.payroll_records;
DROP POLICY IF EXISTS "Org members can insert payroll records" ON public.payroll_records;
DROP POLICY IF EXISTS "Authenticated users can insert payroll records" ON public.payroll_records;

-- Ensure no INSERT RLS policy remains (if any was named differently)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payroll_records' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.payroll_records', pol.policyname);
  END LOOP;
END $$;
