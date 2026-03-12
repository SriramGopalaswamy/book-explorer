-- Fix exchange_rates RLS: use profiles.user_id (auth UUID), not profiles.id (row UUID)
-- The original migration used profiles.id which is auto-generated and never equals auth.uid(),
-- causing all INSERT attempts to be rejected by RLS.

DROP POLICY IF EXISTS "Users can insert exchange_rates in their org" ON public.exchange_rates;
DROP POLICY IF EXISTS "Users can view exchange_rates in their org" ON public.exchange_rates;
DROP POLICY IF EXISTS "Users can update exchange_rates in their org" ON public.exchange_rates;

CREATE POLICY "Users can insert exchange_rates in their org"
  ON public.exchange_rates FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view exchange_rates in their org"
  ON public.exchange_rates FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update exchange_rates in their org"
  ON public.exchange_rates FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );
