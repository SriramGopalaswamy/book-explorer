
-- Create approval_workflow_steps table for chain approvals
CREATE TABLE public.approval_workflow_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES public.approval_workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL DEFAULT 1,
  required_role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, step_order)
);

-- Enable RLS
ALTER TABLE public.approval_workflow_steps ENABLE ROW LEVEL SECURITY;

-- RLS: Allow authenticated users to read steps for their org's workflows
CREATE POLICY "Users can read workflow steps for their org"
  ON public.approval_workflow_steps
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_workflows aw
      JOIN public.profiles p ON p.organization_id = aw.organization_id
      WHERE aw.id = approval_workflow_steps.workflow_id
        AND p.user_id = auth.uid()
    )
  );

-- RLS: Allow admin to insert steps
CREATE POLICY "Admins can insert workflow steps"
  ON public.approval_workflow_steps
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.approval_workflows aw
      JOIN public.profiles p ON p.organization_id = aw.organization_id
      JOIN public.user_roles ur ON ur.user_id = auth.uid()
      WHERE aw.id = approval_workflow_steps.workflow_id
        AND p.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

-- RLS: Allow admin to delete steps
CREATE POLICY "Admins can delete workflow steps"
  ON public.approval_workflow_steps
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_workflows aw
      JOIN public.profiles p ON p.organization_id = aw.organization_id
      JOIN public.user_roles ur ON ur.user_id = auth.uid()
      WHERE aw.id = approval_workflow_steps.workflow_id
        AND p.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

-- Add current_step and total_steps to approval_requests for tracking chain progress
ALTER TABLE public.approval_requests 
  ADD COLUMN IF NOT EXISTS current_step INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_steps INTEGER NOT NULL DEFAULT 1;
