
-- =============================================
-- CONNECTORS MODULE — Database Schema
-- =============================================

-- 1. Integrations (connector connections)
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  provider TEXT NOT NULL DEFAULT 'shopify',
  shop_domain TEXT,
  access_token TEXT, -- encrypted at rest by Supabase
  status TEXT NOT NULL DEFAULT 'disconnected', -- disconnected, connected, sync_error
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_integrations_tenant_provider ON public.integrations(organization_id, provider);
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view integrations in their org" ON public.integrations
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert integrations in their org" ON public.integrations
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update integrations in their org" ON public.integrations
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete integrations in their org" ON public.integrations
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER set_integrations_org
  BEFORE INSERT ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

-- 2. Shopify Orders
CREATE TABLE public.shopify_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  shopify_order_id TEXT NOT NULL,
  customer_id TEXT,
  order_number TEXT,
  order_total NUMERIC NOT NULL DEFAULT 0,
  tax_total NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  financial_status TEXT,
  fulfillment_status TEXT,
  order_payload JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_shopify_orders_unique ON public.shopify_orders(organization_id, shopify_order_id);
ALTER TABLE public.shopify_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shopify_orders in their org" ON public.shopify_orders
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert shopify_orders in their org" ON public.shopify_orders
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER set_shopify_orders_org
  BEFORE INSERT ON public.shopify_orders
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

-- 3. Shopify Customers
CREATE TABLE public.shopify_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  shopify_customer_id TEXT NOT NULL,
  email TEXT,
  name TEXT,
  phone TEXT,
  customer_payload JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_shopify_customers_unique ON public.shopify_customers(organization_id, shopify_customer_id);
ALTER TABLE public.shopify_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shopify_customers in their org" ON public.shopify_customers
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert shopify_customers in their org" ON public.shopify_customers
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER set_shopify_customers_org
  BEFORE INSERT ON public.shopify_customers
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

-- 4. Shopify Products
CREATE TABLE public.shopify_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  shopify_product_id TEXT NOT NULL,
  title TEXT,
  sku TEXT,
  price NUMERIC DEFAULT 0,
  product_payload JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_shopify_products_unique ON public.shopify_products(organization_id, shopify_product_id);
ALTER TABLE public.shopify_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shopify_products in their org" ON public.shopify_products
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert shopify_products in their org" ON public.shopify_products
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER set_shopify_products_org
  BEFORE INSERT ON public.shopify_products
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

-- 5. Connector Logs
CREATE TABLE public.connector_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL, -- oauth, sync, webhook, error
  status TEXT NOT NULL DEFAULT 'info', -- info, success, error, warning
  message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.connector_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view connector_logs in their org" ON public.connector_logs
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert connector_logs in their org" ON public.connector_logs
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER set_connector_logs_org
  BEFORE INSERT ON public.connector_logs
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();
