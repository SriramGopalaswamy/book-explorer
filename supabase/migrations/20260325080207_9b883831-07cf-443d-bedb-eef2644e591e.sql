
ALTER TABLE public.work_orders DROP CONSTRAINT work_orders_bom_id_fkey;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_bom_id_fkey 
  FOREIGN KEY (bom_id) REFERENCES public.bill_of_materials(id) ON DELETE SET NULL;
