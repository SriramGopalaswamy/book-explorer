
-- Trigger: when leave_types.default_days is updated, sync leave_balances.total_days
CREATE OR REPLACE FUNCTION public.sync_leave_balances_on_type_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.default_days IS DISTINCT FROM OLD.default_days THEN
    UPDATE public.leave_balances
    SET total_days = NEW.default_days,
        updated_at = now()
    WHERE leave_type = NEW.key
      AND organization_id = NEW.organization_id
      AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_leave_balances_on_type_update ON public.leave_types;
CREATE TRIGGER trg_sync_leave_balances_on_type_update
  AFTER UPDATE ON public.leave_types
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_leave_balances_on_type_update();

-- Fix existing stale data: sync all leave_balances to current leave_types.default_days
UPDATE public.leave_balances lb
SET total_days = lt.default_days,
    updated_at = now()
FROM public.leave_types lt
WHERE lt.key = lb.leave_type
  AND lt.organization_id = lb.organization_id
  AND lb.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
  AND lb.total_days != lt.default_days;
