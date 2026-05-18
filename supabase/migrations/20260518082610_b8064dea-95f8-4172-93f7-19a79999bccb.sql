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