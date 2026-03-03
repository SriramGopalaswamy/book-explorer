-- Fix reverse_journal_entry to update the original entry's status to 'reversed'
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_eid uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _o RECORD; _rid uuid; _pid uuid; _seq text;
BEGIN
  SELECT * INTO _o FROM journal_entries WHERE id=p_eid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  IF NOT is_org_admin_or_finance(auth.uid(),_o.organization_id) AND NOT is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT _o.is_posted THEN RAISE EXCEPTION 'Not posted'; END IF;
  IF _o.is_reversal THEN RAISE EXCEPTION 'Cannot reverse reversal'; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reversed_entry_id=p_eid) THEN RAISE EXCEPTION 'Already reversed'; END IF;
  PERFORM 1 FROM organizations WHERE id=_o.organization_id AND org_state NOT IN ('locked','archived','suspended');
  IF NOT FOUND THEN RAISE EXCEPTION 'Org locked'; END IF;
  _pid := get_fiscal_period(_o.organization_id, CURRENT_DATE);
  IF _pid IS NULL THEN RAISE EXCEPTION 'No period'; END IF;
  IF EXISTS (SELECT 1 FROM fiscal_periods WHERE id=_pid AND status!='open') THEN RAISE EXCEPTION 'Period closed'; END IF;
  _seq := next_document_sequence(_o.organization_id, 'reversal');

  -- Create the reversal entry
  INSERT INTO journal_entries (organization_id,entry_date,memo,source_type,source_id,is_reversal,reversed_entry_id,created_by,is_posted,status,document_sequence_number,fiscal_period_id)
  VALUES (_o.organization_id,CURRENT_DATE,'REVERSAL: '||COALESCE(_o.memo,_o.source_type),'reversal',_o.source_id,true,p_eid,auth.uid(),true,'posted',_seq,_pid) RETURNING id INTO _rid;

  INSERT INTO journal_lines (journal_entry_id,gl_account_id,debit,credit,description)
  SELECT _rid,gl_account_id,credit,debit,'REVERSAL: '||COALESCE(description,'') FROM journal_lines WHERE journal_entry_id=p_eid;

  -- Update the ORIGINAL entry's status to 'reversed'
  UPDATE journal_entries SET status = 'reversed' WHERE id = p_eid;

  INSERT INTO audit_logs (actor_id,organization_id,action,entity_type,entity_id,actor_role,metadata)
  VALUES (auth.uid(),_o.organization_id,'JOURNAL_REVERSED','journal_entry',_rid,'finance',
    jsonb_build_object('original',p_eid,'seq',_seq));
  RETURN _rid;
END;
$$;