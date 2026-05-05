-- =============================================================================
-- FIX: payroll role has no visibility into payroll_runs / payroll_entries /
--      profiles after migration 20260427060725 reverted the helper-function
--      approach (which briefly included 'payroll' in is_org_admin_or_finance).
--
-- Root cause (FMEA 4.1 / 4.3):
--   The original table policy "HR/Finance can manage payroll runs" delegates to
--   is_org_admin_or_finance(), which as of 060725 only covers admin + finance.
--   Users whose sole role is 'payroll' therefore see an empty list for both
--   payroll_runs and payroll_entries — indistinguishable from "no data".
--   Additionally, the profiles SELECT policy for the payroll role was dropped
--   by 060725, breaking profile lookups used by payroll-register bulk upload.
--
-- Fix:
--   Add three narrow SELECT-only policies scoped to the payroll role.
--   These do NOT grant INSERT/UPDATE/DELETE — that still requires admin/finance.
-- =============================================================================

-- 1. payroll_runs: payroll role can SELECT within own org
DROP POLICY IF EXISTS "Org payroll can view payroll runs" ON public.payroll_runs;
CREATE POLICY "Org payroll can view payroll runs"
ON public.payroll_runs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id         = auth.uid()
      AND ur.organization_id = payroll_runs.organization_id
      AND ur.role            = 'payroll'
  )
);

-- 2. payroll_entries: payroll role can SELECT within own org
DROP POLICY IF EXISTS "Org payroll can view payroll entries" ON public.payroll_entries;
CREATE POLICY "Org payroll can view payroll entries"
ON public.payroll_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id         = auth.uid()
      AND ur.organization_id = payroll_entries.organization_id
      AND ur.role            = 'payroll'
  )
);

-- 3. profiles: payroll role can SELECT profiles within own org
--    (needed for bulk-upload profile lookup and PayrollEnginePanel name display)
DROP POLICY IF EXISTS "Org payroll can view profiles" ON public.profiles;
CREATE POLICY "Org payroll can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id         = auth.uid()
      AND ur.organization_id = profiles.organization_id
      AND ur.role            = 'payroll'
  )
);
