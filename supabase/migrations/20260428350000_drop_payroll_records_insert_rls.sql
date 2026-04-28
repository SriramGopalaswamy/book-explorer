-- Follow-on to item 46 / migration 20260428330000:
--
-- Migration 20260428330000 temporarily restored an INSERT policy on
-- payroll_records because useBulkUpload.ts (usePayrollBulkUpload) still wrote
-- there for new pay-period rows.
--
-- usePayrollBulkUpload in Payroll.tsx has now been replaced by
-- usePayrollRegisterBulkUpload, which writes only to payroll_runs + payroll_entries
-- (engine path). The legacy INSERT policy is no longer needed.
--
-- payroll_records is now fully read-only from the application layer:
--   - SELECT  : retained for legacy Register display and dispute resolution
--   - UPDATE  : retained for is_superseded flag and status transitions on legacy rows
--   - DELETE  : retained for bulk-delete of draft/cancelled legacy records
--   - INSERT  : blocked (no new rows should be created)

DROP POLICY IF EXISTS "Org members can insert payroll records" ON public.payroll_records;
