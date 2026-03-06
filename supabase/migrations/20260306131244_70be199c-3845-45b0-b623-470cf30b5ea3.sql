
-- =============================================
-- 1. SHIPPING & LOGISTICS on delivery_notes
-- =============================================
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS carrier_name TEXT;
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS tracking_url TEXT;
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS shipping_method TEXT DEFAULT 'standard';
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS estimated_delivery DATE;
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS actual_delivery DATE;
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS weight_kg NUMERIC;
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS packages_count INTEGER DEFAULT 1;

-- =============================================
-- 2. MULTI-CURRENCY: currencies & exchange_rates
-- =============================================
CREATE TABLE public.currencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL DEFAULT '',
  decimal_places INTEGER NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed common currencies
INSERT INTO public.currencies (code, name, symbol) VALUES
  ('INR', 'Indian Rupee', '₹'),
  ('USD', 'US Dollar', '$'),
  ('EUR', 'Euro', '€'),
  ('GBP', 'British Pound', '£'),
  ('AED', 'UAE Dirham', 'د.إ'),
  ('SGD', 'Singapore Dollar', 'S$'),
  ('JPY', 'Japanese Yen', '¥'),
  ('AUD', 'Australian Dollar', 'A$'),
  ('CAD', 'Canadian Dollar', 'C$'),
  ('CHF', 'Swiss Franc', 'CHF');

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view currencies" ON public.currencies FOR SELECT TO authenticated USING (true);

CREATE TABLE public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  from_currency TEXT NOT NULL DEFAULT 'INR',
  to_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL DEFAULT 1,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, from_currency, to_currency, effective_date)
);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view exchange_rates in their org" ON public.exchange_rates
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert exchange_rates in their org" ON public.exchange_rates
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update exchange_rates in their org" ON public.exchange_rates
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER set_exchange_rates_org
  BEFORE INSERT ON public.exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

-- Add currency columns to financial documents
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'INR';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC DEFAULT 1;

ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'INR';
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC DEFAULT 1;

ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'INR';
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC DEFAULT 1;

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'INR';
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC DEFAULT 1;

-- =============================================
-- 3. GST FILING STATUS TRACKING
-- =============================================
CREATE TABLE public.gst_filing_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  filing_type TEXT NOT NULL, -- gstr1, gstr3b, gstr9
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  financial_year TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started', -- not_started, preparing, ready, filed, acknowledged
  filed_date DATE,
  filed_by UUID,
  arn_number TEXT, -- acknowledgment reference number from GST portal
  total_tax_liability NUMERIC DEFAULT 0,
  total_itc_claimed NUMERIC DEFAULT 0,
  net_tax_payable NUMERIC DEFAULT 0,
  challan_number TEXT,
  challan_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, filing_type, period_month, period_year)
);

ALTER TABLE public.gst_filing_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view gst_filing_status in their org" ON public.gst_filing_status
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert gst_filing_status in their org" ON public.gst_filing_status
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update gst_filing_status in their org" ON public.gst_filing_status
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER set_gst_filing_status_org
  BEFORE INSERT ON public.gst_filing_status
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
