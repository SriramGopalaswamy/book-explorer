ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS table_name TEXT,
  ADD COLUMN IF NOT EXISTS old_data   JSONB,
  ADD COLUMN IF NOT EXISTS new_data   JSONB,
  ADD COLUMN IF NOT EXISTS is_system_operation BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.audit_logs ALTER COLUMN actor_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_table_created
  ON public.audit_logs (organization_id, table_name, created_at DESC);

CREATE OR REPLACE FUNCTION public.audit_log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id    UUID;
  v_entity_id UUID;
  v_actor     UUID := auth.uid();
  v_old       JSONB;
  v_new       JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_org_id    := (CASE WHEN to_jsonb(OLD) ? 'organization_id'
                         THEN (to_jsonb(OLD) ->> 'organization_id')::uuid END);
    v_entity_id := (CASE WHEN to_jsonb(OLD) ? 'id'
                         THEN (to_jsonb(OLD) ->> 'id')::uuid END);
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSE
    v_org_id    := (CASE WHEN to_jsonb(NEW) ? 'organization_id'
                         THEN (to_jsonb(NEW) ->> 'organization_id')::uuid END);
    v_entity_id := (CASE WHEN to_jsonb(NEW) ? 'id'
                         THEN (to_jsonb(NEW) ->> 'id')::uuid END);
    v_new := to_jsonb(NEW);
    v_old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  END IF;

  IF v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id,
    table_name, old_data, new_data, is_system_operation
  ) VALUES (
    v_org_id, v_actor, TG_OP, TG_TABLE_NAME, v_entity_id,
    TG_TABLE_NAME, v_old, v_new, v_actor IS NULL
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.audit_log_changes() FROM PUBLIC;

DO $do$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'invoices','bills','journal_entries','vendor_payments','payment_receipts',
    'payroll_runs','payslips','leave_requests','attendance_records','profiles',
    'employees','reimbursement_requests','expenses','bank_transactions',
    'purchase_orders','sales_orders','inventory_adjustments','vendor_credits',
    'credit_notes'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS zzz_audit_%I ON public.%I;', t, t);
      EXECUTE format(
        'CREATE TRIGGER zzz_audit_%I
           AFTER INSERT OR UPDATE OR DELETE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();',
        t, t
      );
    END IF;
  END LOOP;
END
$do$;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DO $do$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.audit_logs;', p.policyname);
  END LOOP;
END
$do$;

CREATE POLICY "audit_logs_select_own_org"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
