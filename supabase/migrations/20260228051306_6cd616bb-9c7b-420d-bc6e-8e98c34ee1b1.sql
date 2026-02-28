
-- Fix search_path on trigger functions
CREATE OR REPLACE FUNCTION public.trg_block_posted_je_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('posted','locked') THEN
      RAISE EXCEPTION 'Cannot delete posted/locked journal entry %', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('posted','locked') AND NEW.status NOT IN ('locked','reversed') THEN
      RAISE EXCEPTION 'Posted entry % is immutable (status change % → % not allowed)', OLD.id, OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_block_posted_jl_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _status text;
BEGIN
  SELECT status INTO _status FROM public.journal_entries
    WHERE id = COALESCE(OLD.journal_entry_id, NEW.journal_entry_id);
  IF _status IN ('posted','locked') THEN
    RAISE EXCEPTION 'Cannot modify lines of posted/locked journal entry';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
