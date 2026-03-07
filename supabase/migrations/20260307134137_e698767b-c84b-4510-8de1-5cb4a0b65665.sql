
-- Generic updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- GST E-Way Bill table
CREATE TABLE public.eway_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  eway_bill_number TEXT,
  eway_bill_date TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  supply_type TEXT NOT NULL DEFAULT 'outward',
  sub_supply_type TEXT DEFAULT 'supply',
  document_type TEXT DEFAULT 'invoice',
  document_number TEXT,
  document_date DATE,
  from_gstin TEXT,
  from_name TEXT,
  from_address TEXT,
  from_place TEXT,
  from_state_code TEXT,
  from_pincode TEXT,
  to_gstin TEXT,
  to_name TEXT,
  to_address TEXT,
  to_place TEXT,
  to_state_code TEXT,
  to_pincode TEXT,
  hsn_code TEXT,
  product_name TEXT,
  product_description TEXT,
  quantity NUMERIC DEFAULT 0,
  unit TEXT DEFAULT 'NOS',
  taxable_value NUMERIC NOT NULL DEFAULT 0,
  cgst_rate NUMERIC DEFAULT 0,
  sgst_rate NUMERIC DEFAULT 0,
  igst_rate NUMERIC DEFAULT 0,
  cess_rate NUMERIC DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  transporter_id TEXT,
  transporter_name TEXT,
  transport_mode TEXT DEFAULT 'road',
  transport_doc_number TEXT,
  transport_doc_date DATE,
  vehicle_number TEXT,
  vehicle_type TEXT DEFAULT 'regular',
  invoice_id UUID REFERENCES public.invoices(id),
  delivery_note_id UUID REFERENCES public.delivery_notes(id),
  sales_order_id UUID REFERENCES public.sales_orders(id),
  distance_km NUMERIC DEFAULT 0,
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  extended_count INT DEFAULT 0,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eway_bills_org ON public.eway_bills(organization_id);
CREATE INDEX idx_eway_bills_status ON public.eway_bills(status);
CREATE INDEX idx_eway_bills_number ON public.eway_bills(eway_bill_number);
CREATE INDEX idx_eway_bills_invoice ON public.eway_bills(invoice_id);

ALTER TABLE public.eway_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org eway_bills"
  ON public.eway_bills FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert own org eway_bills"
  ON public.eway_bills FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update own org eway_bills"
  ON public.eway_bills FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION public.auto_set_eway_bill_org()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.profiles WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_eway_bill_org BEFORE INSERT ON public.eway_bills FOR EACH ROW EXECUTE FUNCTION public.auto_set_eway_bill_org();
CREATE TRIGGER trg_eway_bill_updated BEFORE UPDATE ON public.eway_bills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
