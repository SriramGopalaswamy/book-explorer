-- Regression fix: the item-46 deprecation migration (20260428310000) removed
-- all INSERT RLS policies from payroll_records. useBulkUpload.ts still writes
-- there for pay_period de-duplication (UPDATE-or-INSERT), so browser-side bulk
-- uploads of new pay periods were failing with "permission denied".
--
-- This restores a scoped INSERT policy until useBulkUpload is fully migrated
-- to payroll_entries + payroll_runs (tracked as follow-on to item 46).

DROP POLICY IF EXISTS "Org members can insert payroll records" ON public.payroll_records;

CREATE POLICY "Org members can insert payroll records"
  ON public.payroll_records FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.user_roles
      WHERE user_id = auth.uid()
    )
  );
