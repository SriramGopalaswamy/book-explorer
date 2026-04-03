-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Ensure approval_requests RLS allows admin users to SELECT/UPDATE.
--
-- The admin approval screen was rendering blank because RLS policies on
-- approval_requests did not cover all auth patterns.  This migration
-- ensures any authenticated user scoped to the organisation can read and
-- act on approval requests.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

-- Drop stale policies (idempotent)
DROP POLICY IF EXISTS "Org members can view approval_requests" ON public.approval_requests;
DROP POLICY IF EXISTS "Org members can update approval_requests" ON public.approval_requests;
DROP POLICY IF EXISTS "Org members can insert approval_requests" ON public.approval_requests;

-- SELECT: any org member can read requests in their org
CREATE POLICY "Org members can view approval_requests"
  ON public.approval_requests
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- INSERT: any org member can create requests
CREATE POLICY "Org members can insert approval_requests"
  ON public.approval_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- UPDATE: any org member can approve/reject (maker-checker enforced in application layer)
CREATE POLICY "Org members can update approval_requests"
  ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );
