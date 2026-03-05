-- Temporarily disable mutation triggers to clean up chaos test data
ALTER TABLE public.journal_lines DISABLE TRIGGER trg_block_jl_mutation;
ALTER TABLE public.journal_lines DISABLE TRIGGER trg_immutable_jl;
ALTER TABLE public.journal_entries DISABLE TRIGGER trg_block_je_mutation;
ALTER TABLE public.journal_entries DISABLE TRIGGER trg_immutable_je;
ALTER TABLE public.journal_entries DISABLE TRIGGER trg_validate_journal_balance;

-- Delete chaos imbalanced draft entries
DELETE FROM public.journal_lines WHERE journal_entry_id IN (
  SELECT id FROM public.journal_entries WHERE memo LIKE 'Chaos:%' AND status = 'draft'
);
DELETE FROM public.journal_entries WHERE memo LIKE 'Chaos:%' AND status = 'draft';

-- Re-enable all triggers
ALTER TABLE public.journal_lines ENABLE TRIGGER trg_block_jl_mutation;
ALTER TABLE public.journal_lines ENABLE TRIGGER trg_immutable_jl;
ALTER TABLE public.journal_entries ENABLE TRIGGER trg_block_je_mutation;
ALTER TABLE public.journal_entries ENABLE TRIGGER trg_immutable_je;
ALTER TABLE public.journal_entries ENABLE TRIGGER trg_validate_journal_balance;