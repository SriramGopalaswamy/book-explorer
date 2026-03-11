-- Fix stock_ledger RLS: drop old policies using profiles.id = auth.uid() (wrong)
DROP POLICY IF EXISTS "Admins can insert stock ledger" ON public.stock_ledger;
DROP POLICY IF EXISTS "Users can view own org stock ledger" ON public.stock_ledger;