-- Workflow automation core schema using existing org-role helpers

CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workflow_steps_step_type_check CHECK (step_type IN ('delay', 'condition', 'action')),
  CONSTRAINT workflow_steps_workflow_order_key UNIQUE (workflow_id, step_order)
);

CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  current_step INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workflow_runs_status_check CHECK (status IN ('running', 'completed', 'failed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS public.workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflows_org_active
  ON public.workflows (organization_id, is_active, trigger_event);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_order
  ON public.workflow_steps (workflow_id, step_order);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_org_status_next
  ON public.workflow_runs (organization_id, status, next_run_at);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_entity
  ON public.workflow_runs (entity_type, entity_id, status);

CREATE INDEX IF NOT EXISTS idx_workflow_events_run_created
  ON public.workflow_events (workflow_run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_workflow_events_entity_created
  ON public.workflow_events (entity_id, created_at)
  WHERE entity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_workflow_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workflows_updated_at ON public.workflows;
CREATE TRIGGER trg_workflows_updated_at
BEFORE UPDATE ON public.workflows
FOR EACH ROW
EXECUTE FUNCTION public.set_workflow_updated_at();

DROP TRIGGER IF EXISTS trg_workflow_steps_updated_at ON public.workflow_steps;
CREATE TRIGGER trg_workflow_steps_updated_at
BEFORE UPDATE ON public.workflow_steps
FOR EACH ROW
EXECUTE FUNCTION public.set_workflow_updated_at();

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_admin_workflows_select" ON public.workflows;
CREATE POLICY "finance_admin_workflows_select"
ON public.workflows
FOR SELECT
USING (public.is_org_admin_or_finance(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance_admin_workflows_insert" ON public.workflows;
CREATE POLICY "finance_admin_workflows_insert"
ON public.workflows
FOR INSERT
WITH CHECK (public.is_org_admin_or_finance(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance_admin_workflows_update" ON public.workflows;
CREATE POLICY "finance_admin_workflows_update"
ON public.workflows
FOR UPDATE
USING (public.is_org_admin_or_finance(auth.uid(), organization_id))
WITH CHECK (public.is_org_admin_or_finance(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance_admin_workflows_delete" ON public.workflows;
CREATE POLICY "finance_admin_workflows_delete"
ON public.workflows
FOR DELETE
USING (public.is_org_admin_or_finance(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance_admin_workflow_steps_select" ON public.workflow_steps;
CREATE POLICY "finance_admin_workflow_steps_select"
ON public.workflow_steps
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.workflows w
    WHERE w.id = workflow_steps.workflow_id
      AND public.is_org_admin_or_finance(auth.uid(), w.organization_id)
  )
);

DROP POLICY IF EXISTS "finance_admin_workflow_steps_insert" ON public.workflow_steps;
CREATE POLICY "finance_admin_workflow_steps_insert"
ON public.workflow_steps
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workflows w
    WHERE w.id = workflow_steps.workflow_id
      AND public.is_org_admin_or_finance(auth.uid(), w.organization_id)
  )
);

DROP POLICY IF EXISTS "finance_admin_workflow_steps_update" ON public.workflow_steps;
CREATE POLICY "finance_admin_workflow_steps_update"
ON public.workflow_steps
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.workflows w
    WHERE w.id = workflow_steps.workflow_id
      AND public.is_org_admin_or_finance(auth.uid(), w.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workflows w
    WHERE w.id = workflow_steps.workflow_id
      AND public.is_org_admin_or_finance(auth.uid(), w.organization_id)
  )
);

DROP POLICY IF EXISTS "finance_admin_workflow_steps_delete" ON public.workflow_steps;
CREATE POLICY "finance_admin_workflow_steps_delete"
ON public.workflow_steps
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.workflows w
    WHERE w.id = workflow_steps.workflow_id
      AND public.is_org_admin_or_finance(auth.uid(), w.organization_id)
  )
);

DROP POLICY IF EXISTS "finance_admin_workflow_runs_select" ON public.workflow_runs;
CREATE POLICY "finance_admin_workflow_runs_select"
ON public.workflow_runs
FOR SELECT
USING (public.is_org_admin_or_finance(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance_admin_workflow_runs_insert" ON public.workflow_runs;
CREATE POLICY "finance_admin_workflow_runs_insert"
ON public.workflow_runs
FOR INSERT
WITH CHECK (public.is_org_admin_or_finance(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance_admin_workflow_runs_update" ON public.workflow_runs;
CREATE POLICY "finance_admin_workflow_runs_update"
ON public.workflow_runs
FOR UPDATE
USING (public.is_org_admin_or_finance(auth.uid(), organization_id))
WITH CHECK (public.is_org_admin_or_finance(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance_admin_workflow_events_select" ON public.workflow_events;
CREATE POLICY "finance_admin_workflow_events_select"
ON public.workflow_events
FOR SELECT
USING (public.is_org_admin_or_finance(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance_admin_workflow_events_insert" ON public.workflow_events;
CREATE POLICY "finance_admin_workflow_events_insert"
ON public.workflow_events
FOR INSERT
WITH CHECK (public.is_org_admin_or_finance(auth.uid(), organization_id));

CREATE OR REPLACE FUNCTION public.claim_workflow_runs(
  p_now TIMESTAMPTZ,
  p_claim_until TIMESTAMPTZ,
  p_limit INT DEFAULT 50
)
RETURNS SETOF public.workflow_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.workflow_runs
  SET next_run_at = p_claim_until,
      updated_at = now()
  WHERE id IN (
    SELECT wr.id
    FROM public.workflow_runs wr
    WHERE wr.status = 'running'
      AND wr.next_run_at <= p_now
    ORDER BY wr.next_run_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_workflow_runs(TIMESTAMPTZ, TIMESTAMPTZ, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workflow_runs(TIMESTAMPTZ, TIMESTAMPTZ, INT) TO service_role;