-- Fix audit_compensation_insert to handle null auth.uid() (service-role inserts)
CREATE OR REPLACE FUNCTION public.audit_compensation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_actor_name TEXT;
  v_target_name TEXT;
  v_actor_role TEXT;
BEGIN
  v_actor_id := COALESCE(auth.uid(), NEW.created_by);
  
  IF v_actor_id IS NULL THEN
    RETURN NEW; -- skip audit if no actor can be determined
  END IF;

  SELECT full_name INTO v_actor_name FROM profiles WHERE user_id = v_actor_id LIMIT 1;
  SELECT full_name INTO v_target_name FROM profiles WHERE id = NEW.profile_id LIMIT 1;
  SELECT role INTO v_actor_role FROM user_roles WHERE user_id = v_actor_id AND organization_id = NEW.organization_id LIMIT 1;

  INSERT INTO public.audit_logs (
    actor_id, actor_name, actor_role,
    entity_type, entity_id, action,
    target_user_id, target_name,
    organization_id, metadata
  ) VALUES (
    v_actor_id, v_actor_name, v_actor_role,
    'compensation', NEW.id, 'salary_revision',
    (SELECT user_id FROM profiles WHERE id = NEW.profile_id LIMIT 1),
    v_target_name,
    NEW.organization_id,
    jsonb_build_object(
      'annual_ctc', NEW.annual_ctc,
      'effective_from', NEW.effective_from,
      'revision_number', NEW.revision_number,
      'revision_reason', NEW.revision_reason
    )
  );
  RETURN NEW;
END;
$$;