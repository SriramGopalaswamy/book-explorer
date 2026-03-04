-- Create the sandbox force delete function for journal data cleanup
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

  -- Disable immutability triggers
  ALTER TABLE journal_lines DISABLE TRIGGER ALL;
  ALTER TABLE journal_entries DISABLE TRIGGER ALL;
  
  -- Delete journal lines first (FK child)
  DELETE FROM journal_lines WHERE journal_entry_id IN (
    SELECT id FROM journal_entries WHERE organization_id = _org_id
  );
  
  -- Delete journal entries
  DELETE FROM journal_entries WHERE organization_id = _org_id;
  
  -- Re-enable triggers
  ALTER TABLE journal_entries ENABLE TRIGGER ALL;
  ALTER TABLE journal_lines ENABLE TRIGGER ALL;
END;
$$;