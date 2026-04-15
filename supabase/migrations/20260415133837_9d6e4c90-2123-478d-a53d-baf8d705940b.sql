-- Add missing columns to existing user_sessions table
ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'sign_in',
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS device_info JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_anomaly BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anomaly_reasons TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS session_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_org_created ON public.user_sessions (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_anomalies ON public.user_sessions (organization_id, is_anomaly) WHERE is_anomaly = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_event_type ON public.user_sessions (organization_id, event_type, created_at DESC);

-- Admin/HR read policy (existing policy only allows own sessions)
CREATE POLICY "Admins and HR can view org session logs"
  ON public.user_sessions FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = public.user_sessions.organization_id
        AND ur.role IN ('admin', 'hr')
    )
  );

-- Enable realtime for admin alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions;

COMMENT ON TABLE public.user_sessions IS 'Tracks user authentication events for statutory compliance (IT Act 2000 §43A, DPDPA 2023).';