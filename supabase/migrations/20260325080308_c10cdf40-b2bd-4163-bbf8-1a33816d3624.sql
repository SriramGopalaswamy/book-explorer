
ALTER TABLE public.inventory_counts DROP CONSTRAINT inventory_counts_status_check;
ALTER TABLE public.inventory_counts ADD CONSTRAINT inventory_counts_status_check 
  CHECK (status = ANY (ARRAY['draft', 'in_progress', 'completed', 'approved', 'posted']));
