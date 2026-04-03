-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Allow authenticated users to toggle currency is_active flag.
--
-- The `currencies` table is a global reference table (no organization_id).
-- Previously no UPDATE RLS policy existed, so even admin users got a
-- "permission denied" error when trying to toggle a currency's active
-- status in the Exchange Rates → Currencies tab.
--
-- Resolution: grant UPDATE to any authenticated user.  The currencies
-- table contains only ISO reference data (code, name, symbol, decimals,
-- is_active); there is no sensitive per-org data here.
-- ═══════════════════════════════════════════════════════════════════════

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

-- Drop old conflicting policies if any
DROP POLICY IF EXISTS "Authenticated users can update currencies" ON public.currencies;

-- Allow any authenticated user to update the is_active flag (and other fields)
CREATE POLICY "Authenticated users can update currencies"
  ON public.currencies
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Ensure SELECT policy exists (idempotent)
DROP POLICY IF EXISTS "Anyone can read currencies" ON public.currencies;
CREATE POLICY "Anyone can read currencies"
  ON public.currencies
  FOR SELECT
  TO authenticated
  USING (true);
