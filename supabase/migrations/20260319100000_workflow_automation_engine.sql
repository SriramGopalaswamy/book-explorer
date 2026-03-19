-- ============================================================
-- Workflow Automation Engine
-- Tables: workflows, workflow_steps, workflow_runs, workflow_events
-- ============================================================

-- workflows: master workflow definitions
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- workflow_steps: ordered steps for each workflow
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  step_type TEXT NOT NULL CHECK (step_type IN ('delay', 'condition', 'action')),
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- workflow_runs: per-entity execution instances
CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  current_step INT DEFAULT 0,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- workflow_events: audit log of all workflow activity
CREATE TABLE IF NOT EXISTS public.workflow_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status_next
  ON public.workflow_runs(status, next_run_at)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_workflow_runs_entity
  ON public.workflow_runs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_workflow_events_run
  ON public.workflow_events(workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_workflows_trigger_active
  ON public.workflows(trigger_event, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_workflow_events_org_created
  ON public.workflow_events(organization_id, created_at DESC);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;

-- Helper: check if current user is finance/admin in the org
CREATE OR REPLACE FUNCTION public.is_finance_or_admin(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.user_id = auth.uid()
      AND p.organization_id = org_id
      AND ur.role IN ('finance', 'admin')
  );
$$;

-- workflows policies
CREATE POLICY "finance_admin_workflows_select"
  ON public.workflows FOR SELECT
  USING (public.is_finance_or_admin(organization_id));

CREATE POLICY "finance_admin_workflows_insert"
  ON public.workflows FOR INSERT
  WITH CHECK (public.is_finance_or_admin(organization_id));

CREATE POLICY "finance_admin_workflows_update"
  ON public.workflows FOR UPDATE
  USING (public.is_finance_or_admin(organization_id));

CREATE POLICY "finance_admin_workflows_delete"
  ON public.workflows FOR DELETE
  USING (public.is_finance_or_admin(organization_id));

-- workflow_steps policies (inherit through workflow)
CREATE POLICY "finance_admin_workflow_steps_select"
  ON public.workflow_steps FOR SELECT
  USING (
    workflow_id IN (
      SELECT id FROM public.workflows w
      WHERE public.is_finance_or_admin(w.organization_id)
    )
  );

CREATE POLICY "finance_admin_workflow_steps_insert"
  ON public.workflow_steps FOR INSERT
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM public.workflows w
      WHERE public.is_finance_or_admin(w.organization_id)
    )
  );

CREATE POLICY "finance_admin_workflow_steps_update"
  ON public.workflow_steps FOR UPDATE
  USING (
    workflow_id IN (
      SELECT id FROM public.workflows w
      WHERE public.is_finance_or_admin(w.organization_id)
    )
  );

CREATE POLICY "finance_admin_workflow_steps_delete"
  ON public.workflow_steps FOR DELETE
  USING (
    workflow_id IN (
      SELECT id FROM public.workflows w
      WHERE public.is_finance_or_admin(w.organization_id)
    )
  );

-- workflow_runs policies
CREATE POLICY "finance_admin_workflow_runs_all"
  ON public.workflow_runs FOR ALL
  USING (public.is_finance_or_admin(organization_id));

-- workflow_events policies
CREATE POLICY "finance_admin_workflow_events_all"
  ON public.workflow_events FOR ALL
  USING (public.is_finance_or_admin(organization_id));

-- ============================================================
-- Seed: Default "Invoice Follow-up" workflow for all existing orgs
-- ============================================================

DO $$
DECLARE
  org RECORD;
  wf_id UUID;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP
    -- Skip if already seeded
    IF EXISTS (
      SELECT 1 FROM public.workflows
      WHERE organization_id = org.id
        AND name = 'Invoice Follow-up - Luminous'
    ) THEN
      CONTINUE;
    END IF;

    wf_id := gen_random_uuid();

    INSERT INTO public.workflows (id, organization_id, name, trigger_event, is_active)
    VALUES (wf_id, org.id, 'Invoice Follow-up - Luminous', 'invoice_sent', true);

    INSERT INTO public.workflow_steps (workflow_id, step_order, step_type, config) VALUES
      (wf_id, 1, 'delay',     '{"duration_hours": 24}'),
      (wf_id, 2, 'condition', '{"field": "invoice.status", "operator": "!=", "value": "acknowledged"}'),
      (wf_id, 3, 'action',    '{"action_type": "send_email", "template": "reminder_1", "to": "client_email"}'),
      (wf_id, 4, 'delay',     '{"duration_hours": 24}'),
      (wf_id, 5, 'condition', '{"field": "invoice.status", "operator": "!=", "value": "acknowledged"}'),
      (wf_id, 6, 'action',    '{"action_type": "send_email", "template": "reminder_2", "to": "client_email"}'),
      (wf_id, 7, 'delay',     '{"duration_hours": 24}'),
      (wf_id, 8, 'action',    '{"action_type": "notify_internal", "channel": "dashboard", "message": "Invoice pending acknowledgement"}');
  END LOOP;
END $$;
