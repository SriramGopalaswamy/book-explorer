
-- =============================================
-- CROSS-MODULE LINKAGE COLUMNS
-- =============================================

-- Quote → Sales Order linkage
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id);

-- Sales Order / Delivery Note → Invoice linkage
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sales_order_id UUID REFERENCES public.sales_orders(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS delivery_note_id UUID REFERENCES public.delivery_notes(id);

-- Purchase Order / Goods Receipt → Bill linkage
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES public.purchase_orders(id);
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS goods_receipt_id UUID REFERENCES public.goods_receipts(id);

-- =============================================
-- PAYMENT RECEIPTS (customer payments against invoices)
-- =============================================
CREATE TABLE public.payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  receipt_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT NOT NULL,
  invoice_id UUID REFERENCES public.invoices(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  reference_number TEXT,
  bank_account_id UUID REFERENCES public.bank_accounts(id),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payment_receipts in their org" ON public.payment_receipts
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert payment_receipts in their org" ON public.payment_receipts
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update payment_receipts in their org" ON public.payment_receipts
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER set_payment_receipts_org
  BEFORE INSERT ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

-- =============================================
-- VENDOR PAYMENTS (payments against bills)
-- =============================================
CREATE TABLE public.vendor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  payment_number TEXT NOT NULL,
  vendor_id UUID REFERENCES public.vendors(id),
  vendor_name TEXT NOT NULL,
  bill_id UUID REFERENCES public.bills(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  reference_number TEXT,
  bank_account_id UUID REFERENCES public.bank_accounts(id),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'paid',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vendor_payments in their org" ON public.vendor_payments
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert vendor_payments in their org" ON public.vendor_payments
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update vendor_payments in their org" ON public.vendor_payments
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER set_vendor_payments_org
  BEFORE INSERT ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

-- =============================================
-- SALES RETURNS
-- =============================================
CREATE TABLE public.sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  return_number TEXT NOT NULL,
  sales_order_id UUID REFERENCES public.sales_orders(id),
  delivery_note_id UUID REFERENCES public.delivery_notes(id),
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT NOT NULL,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  credit_note_id UUID,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sales_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_return_id UUID NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sales_returns in their org" ON public.sales_returns
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert sales_returns in their org" ON public.sales_returns
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update sales_returns in their org" ON public.sales_returns
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view sales_return_items" ON public.sales_return_items
  FOR SELECT TO authenticated
  USING (sales_return_id IN (SELECT id FROM public.sales_returns WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Users can insert sales_return_items" ON public.sales_return_items
  FOR INSERT TO authenticated
  WITH CHECK (sales_return_id IN (SELECT id FROM public.sales_returns WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

CREATE TRIGGER set_sales_returns_org
  BEFORE INSERT ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

-- =============================================
-- PURCHASE RETURNS
-- =============================================
CREATE TABLE public.purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  return_number TEXT NOT NULL,
  purchase_order_id UUID REFERENCES public.purchase_orders(id),
  goods_receipt_id UUID REFERENCES public.goods_receipts(id),
  vendor_id UUID REFERENCES public.vendors(id),
  vendor_name TEXT NOT NULL,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  vendor_credit_id UUID,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_return_id UUID NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view purchase_returns in their org" ON public.purchase_returns
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert purchase_returns in their org" ON public.purchase_returns
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update purchase_returns in their org" ON public.purchase_returns
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view purchase_return_items" ON public.purchase_return_items
  FOR SELECT TO authenticated
  USING (purchase_return_id IN (SELECT id FROM public.purchase_returns WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Users can insert purchase_return_items" ON public.purchase_return_items
  FOR INSERT TO authenticated
  WITH CHECK (purchase_return_id IN (SELECT id FROM public.purchase_returns WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

CREATE TRIGGER set_purchase_returns_org
  BEFORE INSERT ON public.purchase_returns
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

-- =============================================
-- APPROVAL REQUESTS
-- =============================================
CREATE TABLE public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  workflow_id UUID REFERENCES public.approval_workflows(id),
  document_type TEXT NOT NULL,
  document_id UUID NOT NULL,
  document_number TEXT,
  document_amount NUMERIC,
  requested_by UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejected_by UUID,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view approval_requests in their org" ON public.approval_requests
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert approval_requests in their org" ON public.approval_requests
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update approval_requests in their org" ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER set_approval_requests_org
  BEFORE INSERT ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
