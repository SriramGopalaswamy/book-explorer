
-- ===== PURCHASE ORDERS =====
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  po_number TEXT NOT NULL,
  vendor_id UUID REFERENCES public.vendors(id),
  vendor_name TEXT NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','ordered','partially_received','received','invoiced','cancelled')),
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, po_number)
);

CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  description TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  received_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== SALES ORDERS =====
CREATE TABLE public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  so_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','processing','partially_shipped','shipped','delivered','invoiced','cancelled')),
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, so_number)
);

CREATE TABLE public.sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  description TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  shipped_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== GOODS RECEIPTS =====
CREATE TABLE public.goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  grn_number TEXT NOT NULL,
  purchase_order_id UUID REFERENCES public.purchase_orders(id),
  vendor_id UUID REFERENCES public.vendors(id),
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','inspecting','accepted','rejected')),
  notes TEXT,
  received_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, grn_number)
);

CREATE TABLE public.goods_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id UUID REFERENCES public.purchase_order_items(id),
  item_id UUID REFERENCES public.items(id),
  description TEXT NOT NULL,
  ordered_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  received_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  accepted_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  rejected_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  warehouse_id UUID REFERENCES public.warehouses(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== DELIVERY NOTES =====
CREATE TABLE public.delivery_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  dn_number TEXT NOT NULL,
  sales_order_id UUID REFERENCES public.sales_orders(id),
  customer_id UUID REFERENCES public.customers(id),
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','dispatched','in_transit','delivered','returned')),
  notes TEXT,
  dispatched_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, dn_number)
);

CREATE TABLE public.delivery_note_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id UUID NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  sales_order_item_id UUID REFERENCES public.sales_order_items(id),
  item_id UUID REFERENCES public.items(id),
  description TEXT NOT NULL,
  ordered_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  shipped_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  warehouse_id UUID REFERENCES public.warehouses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== RLS =====
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

-- PO policies
CREATE POLICY "org_po_select" ON public.purchase_orders FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_po_insert" ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_po_update" ON public.purchase_orders FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_po_delete" ON public.purchase_orders FOR DELETE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- PO items inherit through parent
CREATE POLICY "po_items_select" ON public.purchase_order_items FOR SELECT TO authenticated
  USING (purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "po_items_insert" ON public.purchase_order_items FOR INSERT TO authenticated
  WITH CHECK (purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "po_items_update" ON public.purchase_order_items FOR UPDATE TO authenticated
  USING (purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "po_items_delete" ON public.purchase_order_items FOR DELETE TO authenticated
  USING (purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

-- SO policies
CREATE POLICY "org_so_select" ON public.sales_orders FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_so_insert" ON public.sales_orders FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_so_update" ON public.sales_orders FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_so_delete" ON public.sales_orders FOR DELETE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- SO items inherit through parent
CREATE POLICY "so_items_select" ON public.sales_order_items FOR SELECT TO authenticated
  USING (sales_order_id IN (SELECT id FROM public.sales_orders WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "so_items_insert" ON public.sales_order_items FOR INSERT TO authenticated
  WITH CHECK (sales_order_id IN (SELECT id FROM public.sales_orders WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "so_items_update" ON public.sales_order_items FOR UPDATE TO authenticated
  USING (sales_order_id IN (SELECT id FROM public.sales_orders WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "so_items_delete" ON public.sales_order_items FOR DELETE TO authenticated
  USING (sales_order_id IN (SELECT id FROM public.sales_orders WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

-- Goods receipts policies
CREATE POLICY "org_gr_select" ON public.goods_receipts FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_gr_insert" ON public.goods_receipts FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_gr_update" ON public.goods_receipts FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "gr_items_select" ON public.goods_receipt_items FOR SELECT TO authenticated
  USING (goods_receipt_id IN (SELECT id FROM public.goods_receipts WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "gr_items_insert" ON public.goods_receipt_items FOR INSERT TO authenticated
  WITH CHECK (goods_receipt_id IN (SELECT id FROM public.goods_receipts WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "gr_items_update" ON public.goods_receipt_items FOR UPDATE TO authenticated
  USING (goods_receipt_id IN (SELECT id FROM public.goods_receipts WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

-- Delivery notes policies
CREATE POLICY "org_dn_select" ON public.delivery_notes FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_dn_insert" ON public.delivery_notes FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "org_dn_update" ON public.delivery_notes FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "dn_items_select" ON public.delivery_note_items FOR SELECT TO authenticated
  USING (delivery_note_id IN (SELECT id FROM public.delivery_notes WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "dn_items_insert" ON public.delivery_note_items FOR INSERT TO authenticated
  WITH CHECK (delivery_note_id IN (SELECT id FROM public.delivery_notes WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "dn_items_update" ON public.delivery_note_items FOR UPDATE TO authenticated
  USING (delivery_note_id IN (SELECT id FROM public.delivery_notes WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

-- Auto-set org triggers
CREATE OR REPLACE FUNCTION public.auto_set_org_for_procurement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.profiles WHERE id = NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_po_org BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_procurement();
CREATE TRIGGER trg_so_org BEFORE INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_procurement();

CREATE OR REPLACE FUNCTION public.auto_set_org_for_receipts()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.profiles WHERE id = NEW.received_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_gr_org BEFORE INSERT ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_receipts();

CREATE OR REPLACE FUNCTION public.auto_set_org_for_delivery()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.profiles WHERE id = NEW.dispatched_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_dn_org BEFORE INSERT ON public.delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_for_delivery();
