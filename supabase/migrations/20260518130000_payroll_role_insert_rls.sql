-- =============================================================================
-- FIX: payroll role needs INSERT + UPDATE on payroll_runs / payroll_entries
--      to support the bulk-register upload feature.
--
-- Context:
--   20260427070000 added SELECT-only policies for the payroll role.
--   The bulk-upload hook creates a payroll_run (INSERT) and upserts
--   payroll_entries (INSERT + UPDATE on conflict).  Without write policies
--   those operations fail silently under RLS for payroll-only users.
-- =============================================================================

-- payroll_runs: payroll role can INSERT + UPDATE (own org, non-locked)
DROP POLICY IF EXISTS "Org payroll can write payroll runs" ON public.payroll_runs;
CREATE POLICY "Org payroll can write payroll runs"
ON public.payroll_runs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id         = auth.uid()
      AND ur.organization_id = payroll_runs.organization_id
      AND ur.role            = 'payroll'
  )
);

DROP POLICY IF EXISTS "Org payroll can update payroll runs" ON public.payroll_runs;
CREATE POLICY "Org payroll can update payroll runs"
ON public.payroll_runs
FOR UPDATE
TO authenticated
USING (
  status NOT IN ('locked')
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id         = auth.uid()
      AND ur.organization_id = payroll_runs.organization_id
      AND ur.role            = 'payroll'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id         = auth.uid()
      AND ur.organization_id = payroll_runs.organization_id
      AND ur.role            = 'payroll'
  )
);

-- payroll_entries: payroll role can INSERT + UPDATE (own org, run not locked)
DROP POLICY IF EXISTS "Org payroll can write payroll entries" ON public.payroll_entries;
CREATE POLICY "Org payroll can write payroll entries"
ON public.payroll_entries
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id         = auth.uid()
      AND ur.organization_id = payroll_entries.organization_id
      AND ur.role            = 'payroll'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.payroll_runs pr
    WHERE pr.id = payroll_entries.payroll_run_id
      AND pr.status = 'locked'
  )
);

DROP POLICY IF EXISTS "Org payroll can update payroll entries" ON public.payroll_entries;
CREATE POLICY "Org payroll can update payroll entries"
ON public.payroll_entries
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id         = auth.uid()
      AND ur.organization_id = payroll_entries.organization_id
      AND ur.role            = 'payroll'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.payroll_runs pr
    WHERE pr.id = payroll_entries.payroll_run_id
      AND pr.status = 'locked'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id         = auth.uid()
      AND ur.organization_id = payroll_entries.organization_id
      AND ur.role            = 'payroll'
  )
);
