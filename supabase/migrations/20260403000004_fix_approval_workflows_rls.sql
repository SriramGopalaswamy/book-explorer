-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Add RLS policies for approval_workflows and approval_workflow_steps.
--
-- Both tables have RLS ENABLED but ZERO policies, so every authenticated
-- query is denied → useApprovalWorkflows() sets wfError → the Admin
-- Approval screen renders blank.
--
-- approval_workflows        → org-scoped via organization_id column
-- approval_workflow_steps   → org-scoped by joining through workflow_id
-- ═══════════════════════════════════════════════════════════════════════

-- ── approval_workflows ──────────────────────────────────────────────────

ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view approval_workflows"   ON public.approval_workflows;
DROP POLICY IF EXISTS "Org members can insert approval_workflows" ON public.approval_workflows;
DROP POLICY IF EXISTS "Org members can update approval_workflows" ON public.approval_workflows;
DROP POLICY IF EXISTS "Org members can delete approval_workflows" ON public.approval_workflows;

CREATE POLICY "Org members can view approval_workflows"
  ON public.approval_workflows
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can insert approval_workflows"
  ON public.approval_workflows
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update approval_workflows"
  ON public.approval_workflows
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete approval_workflows"
  ON public.approval_workflows
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- ── approval_workflow_steps ──────────────────────────────────────────────

ALTER TABLE public.approval_workflow_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view approval_workflow_steps"   ON public.approval_workflow_steps;
DROP POLICY IF EXISTS "Org members can insert approval_workflow_steps" ON public.approval_workflow_steps;
DROP POLICY IF EXISTS "Org members can update approval_workflow_steps" ON public.approval_workflow_steps;
DROP POLICY IF EXISTS "Org members can delete approval_workflow_steps" ON public.approval_workflow_steps;

CREATE POLICY "Org members can view approval_workflow_steps"
  ON public.approval_workflow_steps
  FOR SELECT TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM public.approval_workflows
      WHERE organization_id IN (
        SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Org members can insert approval_workflow_steps"
  ON public.approval_workflow_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM public.approval_workflows
      WHERE organization_id IN (
        SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Org members can update approval_workflow_steps"
  ON public.approval_workflow_steps
  FOR UPDATE TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM public.approval_workflows
      WHERE organization_id IN (
        SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Org members can delete approval_workflow_steps"
  ON public.approval_workflow_steps
  FOR DELETE TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM public.approval_workflows
      WHERE organization_id IN (
        SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
      )
    )
  );
