CREATE TABLE IF NOT EXISTS public.payroll_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payroll_run_id UUID REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  entry_id UUID REFERENCES public.payroll_entries(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_id UUID NOT NULL,
  actor_role TEXT,
  before_state JSONB DEFAULT '{}'::jsonb,
  after_state JSONB DEFAULT '{}'::jsonb,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_events_org_run ON public.payroll_events (organization_id, payroll_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_events_entry ON public.payroll_events (entry_id) WHERE entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_events_actor ON public.payroll_events (actor_id, created_at DESC);
ALTER TABLE public.payroll_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_events_select" ON public.payroll_events;
CREATE POLICY "payroll_events_select" ON public.payroll_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.organization_id = payroll_events.organization_id AND ur.role IN ('admin','hr','finance','payroll','manager')));
DROP POLICY IF EXISTS "payroll_events_insert" ON public.payroll_events;
CREATE POLICY "payroll_events_insert" ON public.payroll_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.organization_id = payroll_events.organization_id));