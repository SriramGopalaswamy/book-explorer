
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tenant_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';

CREATE INDEX IF NOT EXISTS idx_attendance_records_org_date
  ON public.attendance_records (organization_id, date DESC);
