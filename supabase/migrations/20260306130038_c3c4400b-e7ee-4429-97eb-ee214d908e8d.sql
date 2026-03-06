
-- ===== BIN LOCATIONS =====
CREATE TABLE public.bin_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  bin_code TEXT NOT NULL,
  zone TEXT,
  aisle TEXT,
  rack TEXT,
  level TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  capacity_units NUMERIC(12,3),
  current_units NUMERIC(12,3) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(warehouse_id, bin_code)
);

-- ===== STOCK TRANSFERS =====
CREATE TABLE public.stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  transfer_number TEXT NOT NULL,
  from_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  to_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_transit','received','cancelled')),
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID NOT NULL,
  received_by UUID,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, transfer_number)
);

CREATE TABLE public.stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  item_name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  from_bin_id UUID REFERENCES public.bin_locations(id),
  to_bin_id UUID REFERENCES public.bin_locations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== PICKING LISTS =====
CREATE TABLE public.picking_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  pick_number TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  sales_order_id UUID REFERENCES public.sales_orders(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  assigned_to UUID,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, pick_number)
);

CREATE TABLE public.picking_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  picking_list_id UUID NOT NULL REFERENCES public.picking_lists(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  item_name TEXT NOT NULL,
  required_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  picked_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  bin_id UUID REFERENCES public.bin_locations(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','picked','short')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== INVENTORY COUNTS =====
CREATE TABLE public.inventory_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  count_number TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  count_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','completed','approved')),
  notes TEXT,
  created_by UUID NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, count_number)
);

CREATE TABLE public.inventory_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  item_name TEXT NOT NULL,
  bin_id UUID REFERENCES public.bin_locations(id),
  system_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  counted_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  variance NUMERIC(12,3) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== RLS =====
ALTER TABLE public.bin_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.picking_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.picking_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;

-- Bin locations
CREATE POLICY "org_bin_select" ON public.bin_locations FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_bin_insert" ON public.bin_locations FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_bin_update" ON public.bin_locations FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_bin_delete" ON public.bin_locations FOR DELETE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Stock transfers
CREATE POLICY "org_st_select" ON public.stock_transfers FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_st_insert" ON public.stock_transfers FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_st_update" ON public.stock_transfers FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "st_items_select" ON public.stock_transfer_items FOR SELECT TO authenticated
  USING (transfer_id IN (SELECT id FROM public.stock_transfers WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "st_items_insert" ON public.stock_transfer_items FOR INSERT TO authenticated
  WITH CHECK (transfer_id IN (SELECT id FROM public.stock_transfers WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "st_items_update" ON public.stock_transfer_items FOR UPDATE TO authenticated
  USING (transfer_id IN (SELECT id FROM public.stock_transfers WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

-- Picking lists
CREATE POLICY "org_pl_select" ON public.picking_lists FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_pl_insert" ON public.picking_lists FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_pl_update" ON public.picking_lists FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "pl_items_select" ON public.picking_list_items FOR SELECT TO authenticated
  USING (picking_list_id IN (SELECT id FROM public.picking_lists WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "pl_items_insert" ON public.picking_list_items FOR INSERT TO authenticated
  WITH CHECK (picking_list_id IN (SELECT id FROM public.picking_lists WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "pl_items_update" ON public.picking_list_items FOR UPDATE TO authenticated
  USING (picking_list_id IN (SELECT id FROM public.picking_lists WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

-- Inventory counts
CREATE POLICY "org_ic_select" ON public.inventory_counts FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_ic_insert" ON public.inventory_counts FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_ic_update" ON public.inventory_counts FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "ic_items_select" ON public.inventory_count_items FOR SELECT TO authenticated
  USING (count_id IN (SELECT id FROM public.inventory_counts WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "ic_items_insert" ON public.inventory_count_items FOR INSERT TO authenticated
  WITH CHECK (count_id IN (SELECT id FROM public.inventory_counts WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "ic_items_update" ON public.inventory_count_items FOR UPDATE TO authenticated
  USING (count_id IN (SELECT id FROM public.inventory_counts WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

-- Auto-set org triggers
CREATE OR REPLACE FUNCTION public.auto_set_org_for_warehouse_ops()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.profiles WHERE id = NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_st_org BEFORE INSERT ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_warehouse_ops();
CREATE TRIGGER trg_pl_org BEFORE INSERT ON public.picking_lists
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_warehouse_ops();
CREATE TRIGGER trg_ic_org BEFORE INSERT ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_warehouse_ops();

-- Bin locations inherit org from warehouse
CREATE OR REPLACE FUNCTION public.auto_set_org_for_bin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.warehouses WHERE id = NEW.warehouse_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_bin_org BEFORE INSERT ON public.bin_locations
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_bin();
