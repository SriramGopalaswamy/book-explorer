-- batch 1
CREATE TABLE IF NOT EXISTS public.job_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_type         TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  progress         INTEGER     NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  progress_label   TEXT,
  payload          JSONB       NOT NULL DEFAULT '{}',
  result           JSONB,
  error_message    TEXT,
  created_by       UUID        REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  retry_count      INTEGER     NOT NULL DEFAULT 0,
  max_retries      INTEGER     NOT NULL DEFAULT 3
);
CREATE INDEX IF NOT EXISTS idx_job_queue_org_status ON public.job_queue(organization_id, status)
  WHERE status NOT IN ('completed', 'failed', 'cancelled');
CREATE INDEX IF NOT EXISTS idx_job_queue_created_by ON public.job_queue(created_by);
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org members can view job_queue" ON public.job_queue;
CREATE POLICY "org members can view job_queue" ON public.job_queue FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "org members can insert job_queue" ON public.job_queue;
CREATE POLICY "org members can insert job_queue" ON public.job_queue FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "job owner can cancel" ON public.job_queue;
CREATE POLICY "job owner can cancel" ON public.job_queue FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND status = 'pending') WITH CHECK (status = 'cancelled');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='job_queue') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.job_queue';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.shopify_invoice_map (
  shopify_order_id  TEXT NOT NULL,
  invoice_id        UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_status       TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced','error','skipped')),
  sync_error        TEXT,
  PRIMARY KEY (shopify_order_id, organization_id)
);
CREATE INDEX IF NOT EXISTS idx_shopify_invoice_map_invoice ON public.shopify_invoice_map(invoice_id);
ALTER TABLE public.shopify_invoice_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org members can view shopify_invoice_map" ON public.shopify_invoice_map;
CREATE POLICY "org members can view shopify_invoice_map" ON public.shopify_invoice_map FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='shopify_orders') THEN
    INSERT INTO public.shopify_invoice_map (shopify_order_id, invoice_id, organization_id, synced_at, sync_status)
    SELECT so.shopify_order_id, i.id, so.organization_id, GREATEST(so.synced_at, i.created_at), 'synced'
    FROM public.shopify_orders so
    JOIN public.invoices i ON i.organization_id = so.organization_id AND i.invoice_number = so.order_number
    WHERE so.order_number IS NOT NULL AND (i.deleted_at IS NULL)
    ON CONFLICT (shopify_order_id, organization_id) DO NOTHING;
  END IF;
END $$;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,6) NOT NULL DEFAULT 1.0;
ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,6) NOT NULL DEFAULT 1.0;
ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,6) NOT NULL DEFAULT 1.0;

ALTER TABLE public.attendance_daily DROP CONSTRAINT IF EXISTS attendance_daily_status_check;
ALTER TABLE public.attendance_daily ADD CONSTRAINT attendance_daily_status_check
  CHECK (status IN ('P','A','HD','MIS','NA','lwp'));
CREATE OR REPLACE FUNCTION public.trg_fn_enforce_lwp_leave_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'lwp' THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.leave_requests lr
    WHERE lr.profile_id = NEW.profile_id AND lr.status='approved'
      AND lr.from_date <= NEW.attendance_date AND lr.to_date >= NEW.attendance_date
  ) THEN
    RAISE EXCEPTION 'attendance_daily: cannot set status=''lwp'' for profile % on % without an approved leave_request', NEW.profile_id, NEW.attendance_date;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_enforce_lwp_leave_request ON public.attendance_daily;
CREATE TRIGGER trg_enforce_lwp_leave_request BEFORE INSERT OR UPDATE OF status ON public.attendance_daily
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_enforce_lwp_leave_request();

DROP POLICY IF EXISTS "Org managers can view direct reports" ON public.profiles;
CREATE POLICY "Org managers can view direct reports" ON public.profiles FOR SELECT
  USING (
    organization_id = get_user_organization_id(auth.uid())
    AND (
      manager_id = get_current_user_profile_id()
      OR EXISTS (SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.organization_id = public.profiles.organization_id AND ur.role = 'manager')
    )
  );
DROP POLICY IF EXISTS "Managers can view direct reports attendance" ON public.attendance_records;
CREATE POLICY "Managers can view direct reports attendance" ON public.attendance_records FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (
      profile_id IN (SELECT id FROM public.profiles WHERE manager_id = get_current_user_profile_id())
      OR EXISTS (SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.organization_id = attendance_records.organization_id AND ur.role = 'manager')
    )
  );
DROP POLICY IF EXISTS "Managers can view direct reports attendance daily" ON public.attendance_daily;
CREATE POLICY "Managers can view direct reports attendance daily" ON public.attendance_daily FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (
      profile_id IN (SELECT id FROM public.profiles WHERE manager_id = get_current_user_profile_id())
      OR EXISTS (SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.organization_id = attendance_daily.organization_id AND ur.role = 'manager')
    )
  );

-- journal_entry_lines: legacy table, may not exist
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entry_lines') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='journal_entry_lines' AND column_name='entry_id') THEN
      EXECUTE 'ALTER TABLE public.journal_entry_lines RENAME COLUMN entry_id TO journal_entry_id';
    END IF;
    EXECUTE 'DROP INDEX IF EXISTS public.idx_journal_entry_lines_entry';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry ON public.journal_entry_lines(journal_entry_id)';
    EXECUTE 'DROP INDEX IF EXISTS public.idx_journal_entry_lines_account';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account ON public.journal_entry_lines(account_id, journal_entry_id)';
  END IF;
END $$;

DROP POLICY IF EXISTS "Job creator can update own job progress" ON public.job_queue;
CREATE POLICY "Job creator can update own job progress" ON public.job_queue FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid() AND status IN ('running','completed','failed','cancelled'));
