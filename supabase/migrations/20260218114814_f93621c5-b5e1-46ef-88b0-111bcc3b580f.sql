
-- Create audit_logs table for tracking all workflow actions
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id uuid NOT NULL,                          -- auth.uid() of who performed the action
  actor_name text,                                 -- denormalized display name
  actor_role text,                                 -- role at time of action
  action text NOT NULL,                            -- e.g. 'leave_submitted', 'leave_approved'
  entity_type text NOT NULL,                       -- 'leave_request', 'attendance_correction', 'memo', 'payroll'
  entity_id uuid,                                  -- id of the affected record
  target_user_id uuid,                             -- who the action was about (e.g. the employee whose leave was acted on)
  target_name text,                                -- denormalized name of the target user
  metadata jsonb DEFAULT '{}'::jsonb,              -- extra context (reason, dates, etc.)
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast recent queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON public.audit_logs (entity_type);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins and HR can view audit logs
CREATE POLICY "Admins and HR can view audit logs"
ON public.audit_logs FOR SELECT
USING (is_admin_or_hr(auth.uid()));

-- Authenticated users can insert their own audit entries (service-role inserts also allowed)
CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
