
CREATE OR REPLACE FUNCTION block_posted_journal_entry_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow status change from posted to reversed (used by reverse_journal_entry)
  IF OLD.is_posted = true AND TG_OP = 'UPDATE' AND NEW.status IN ('reversed', 'locked') THEN
    RETURN NEW;
  END IF;
  IF OLD.is_posted = true THEN
    RAISE EXCEPTION 'Cannot modify posted journal entry %. Create a reversal instead.', OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
