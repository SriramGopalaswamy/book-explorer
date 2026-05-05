-- Item 18: Create payroll_events append-only event log for payroll workflow transitions.
--
-- Design decisions:
-- - No UPDATE or DELETE RLS: this is an immutable audit trail.
-- - Org members can SELECT their own org's events.
-- - INSERT allowed for authenticated users (app code and Edge Functions write here).
-- - before_state / after_state store the status snapshots at transition time.

CREATE TABLE IF NOT EXISTS public.payroll_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES public.organizations(id),
  event_type        TEXT        NOT NULL,
  employee_id       UUID        REFERENCES public.profiles(id),
  payroll_run_id    UUID        REFERENCES public.payroll_runs(id),
  entry_id          UUID        REFERENCES public.payroll_entries(id),
  actor_id          UUID        REFERENCES auth.users(id),
  actor_role        TEXT,
  before_state      JSONB,
  after_state       JSONB,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_payroll_events_org        ON public.payroll_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_events_run        ON public.payroll_events(payroll_run_id)   WHERE payroll_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_events_entry      ON public.payroll_events(entry_id)         WHERE entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_events_employee   ON public.payroll_events(employee_id)      WHERE employee_id IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.payroll_events ENABLE ROW LEVEL SECURITY;

-- Org members can read events for their organization
DROP POLICY IF EXISTS "Org members can read payroll events" ON public.payroll_events;
CREATE POLICY "Org members can read payroll events"
  ON public.payroll_events FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_roles
      WHERE user_id = auth.uid()
    )
  );

-- Authenticated users can insert (app code drives this, not the end user directly)
DROP POLICY IF EXISTS "Authenticated can insert payroll events" ON public.payroll_events;
CREATE POLICY "Authenticated can insert payroll events"
  ON public.payroll_events FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.user_roles
      WHERE user_id = auth.uid()
    )
  );

-- No UPDATE or DELETE policy intentionally — events are immutable
