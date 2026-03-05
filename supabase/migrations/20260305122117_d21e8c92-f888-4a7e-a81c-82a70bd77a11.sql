
-- Drop the AFTER INSERT trigger on journal_entries since lines are always inserted
-- after the journal entry, making this trigger unable to validate balance correctly.
-- The existing BEFORE UPDATE trigger (trg_validate_journal_balance) handles posting validation.
DROP TRIGGER IF EXISTS trg_validate_journal_balance_insert ON public.journal_entries;
DROP FUNCTION IF EXISTS public.validate_journal_balance_on_insert();
