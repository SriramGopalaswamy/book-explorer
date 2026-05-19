BEGIN;

-- GBC-127: partially_shipped SO status had no backend logic — transitioning to
-- it was valid in the state machine but silent in the DB. This trigger fires on
-- every sales_order status change to 'partially_shipped' and writes an audit_log
-- entry, making the status meaningful and observable without requiring the full
-- partial delivery note creation flow.

CREATE OR REPLACE FUNCTION public.trg_so_partially_shipped()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.status = 'partially_shipped' AND (OLD.status IS DISTINCT FROM 'partially_shipped') THEN
    INSERT INTO public.audit_logs (
      actor_id,
      actor_role,
      action,
      entity_type,
      entity_id,
      metadata
    ) VALUES (
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      'system',
      'so_partially_shipped',
      'sales_order',
      NEW.id,
      jsonb_build_object(
        'organization_id', NEW.organization_id,
        'so_number',       NEW.so_number,
        'previous_status', OLD.status,
        'transitioned_at', now()
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_so_partially_shipped ON public.sales_orders;
CREATE TRIGGER trg_so_partially_shipped
  AFTER UPDATE OF status ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_so_partially_shipped();

COMMIT;
