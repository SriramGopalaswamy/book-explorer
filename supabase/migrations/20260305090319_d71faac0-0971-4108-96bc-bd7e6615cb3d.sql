-- Drop existing function and recreate with the parameter order that all callers expect
-- Callers use: (org_id, doc_type, doc_id, date, memo, lines)
DROP FUNCTION IF EXISTS public.post_journal_entry(uuid, date, text, text, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.post_journal_entry(
  p_org_id uuid, 
  p_doc_type text, 
  p_doc_id uuid, 
  p_date date, 
  p_memo text, 
  p_lines jsonb
) RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path TO 'public'
AS $$
DECLARE
  _jid uuid; _pid uuid; _seq text; _td numeric:=0; _tc numeric:=0;
  _l jsonb; _gid uuid; _gorg uuid; _os text;
  _is_control boolean; _ctrl_module text;
  _caller_uid uuid;
BEGIN
  -- Allow calls from trigger context (auth.uid() may be NULL in SECURITY DEFINER trigger chains)
  _caller_uid := auth.uid();
  
  SELECT org_state INTO _os FROM organizations WHERE id=p_org_id;
  IF _os IS NULL THEN RAISE EXCEPTION 'Org not found'; END IF;
  IF _os IN ('locked','archived','suspended') THEN RAISE EXCEPTION 'Org % blocked', _os; END IF;
  
  -- Only enforce role check when called from user context (not trigger chain)
  IF _caller_uid IS NOT NULL THEN
    IF NOT is_org_admin_or_finance(_caller_uid, p_org_id) AND NOT is_super_admin(_caller_uid) THEN
      RAISE EXCEPTION 'Finance role required'; 
    END IF;
  END IF;

  -- Idempotency check
  IF p_doc_id IS NOT NULL THEN
    SELECT id INTO _jid FROM journal_entries WHERE organization_id=p_org_id AND source_type=p_doc_type AND source_id=p_doc_id;
    IF FOUND THEN RETURN _jid; END IF;
  END IF;

  _pid := get_fiscal_period(p_org_id, p_date);
  IF _pid IS NULL THEN RAISE EXCEPTION 'No period for %', p_date; END IF;
  IF EXISTS (SELECT 1 FROM fiscal_periods WHERE id=_pid AND status!='open') THEN
    RAISE EXCEPTION 'Period closed for %', p_date; END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines)<2 THEN RAISE EXCEPTION 'Min 2 lines'; END IF;

  FOR _l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    _td:=_td+COALESCE((_l->>'debit')::numeric,0); _tc:=_tc+COALESCE((_l->>'credit')::numeric,0);
    _gid:=(_l->>'gl_account_id')::uuid;
    SELECT organization_id, is_control_account, control_module INTO _gorg, _is_control, _ctrl_module
      FROM gl_accounts WHERE id=_gid AND is_active;
    IF _gorg IS NULL THEN RAISE EXCEPTION 'GL % invalid', _gid; END IF;
    IF _gorg!=p_org_id THEN RAISE EXCEPTION 'Cross-tenant blocked'; END IF;

    IF _is_control AND p_doc_type = 'manual' THEN
      RAISE EXCEPTION 'Manual journal to control account % blocked.', _gid;
    END IF;

    IF COALESCE((_l->>'debit')::numeric,0)<0 OR COALESCE((_l->>'credit')::numeric,0)<0 THEN RAISE EXCEPTION 'Negative'; END IF;
    IF COALESCE((_l->>'debit')::numeric,0)>0 AND COALESCE((_l->>'credit')::numeric,0)>0 THEN RAISE EXCEPTION 'Both D+C'; END IF;
    IF COALESCE((_l->>'debit')::numeric,0)=0 AND COALESCE((_l->>'credit')::numeric,0)=0 THEN RAISE EXCEPTION 'Zero line'; END IF;
  END LOOP;

  IF _td!=_tc THEN RAISE EXCEPTION 'Unbalanced D(%)!=C(%)',_td,_tc; END IF;
  IF _td=0 THEN RAISE EXCEPTION 'Zero total'; END IF;

  _seq := next_document_sequence(p_org_id, p_doc_type);
  INSERT INTO journal_entries (organization_id,entry_date,memo,source_type,source_id,is_reversal,created_by,is_posted,status,document_sequence_number,fiscal_period_id)
  VALUES (p_org_id,p_date,p_memo,p_doc_type,p_doc_id,false,COALESCE(_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid),true,'posted',_seq,_pid) RETURNING id INTO _jid;

  INSERT INTO journal_lines (journal_entry_id,gl_account_id,debit,credit,description,cost_center,department,asset_id)
  SELECT _jid,(l->>'gl_account_id')::uuid,COALESCE((l->>'debit')::numeric,0),COALESCE((l->>'credit')::numeric,0),
    l->>'description',l->>'cost_center',l->>'department',(l->>'asset_id')::uuid
  FROM jsonb_array_elements(p_lines) AS l;

  INSERT INTO audit_logs (actor_id,organization_id,action,entity_type,entity_id,actor_role,metadata)
  VALUES (COALESCE(_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid),p_org_id,'JOURNAL_POSTED','journal_entry',_jid,'finance',
    jsonb_build_object('doc_type',p_doc_type,'seq',_seq,'total',_td,'lines',jsonb_array_length(p_lines),'period',_pid));

  RETURN _jid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_journal_entry(uuid, text, uuid, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(uuid, text, uuid, date, text, jsonb) TO service_role;