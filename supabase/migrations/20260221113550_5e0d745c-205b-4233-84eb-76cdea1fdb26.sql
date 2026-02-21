
-- Fix Issue 1: quotes table - add user-scoped SELECT and fix ALL with WITH CHECK
-- Current: only ALL policy with user_id = auth.uid() but no WITH CHECK
DROP POLICY IF EXISTS "Users can manage their own quotes" ON public.quotes;

CREATE POLICY "Users can view own quotes"
ON public.quotes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own quotes"
ON public.quotes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quotes"
ON public.quotes FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own quotes"
ON public.quotes FOR DELETE
USING (auth.uid() = user_id);

-- Fix Issue 2: vendor_credits ALL policy missing WITH CHECK
DROP POLICY IF EXISTS "Finance and admin can manage vendor credits" ON public.vendor_credits;

CREATE POLICY "Finance and admin can manage vendor credits"
ON public.vendor_credits FOR ALL
USING (is_admin_or_finance(auth.uid()))
WITH CHECK (is_admin_or_finance(auth.uid()));
