
-- Table to store simulation run results
CREATE TABLE public.simulation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_type text NOT NULL DEFAULT 'full', -- full, workflow, stress, chaos, validation
  status text NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  initiated_by uuid NOT NULL,
  
  -- Seed summary
  seed_summary jsonb DEFAULT '{}'::jsonb,
  
  -- Workflow results
  workflows_executed integer DEFAULT 0,
  workflows_passed integer DEFAULT 0,
  workflows_failed integer DEFAULT 0,
  workflow_details jsonb DEFAULT '[]'::jsonb,
  
  -- Stress test results
  stress_test_results jsonb DEFAULT '{}'::jsonb,
  concurrent_users_simulated integer DEFAULT 0,
  
  -- Chaos test results
  chaos_test_results jsonb DEFAULT '{}'::jsonb,
  
  -- Validation results
  validation_passed boolean,
  validation_details jsonb DEFAULT '[]'::jsonb,
  
  -- Performance metrics
  total_records_created integer DEFAULT 0,
  total_execution_time_ms integer DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  
  -- Report
  report_json jsonb,
  report_html text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.simulation_runs ENABLE ROW LEVEL SECURITY;

-- Only super admins can access simulation runs
CREATE POLICY "Super admins can manage simulation runs"
ON public.simulation_runs FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.platform_roles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.platform_roles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);
