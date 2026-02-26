
-- Table for employee profile change requests (view-only + request change workflow)
CREATE TABLE public.profile_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  section TEXT NOT NULL, -- 'personal', 'address', 'bank', 'documents'
  field_name TEXT NOT NULL,
  current_value TEXT,
  requested_value TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  reviewed_by UUID REFERENCES auth.users(id),
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_change_requests ENABLE ROW LEVEL SECURITY;

-- Employees can view their own requests
CREATE POLICY "Users can view own change requests"
  ON public.profile_change_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Employees can create their own change requests
CREATE POLICY "Users can create own change requests"
  ON public.profile_change_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- HR/Admin can view all change requests in their org
CREATE POLICY "HR Admin can view all change requests"
  ON public.profile_change_requests FOR SELECT
  TO authenticated
  USING (is_org_admin_or_hr(auth.uid(), organization_id));

-- HR/Admin can update change requests (approve/reject)
CREATE POLICY "HR Admin can update change requests"
  ON public.profile_change_requests FOR UPDATE
  TO authenticated
  USING (is_org_admin_or_hr(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

-- Auto-set organization_id
CREATE TRIGGER trg_auto_org_change_request
  BEFORE INSERT ON public.profile_change_requests
  FOR EACH ROW EXECUTE FUNCTION auto_set_organization_id();
