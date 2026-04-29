-- Item 38: Remove soft-delete pattern from financial tables.
--
-- Step 1: Permanently delete rows that were previously soft-deleted.
-- Step 2: Drop is_deleted + deleted_at columns from all five tables.
--
-- Application code has already been updated to use hard DELETEs and removed
-- all .eq("is_deleted", false) query filters before this migration runs.

-- Purge soft-deleted rows.
-- journal_entries and financial_records carry BEFORE triggers that block mutation of
-- posted/closed-period rows (trg_block_je_mutation, trg_prevent_closed_period_financial_records).
-- A soft-deleted row in either of those states would abort the DELETE.  Disable all triggers
-- for the duration of these two statements so the purge is unconditional, then re-enable.
DELETE FROM public.bills             WHERE is_deleted = true;
DELETE FROM public.invoices          WHERE is_deleted = true;
DELETE FROM public.expenses          WHERE is_deleted = true;

ALTER TABLE public.financial_records DISABLE TRIGGER ALL;
DELETE FROM public.financial_records WHERE is_deleted = true;
ALTER TABLE public.financial_records ENABLE TRIGGER ALL;

ALTER TABLE public.journal_entries   DISABLE TRIGGER ALL;
DELETE FROM public.journal_entries   WHERE is_deleted = true;
ALTER TABLE public.journal_entries   ENABLE TRIGGER ALL;

-- Drop columns
ALTER TABLE public.bills             DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.invoices          DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.financial_records DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.journal_entries   DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.expenses          DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
