
-- ===== BILL OF MATERIALS =====
CREATE TABLE public.bill_of_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  bom_code TEXT NOT NULL,
  product_item_id UUID REFERENCES public.items(id),
  product_name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, bom_code)
);

CREATE TABLE public.bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID NOT NULL REFERENCES public.bill_of_materials(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  material_name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  uom TEXT NOT NULL DEFAULT 'pcs',
  wastage_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== WORK ORDERS =====
CREATE TABLE public.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  wo_number TEXT NOT NULL,
  bom_id UUID REFERENCES public.bill_of_materials(id),
  product_item_id UUID REFERENCES public.items(id),
  product_name TEXT NOT NULL,
  planned_quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  completed_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  rejected_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planned','in_progress','completed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  planned_start DATE,
  planned_end DATE,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  warehouse_id UUID REFERENCES public.warehouses(id),
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, wo_number)
);

-- ===== MATERIAL CONSUMPTION =====
CREATE TABLE public.material_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  material_name TEXT NOT NULL,
  planned_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  actual_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  wastage_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  warehouse_id UUID REFERENCES public.warehouses(id),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== FINISHED GOODS ENTRIES =====
CREATE TABLE public.finished_goods_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id),
  item_id UUID REFERENCES public.items(id),
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  rejected_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  warehouse_id UUID REFERENCES public.warehouses(id),
  cost_per_unit NUMERIC(15,2),
  total_cost NUMERIC(15,2),
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== RLS =====
ALTER TABLE public.bill_of_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finished_goods_entries ENABLE ROW LEVEL SECURITY;

-- BOM policies
CREATE POLICY "org_bom_select" ON public.bill_of_materials FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_bom_insert" ON public.bill_of_materials FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_bom_update" ON public.bill_of_materials FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_bom_delete" ON public.bill_of_materials FOR DELETE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- BOM lines inherit through parent
CREATE POLICY "bom_lines_select" ON public.bom_lines FOR SELECT TO authenticated
  USING (bom_id IN (SELECT id FROM public.bill_of_materials WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "bom_lines_insert" ON public.bom_lines FOR INSERT TO authenticated
  WITH CHECK (bom_id IN (SELECT id FROM public.bill_of_materials WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "bom_lines_update" ON public.bom_lines FOR UPDATE TO authenticated
  USING (bom_id IN (SELECT id FROM public.bill_of_materials WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "bom_lines_delete" ON public.bom_lines FOR DELETE TO authenticated
  USING (bom_id IN (SELECT id FROM public.bill_of_materials WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

-- Work order policies
CREATE POLICY "org_wo_select" ON public.work_orders FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_wo_insert" ON public.work_orders FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_wo_update" ON public.work_orders FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_wo_delete" ON public.work_orders FOR DELETE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Material consumption policies
CREATE POLICY "org_mc_select" ON public.material_consumption FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_mc_insert" ON public.material_consumption FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_mc_update" ON public.material_consumption FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Finished goods policies
CREATE POLICY "org_fg_select" ON public.finished_goods_entries FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_fg_insert" ON public.finished_goods_entries FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_fg_update" ON public.finished_goods_entries FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Auto-set org triggers for manufacturing tables
CREATE TRIGGER trg_bom_org BEFORE INSERT ON public.bill_of_materials
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_procurement();
CREATE TRIGGER trg_wo_org BEFORE INSERT ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_procurement();

CREATE OR REPLACE FUNCTION public.auto_set_org_for_manufacturing_child()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    IF TG_TABLE_NAME = 'material_consumption' THEN
      SELECT organization_id INTO NEW.organization_id FROM public.work_orders WHERE id = NEW.work_order_id;
    ELSIF TG_TABLE_NAME = 'finished_goods_entries' THEN
      SELECT organization_id INTO NEW.organization_id FROM public.work_orders WHERE id = NEW.work_order_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_mc_org BEFORE INSERT ON public.material_consumption
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_manufacturing_child();
CREATE TRIGGER trg_fg_org BEFORE INSERT ON public.finished_goods_entries
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_manufacturing_child();
