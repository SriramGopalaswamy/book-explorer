-- Item 40: Rename journal_entry_lines.entry_id → journal_entry_id.
--
-- journal_entry_lines is a legacy accounting table (20260217103000).
-- The modern table is journal_lines. No src/ code reads journal_entry_lines.
-- Renaming makes the column name consistent with journal_lines.journal_entry_id.

ALTER TABLE public.journal_entry_lines
  RENAME COLUMN entry_id TO journal_entry_id;

-- Update the index that references the old column name
DROP INDEX IF EXISTS public.idx_journal_entry_lines_entry;
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry
  ON public.journal_entry_lines(journal_entry_id);

DROP INDEX IF EXISTS public.idx_journal_entry_lines_account;
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account
  ON public.journal_entry_lines(account_id, journal_entry_id);
