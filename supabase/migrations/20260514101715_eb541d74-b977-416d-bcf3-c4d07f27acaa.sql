CREATE TABLE IF NOT EXISTS public.payroll_records_write_log (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  operation TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  record_id UUID,
  organization_id UUID,
  actor_user_id UUID,
  source_app TEXT
);

CREATE INDEX IF NOT EXISTS idx_prwl_occurred_at ON public.payroll_records_write_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_prwl_operation ON public.payroll_records_write_log (operation);

ALTER TABLE public.payroll_records_write_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_prwl" ON public.payroll_records_write_log;
CREATE POLICY "super_admin_read_prwl" ON public.payroll_records_write_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_payroll_records_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_org UUID;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_id := OLD.id;
    v_org := OLD.organization_id;
  ELSE
    v_id := NEW.id;
    v_org := NEW.organization_id;
  END IF;

  BEGIN
    INSERT INTO public.payroll_records_write_log (operation, record_id, organization_id, actor_user_id, source_app)
    VALUES (TG_OP, v_id, v_org, auth.uid(), current_setting('application_name', true));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_payroll_records_write ON public.payroll_records;
CREATE TRIGGER trg_log_payroll_records_write
AFTER INSERT OR UPDATE OR DELETE ON public.payroll_records
FOR EACH ROW EXECUTE FUNCTION public.log_payroll_records_write();