-- Drop all broken RLS policies that use profiles.id = auth.uid() (should be profiles.user_id)

-- warehouses (2 broken, correct org_wh_* policies remain)
DROP POLICY IF EXISTS "Admins can manage warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Users can view own org warehouses" ON public.warehouses;

-- stock_adjustments (2 broken)
DROP POLICY IF EXISTS "Users can view own org adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Admins can manage adjustments" ON public.stock_adjustments;

-- stock_adjustment_items (2 broken)
DROP POLICY IF EXISTS "Users can view own org adj items" ON public.stock_adjustment_items;
DROP POLICY IF EXISTS "Admins can manage adj items" ON public.stock_adjustment_items;

-- units_of_measure (2 broken)
DROP POLICY IF EXISTS "Users can view own org UOMs" ON public.units_of_measure;
DROP POLICY IF EXISTS "Admins can manage UOMs" ON public.units_of_measure;

-- purchase_return_items (1 broken SELECT + 1 INSERT with no qual)
DROP POLICY IF EXISTS "Users can view purchase_return_items" ON public.purchase_return_items;
DROP POLICY IF EXISTS "Users can insert purchase_return_items" ON public.purchase_return_items;

-- sales_return_items (1 broken SELECT + 1 INSERT with no qual)
DROP POLICY IF EXISTS "Users can view sales_return_items" ON public.sales_return_items;
DROP POLICY IF EXISTS "Users can insert sales_return_items" ON public.sales_return_items;

-- work_orders (1 broken DELETE)
DROP POLICY IF EXISTS "org_wo_delete" ON public.work_orders;