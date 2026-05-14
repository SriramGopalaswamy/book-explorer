-- 1) Add gender_eligibility column referenced by provision_leave_balances() but missing from schema.
ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS gender_eligibility text NOT NULL DEFAULT 'all'
  CHECK (gender_eligibility IN ('all', 'male', 'female'));

-- Set menstruation as female-only across all orgs.
UPDATE public.leave_types SET gender_eligibility = 'female' WHERE key = 'menstruation';

-- 2) Cleanup: delete menstruation balance rows for strictly-male employees (leaves nulls/non-binary intact).
DELETE FROM public.leave_balances lb
USING public.employee_details ed
WHERE lb.profile_id = ed.profile_id
  AND lb.leave_type = 'menstruation'
  AND lower(trim(ed.gender)) IN ('male', 'm');

-- 3) Audit table for admin balance edits.
CREATE TABLE IF NOT EXISTS public.leave_balance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type text NOT NULL,
  year integer NOT NULL,
  field text NOT NULL CHECK (field IN ('total_days', 'used_days')),
  old_value numeric NOT NULL,
  new_value numeric NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lba_org_profile_year
  ON public.leave_balance_adjustments(organization_id, profile_id, year);

ALTER TABLE public.leave_balance_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/HR can read adjustments in own org" ON public.leave_balance_adjustments;
CREATE POLICY "Admin/HR can read adjustments in own org"
  ON public.leave_balance_adjustments FOR SELECT
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      organization_id = get_user_org_id(auth.uid())
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role))
    )
  );

DROP POLICY IF EXISTS "Admin/HR can insert adjustments in own org" ON public.leave_balance_adjustments;
CREATE POLICY "Admin/HR can insert adjustments in own org"
  ON public.leave_balance_adjustments FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (
      organization_id = get_user_org_id(auth.uid())
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role))
    )
  );