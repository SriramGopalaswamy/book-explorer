CREATE TABLE IF NOT EXISTS public.inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  item_id uuid,
  item_name text NOT NULL,
  expected_qty numeric NOT NULL DEFAULT 0,
  actual_qty numeric,
  variance numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_count_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "count_lines_select" ON public.inventory_count_lines FOR SELECT TO authenticated
  USING (count_id IN (SELECT id FROM public.inventory_counts WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())));

CREATE POLICY "count_lines_insert" ON public.inventory_count_lines FOR INSERT TO authenticated
  WITH CHECK (count_id IN (SELECT id FROM public.inventory_counts WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())));

CREATE POLICY "count_lines_update" ON public.inventory_count_lines FOR UPDATE TO authenticated
  USING (count_id IN (SELECT id FROM public.inventory_counts WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())));

CREATE POLICY "count_lines_delete" ON public.inventory_count_lines FOR DELETE TO authenticated
  USING (count_id IN (SELECT id FROM public.inventory_counts WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())));