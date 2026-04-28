-- Item 38: Remove soft-delete pattern from financial tables.
--
-- Step 1: Permanently delete rows that were previously soft-deleted.
-- Step 2: Drop is_deleted + deleted_at columns from all five tables.
--
-- Application code has already been updated to use hard DELETEs and removed
-- all .eq("is_deleted", false) query filters before this migration runs.

-- Purge soft-deleted rows
DELETE FROM public.bills             WHERE is_deleted = true;
DELETE FROM public.invoices          WHERE is_deleted = true;
DELETE FROM public.financial_records WHERE is_deleted = true;
DELETE FROM public.journal_entries   WHERE is_deleted = true;
DELETE FROM public.expenses          WHERE is_deleted = true;

-- Drop columns
ALTER TABLE public.bills             DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.invoices          DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.financial_records DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.journal_entries   DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.expenses          DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
