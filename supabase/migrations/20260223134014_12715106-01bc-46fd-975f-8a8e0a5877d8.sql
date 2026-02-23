
-- Phase 2: Structured AI Engine Tables
-- These tables store deterministic, structured financial insights (no freeform LLM output)

-- 1. AI Financial Snapshots — periodic org-level financial health summaries
CREATE TABLE public.ai_financial_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  health_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  cash_position NUMERIC(15,2) NOT NULL DEFAULT 0,
  burn_rate_daily NUMERIC(15,2) DEFAULT 0,
  runway_days INTEGER DEFAULT 0,
  revenue_30d NUMERIC(15,2) DEFAULT 0,
  expenses_30d NUMERIC(15,2) DEFAULT 0,
  net_margin_pct NUMERIC(5,2) DEFAULT 0,
  receivables_total NUMERIC(15,2) DEFAULT 0,
  receivables_overdue NUMERIC(15,2) DEFAULT 0,
  payables_total NUMERIC(15,2) DEFAULT 0,
  payables_overdue NUMERIC(15,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, snapshot_date)
);

-- 2. AI Customer Profiles — structured risk/value scoring per customer
CREATE TABLE public.ai_customer_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  lifetime_value NUMERIC(15,2) DEFAULT 0,
  avg_payment_days INTEGER DEFAULT 0,
  overdue_invoices_count INTEGER DEFAULT 0,
  overdue_amount NUMERIC(15,2) DEFAULT 0,
  last_payment_date DATE,
  trend TEXT DEFAULT 'stable' CHECK (trend IN ('improving','stable','declining')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, customer_id)
);

-- 3. AI Vendor Profiles — structured vendor reliability scoring
CREATE TABLE public.ai_vendor_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  reliability_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_spend NUMERIC(15,2) DEFAULT 0,
  avg_delivery_days INTEGER DEFAULT 0,
  dispute_count INTEGER DEFAULT 0,
  last_bill_date DATE,
  trend TEXT DEFAULT 'stable' CHECK (trend IN ('improving','stable','declining')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, vendor_id)
);

-- 4. AI Alerts — structured, categorized financial alerts
CREATE TABLE public.ai_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'cash_low','burn_rate_high','margin_drift','overdue_receivable',
    'overdue_payable','compliance_risk','customer_risk','vendor_risk',
    'revenue_drop','expense_spike'
  )),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  description TEXT,
  entity_type TEXT, -- 'customer','vendor','invoice','bill', etc.
  entity_id UUID,
  amount NUMERIC(15,2),
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. AI Risk Scores — org-level composite risk dimensions
CREATE TABLE public.ai_risk_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  score_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cash_risk NUMERIC(5,2) NOT NULL DEFAULT 0,
  receivables_risk NUMERIC(5,2) NOT NULL DEFAULT 0,
  margin_risk NUMERIC(5,2) NOT NULL DEFAULT 0,
  compliance_risk NUMERIC(5,2) NOT NULL DEFAULT 0,
  overall_risk NUMERIC(5,2) NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, score_date)
);

-- Indexes for performance
CREATE INDEX idx_ai_snapshots_org_date ON public.ai_financial_snapshots(organization_id, snapshot_date DESC);
CREATE INDEX idx_ai_alerts_org_unresolved ON public.ai_alerts(organization_id, is_resolved, created_at DESC);
CREATE INDEX idx_ai_alerts_org_type ON public.ai_alerts(organization_id, alert_type);
CREATE INDEX idx_ai_risk_org_date ON public.ai_risk_scores(organization_id, score_date DESC);
CREATE INDEX idx_ai_customer_profiles_org ON public.ai_customer_profiles(organization_id);
CREATE INDEX idx_ai_vendor_profiles_org ON public.ai_vendor_profiles(organization_id);

-- Enable RLS on all tables
ALTER TABLE public.ai_financial_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_vendor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_risk_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies: org-scoped read for finance roles, write via backend only

-- ai_financial_snapshots
CREATE POLICY "Org finance can view snapshots"
  ON public.ai_financial_snapshots FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Service role can manage snapshots"
  ON public.ai_financial_snapshots FOR ALL
  USING (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()));

-- ai_customer_profiles
CREATE POLICY "Org finance can view customer profiles"
  ON public.ai_customer_profiles FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Service role can manage customer profiles"
  ON public.ai_customer_profiles FOR ALL
  USING (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()));

-- ai_vendor_profiles
CREATE POLICY "Org finance can view vendor profiles"
  ON public.ai_vendor_profiles FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Service role can manage vendor profiles"
  ON public.ai_vendor_profiles FOR ALL
  USING (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()));

-- ai_alerts
CREATE POLICY "Org finance can view alerts"
  ON public.ai_alerts FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Org finance can resolve alerts"
  ON public.ai_alerts FOR UPDATE
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Service role can manage alerts"
  ON public.ai_alerts FOR ALL
  USING (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()));

-- ai_risk_scores
CREATE POLICY "Org finance can view risk scores"
  ON public.ai_risk_scores FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Service role can manage risk scores"
  ON public.ai_risk_scores FOR ALL
  USING (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()));

-- Updated_at triggers
CREATE TRIGGER update_ai_financial_snapshots_updated_at
  BEFORE UPDATE ON public.ai_financial_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_customer_profiles_updated_at
  BEFORE UPDATE ON public.ai_customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_vendor_profiles_updated_at
  BEFORE UPDATE ON public.ai_vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_alerts_updated_at
  BEFORE UPDATE ON public.ai_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_risk_scores_updated_at
  BEFORE UPDATE ON public.ai_risk_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
