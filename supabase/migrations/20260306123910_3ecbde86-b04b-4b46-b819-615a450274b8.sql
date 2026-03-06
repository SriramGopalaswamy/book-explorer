
-- Units of Measure
CREATE TABLE public.units_of_measure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'quantity',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, abbreviation)
);

ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org UOMs" ON public.units_of_measure
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage UOMs" ON public.units_of_measure
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Items Master
CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  item_type TEXT NOT NULL DEFAULT 'product' CHECK (item_type IN ('product', 'service', 'raw_material', 'finished_good', 'consumable')),
  uom_id UUID REFERENCES public.units_of_measure(id),
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  selling_price NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  hsn_code TEXT,
  reorder_level NUMERIC DEFAULT 0,
  reorder_quantity NUMERIC DEFAULT 0,
  opening_stock NUMERIC DEFAULT 0,
  current_stock NUMERIC DEFAULT 0,
  stock_value NUMERIC DEFAULT 0,
  valuation_method TEXT NOT NULL DEFAULT 'fifo' CHECK (valuation_method IN ('fifo', 'lifo', 'weighted_average')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, sku)
);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org items" ON public.items
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage items" ON public.items
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Warehouses
CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'India',
  pincode TEXT,
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  capacity_units NUMERIC,
  current_utilization NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org warehouses" ON public.warehouses
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage warehouses" ON public.warehouses
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Stock Ledger (immutable movement log)
CREATE TABLE public.stock_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'sale', 'transfer_in', 'transfer_out', 'adjustment', 'production_in', 'production_out', 'opening', 'return')),
  quantity NUMERIC NOT NULL,
  rate NUMERIC NOT NULL DEFAULT 0,
  value NUMERIC NOT NULL DEFAULT 0,
  balance_qty NUMERIC NOT NULL DEFAULT 0,
  balance_value NUMERIC NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id UUID,
  batch_no TEXT,
  serial_no TEXT,
  notes TEXT,
  posted_by UUID REFERENCES auth.users(id),
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org stock ledger" ON public.stock_ledger
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can insert stock ledger" ON public.stock_ledger
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Stock Adjustments
CREATE TABLE public.stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  adjustment_number TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'posted', 'cancelled')),
  notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, adjustment_number)
);

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org adjustments" ON public.stock_adjustments
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage adjustments" ON public.stock_adjustments
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Stock Adjustment Items
CREATE TABLE public.stock_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  current_qty NUMERIC NOT NULL DEFAULT 0,
  new_qty NUMERIC NOT NULL DEFAULT 0,
  difference_qty NUMERIC GENERATED ALWAYS AS (new_qty - current_qty) STORED,
  rate NUMERIC NOT NULL DEFAULT 0,
  value_impact NUMERIC GENERATED ALWAYS AS ((new_qty - current_qty) * rate) STORED,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_adjustment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org adj items" ON public.stock_adjustment_items
  FOR SELECT TO authenticated
  USING (adjustment_id IN (SELECT id FROM public.stock_adjustments WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Admins can manage adj items" ON public.stock_adjustment_items
  FOR ALL TO authenticated
  USING (adjustment_id IN (SELECT id FROM public.stock_adjustments WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())))
  WITH CHECK (adjustment_id IN (SELECT id FROM public.stock_adjustments WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

-- Indexes
CREATE INDEX idx_items_org ON public.items(organization_id);
CREATE INDEX idx_items_sku ON public.items(organization_id, sku);
CREATE INDEX idx_items_category ON public.items(organization_id, category);
CREATE INDEX idx_warehouses_org ON public.warehouses(organization_id);
CREATE INDEX idx_stock_ledger_item ON public.stock_ledger(item_id);
CREATE INDEX idx_stock_ledger_warehouse ON public.stock_ledger(warehouse_id);
CREATE INDEX idx_stock_ledger_org_item ON public.stock_ledger(organization_id, item_id);
CREATE INDEX idx_stock_adjustments_org ON public.stock_adjustments(organization_id);

-- Auto-set organization_id triggers
CREATE OR REPLACE FUNCTION public.auto_set_org_for_inventory()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.profiles WHERE id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_items_auto_org BEFORE INSERT ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_inventory();

CREATE TRIGGER trg_warehouses_auto_org BEFORE INSERT ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_inventory();

CREATE TRIGGER trg_uom_auto_org BEFORE INSERT ON public.units_of_measure
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_inventory();

CREATE TRIGGER trg_stock_ledger_auto_org BEFORE INSERT ON public.stock_ledger
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_inventory();

CREATE TRIGGER trg_stock_adj_auto_org BEFORE INSERT ON public.stock_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_inventory();
