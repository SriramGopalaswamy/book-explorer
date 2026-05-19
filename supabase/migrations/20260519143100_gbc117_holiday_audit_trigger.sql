-- GBC-117: Holidays screen has no audit trail.
--
-- Payroll's LWP (loss-of-pay) calculation reads holidays, so a malicious or
-- accidental move of a holiday can disguise unpaid leave. We mirror the
-- audit-trigger pattern from GBC-16 (profiles trigger in migration
-- 20260514073444) — AFTER INSERT OR UPDATE OR DELETE writes a row into
-- audit_logs with old_data/new_data so any change is traceable.

CREATE OR REPLACE FUNCTION public.log_holidays_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_actor_name TEXT;
  v_org_id     UUID;
  v_action     TEXT;
BEGIN
  -- Resolve actor display name (best-effort; null when system-driven)
  IF v_actor IS NOT NULL THEN
    SELECT COALESCE(full_name, email)
      INTO v_actor_name
      FROM public.profiles
     WHERE user_id = v_actor
     LIMIT 1;
  END IF;

  v_action := TG_OP; -- 'INSERT' | 'UPDATE' | 'DELETE'
  v_org_id := COALESCE(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END,
    NULL
  );

  INSERT INTO public.audit_logs (
    actor_id, actor_name, action, entity_type, entity_id,
    organization_id, table_name, old_data, new_data, is_system_operation
  ) VALUES (
    v_actor, v_actor_name, v_action, 'holiday',
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    v_org_id, 'holidays',
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    v_actor IS NULL
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_holidays_changes ON public.holidays;
CREATE TRIGGER trg_log_holidays_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.log_holidays_changes();

COMMENT ON FUNCTION public.log_holidays_changes() IS
  'GBC-117: emit audit_logs row for every holidays mutation. Payroll LWP depends on holiday accuracy; tampering must be traceable.';
