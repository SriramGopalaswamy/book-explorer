
-- Compensation revision requests table
CREATE TABLE public.compensation_revision_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  requested_by uuid NOT NULL,
  requested_by_role text NOT NULL DEFAULT 'manager',
  current_ctc numeric NOT NULL DEFAULT 0,
  proposed_ctc numeric NOT NULL,
  revision_reason text NOT NULL,
  effective_from date NOT NULL,
  proposed_components jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_crr_org ON compensation_revision_requests(organization_id);
CREATE INDEX idx_crr_profile ON compensation_revision_requests(profile_id);
CREATE INDEX idx_crr_status ON compensation_revision_requests(status);

-- RLS
ALTER TABLE compensation_revision_requests ENABLE ROW LEVEL SECURITY;

-- Manager/HR can view requests they created or for their team
CREATE POLICY "crr_select" ON compensation_revision_requests
FOR SELECT TO authenticated
USING (
  is_org_member(auth.uid(), organization_id)
);

-- Manager/HR can insert requests
CREATE POLICY "crr_insert" ON compensation_revision_requests
FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND is_org_member(auth.uid(), organization_id)
);

-- Finance/Admin can update (approve/reject)
CREATE POLICY "crr_update" ON compensation_revision_requests
FOR UPDATE TO authenticated
USING (
  is_org_admin_or_finance(auth.uid(), organization_id)
);

-- Updated at trigger
CREATE TRIGGER update_crr_updated_at
  BEFORE UPDATE ON compensation_revision_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Block writes for suspended orgs
CREATE TRIGGER trg_block_suspended_crr
  BEFORE INSERT OR UPDATE ON compensation_revision_requests
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

-- Auto-set org id
CREATE TRIGGER trg_auto_org_crr
  BEFORE INSERT ON compensation_revision_requests
  FOR EACH ROW EXECUTE FUNCTION auto_set_organization_id();
