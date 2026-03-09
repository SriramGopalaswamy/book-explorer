
-- Fix the audit trigger: entity_id column is UUID, not text
CREATE OR REPLACE FUNCTION public.fn_audit_hr_payroll_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action text;
  _entity_id uuid;
  _org_id uuid;
  _actor_id uuid;
  _metadata jsonb;
BEGIN
  _actor_id := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  
  IF TG_OP = 'INSERT' THEN
    _action := 'created';
    _entity_id := NEW.id;
    _org_id := NEW.organization_id;
    _metadata := jsonb_build_object('new', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'updated';
    _entity_id := NEW.id;
    _org_id := NEW.organization_id;
    _metadata := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW),
      'changed_fields', (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each(to_jsonb(NEW))
        WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'deleted';
    _entity_id := OLD.id;
    _org_id := OLD.organization_id;
    _metadata := jsonb_build_object('old', to_jsonb(OLD));
  END IF;

  INSERT INTO public.audit_logs (
    action, actor_id, entity_type, entity_id, organization_id, metadata
  ) VALUES (
    _action, _actor_id, TG_TABLE_NAME, _entity_id, _org_id, _metadata
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
