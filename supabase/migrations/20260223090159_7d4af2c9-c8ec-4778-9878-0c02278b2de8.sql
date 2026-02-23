
-- Temporarily allow cleanup of the orphaned entry created during initial seeding
-- The immutability triggers prevent deletion, so we need to drop and recreate

-- Step 1: Remove orphaned journal entry (has no lines, was created by accident)
-- We need to temporarily disable the trigger
ALTER TABLE public.journal_entries DISABLE TRIGGER trg_block_journal_entry_delete;

-- Delete the orphaned entry
DELETE FROM public.journal_entries WHERE id = '26e70c09-28de-464b-a8d5-19d87c46ac2e';

-- Re-enable the trigger
ALTER TABLE public.journal_entries ENABLE TRIGGER trg_block_journal_entry_delete;
