
CREATE OR REPLACE FUNCTION public.sandbox_force_delete_journal_data(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_sandbox boolean;
BEGIN
  -- Safety: only allow on sandbox orgs
  SELECT (environment_type = 'sandbox') INTO _is_sandbox
  FROM organizations WHERE id = _org_id;
  
  IF NOT _is_sandbox THEN
    RAISE EXCEPTION 'Cannot force-delete journal data for non-sandbox organization';
  END IF;

  -- Disable specific named triggers (NOT system triggers)
  ALTER TABLE public.journal_lines DISABLE TRIGGER trg_block_jl_mutation;
  ALTER TABLE public.journal_lines DISABLE TRIGGER trg_immutable_jl;
  ALTER TABLE public.journal_entries DISABLE TRIGGER trg_block_je_mutation;
  ALTER TABLE public.journal_entries DISABLE TRIGGER trg_immutable_je;
  ALTER TABLE public.journal_entries DISABLE TRIGGER trg_validate_journal_balance;
  ALTER TABLE public.journal_entries DISABLE TRIGGER block_locked_or_archived_journal_entries;
  
  -- Delete journal lines first (FK child)
  DELETE FROM public.journal_lines WHERE journal_entry_id IN (
    SELECT id FROM public.journal_entries WHERE organization_id = _org_id
  );
  
  -- Delete journal entries
  DELETE FROM public.journal_entries WHERE organization_id = _org_id;
  
  -- Re-enable triggers
  ALTER TABLE public.journal_lines ENABLE TRIGGER trg_block_jl_mutation;
  ALTER TABLE public.journal_lines ENABLE TRIGGER trg_immutable_jl;
  ALTER TABLE public.journal_entries ENABLE TRIGGER trg_block_je_mutation;
  ALTER TABLE public.journal_entries ENABLE TRIGGER trg_immutable_je;
  ALTER TABLE public.journal_entries ENABLE TRIGGER trg_validate_journal_balance;
  ALTER TABLE public.journal_entries ENABLE TRIGGER block_locked_or_archived_journal_entries;
END;
$$;
