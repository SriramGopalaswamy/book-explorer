
-- Temporarily disable triggers to clean up corrupted chaos test data
ALTER TABLE public.journal_lines DISABLE TRIGGER trg_block_jl_mutation;
ALTER TABLE public.journal_lines DISABLE TRIGGER trg_immutable_jl;
ALTER TABLE public.journal_entries DISABLE TRIGGER trg_block_je_mutation;
ALTER TABLE public.journal_entries DISABLE TRIGGER trg_immutable_je;
ALTER TABLE public.journal_entries DISABLE TRIGGER block_locked_or_archived_journal_entries;

-- Delete the imbalanced chaos test entries
DELETE FROM journal_lines WHERE journal_entry_id IN (
  '7ff1ddb9-1d28-4a82-a57c-7b86a7b725b4',
  '9d3c3e8c-266c-48cf-98fe-d5a74d76c06b'
);
DELETE FROM journal_entries WHERE id IN (
  '7ff1ddb9-1d28-4a82-a57c-7b86a7b725b4',
  '9d3c3e8c-266c-48cf-98fe-d5a74d76c06b'
);

-- Re-enable all triggers
ALTER TABLE public.journal_lines ENABLE TRIGGER trg_block_jl_mutation;
ALTER TABLE public.journal_lines ENABLE TRIGGER trg_immutable_jl;
ALTER TABLE public.journal_entries ENABLE TRIGGER trg_block_je_mutation;
ALTER TABLE public.journal_entries ENABLE TRIGGER trg_immutable_je;
ALTER TABLE public.journal_entries ENABLE TRIGGER block_locked_or_archived_journal_entries;
