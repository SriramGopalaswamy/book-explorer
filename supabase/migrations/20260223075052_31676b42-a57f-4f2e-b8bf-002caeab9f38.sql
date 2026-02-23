
-- Fix RLS on master_coa_template (read-only reference table)
ALTER TABLE public.master_coa_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read master COA template"
  ON public.master_coa_template FOR SELECT
  USING (auth.uid() IS NOT NULL);
