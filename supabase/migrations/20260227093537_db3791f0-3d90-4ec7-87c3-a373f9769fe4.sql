
-- ============================================================================
-- GRX10 Indian CA Audit Intelligence System (ICAIS) - Phase 1 Schema
-- ============================================================================

-- 1. Compliance Audit Runs (tracks each compliance check execution)
CREATE TABLE public.audit_compliance_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  financial_year TEXT NOT NULL, -- e.g. '2025-26'
  run_type TEXT NOT NULL DEFAULT 'full', -- full, gst, tds, it, ifc, assets
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
  compliance_score INT, -- 0-100
  ai_risk_index INT, -- 0-100
  ifc_rating TEXT, -- Strong, Moderate, Weak
  score_breakdown JSONB DEFAULT '{}', -- { gst: 25, tds: 20, ... }
  risk_breakdown JSONB DEFAULT '{}', -- { revenue_pattern: 20, ... }
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  run_by UUID NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_compliance_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view compliance runs"
  ON public.audit_compliance_runs FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admin/Finance can insert compliance runs"
  ON public.audit_compliance_runs FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_finance(auth.uid()) AND is_org_member(auth.uid(), organization_id));

-- 2. Compliance Check Results (individual check outcomes per run)
CREATE TABLE public.audit_compliance_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.audit_compliance_runs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  module TEXT NOT NULL, -- gst, tds, income_tax, fixed_assets, ifc
  check_code TEXT NOT NULL, -- e.g. 'GST_GSTIN_FORMAT', 'TDS_194C_THRESHOLD'
  check_name TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info', -- info, warning, critical
  status TEXT NOT NULL DEFAULT 'pass', -- pass, fail, warning, na
  details JSONB DEFAULT '{}', -- specifics of what was found
  affected_count INT DEFAULT 0,
  affected_amount NUMERIC(15,2) DEFAULT 0,
  recommendation TEXT,
  data_references JSONB DEFAULT '[]', -- array of { entity_type, entity_id, description }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_compliance_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view compliance checks"
  ON public.audit_compliance_checks FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admin/Finance can insert compliance checks"
  ON public.audit_compliance_checks FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_finance(auth.uid()) AND is_org_member(auth.uid(), organization_id));

-- 3. AI Risk Themes (clustered risk groupings)
CREATE TABLE public.audit_risk_themes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.audit_compliance_runs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  theme_name TEXT NOT NULL,
  risk_score INT NOT NULL DEFAULT 0, -- 0-100
  confidence_score INT NOT NULL DEFAULT 0, -- 0-100
  impact_area TEXT NOT NULL, -- revenue, gst, tds, cash, assets, controls, related_party
  impacted_value NUMERIC(15,2) DEFAULT 0,
  transaction_count INT DEFAULT 0,
  contributing_flags JSONB DEFAULT '[]', -- array of check_ids or descriptions
  explanation TEXT,
  suggested_action TEXT,
  historical_comparison JSONB DEFAULT '{}', -- { last_year_score, trend }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_risk_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view risk themes"
  ON public.audit_risk_themes FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admin/Finance can insert risk themes"
  ON public.audit_risk_themes FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_finance(auth.uid()) AND is_org_member(auth.uid(), organization_id));

-- 4. AI Anomaly Detections (individual anomalies flagged by AI)
CREATE TABLE public.audit_ai_anomalies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.audit_compliance_runs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  anomaly_type TEXT NOT NULL, -- revenue_clustering, round_figure, manual_spike, odd_hour, etc.
  risk_score INT NOT NULL DEFAULT 0,
  trigger_condition TEXT NOT NULL, -- deterministic explanation
  data_reference JSONB DEFAULT '{}', -- { entity_type, entity_id, amount, date }
  deviation_pct NUMERIC(8,2), -- % deviation from historical mean
  last_year_value NUMERIC(15,2),
  current_value NUMERIC(15,2),
  confidence_score INT DEFAULT 0,
  suggested_audit_action TEXT,
  theme_id UUID REFERENCES public.audit_risk_themes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_ai_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view anomalies"
  ON public.audit_ai_anomalies FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admin/Finance can insert anomalies"
  ON public.audit_ai_anomalies FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_finance(auth.uid()) AND is_org_member(auth.uid(), organization_id));

-- 5. AI Audit Samples (smart sampling suggestions)
CREATE TABLE public.audit_ai_samples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.audit_compliance_runs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  sample_type TEXT NOT NULL, -- high_risk, stratified, random
  sample_name TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- journal_entry, invoice, expense, bill
  entity_id UUID NOT NULL,
  entity_reference TEXT, -- human-readable ref like invoice number
  risk_weight NUMERIC(5,2) DEFAULT 0,
  reason_selected TEXT NOT NULL,
  amount NUMERIC(15,2),
  transaction_date DATE,
  metadata JSONB DEFAULT '{}',
  is_accepted BOOLEAN, -- null = pending, true = accepted, false = regenerated
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_ai_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view audit samples"
  ON public.audit_ai_samples FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admin/Finance can manage audit samples"
  ON public.audit_ai_samples FOR ALL TO authenticated
  USING (is_admin_or_finance(auth.uid()) AND is_org_member(auth.uid(), organization_id))
  WITH CHECK (is_admin_or_finance(auth.uid()) AND is_org_member(auth.uid(), organization_id));

-- 6. AI Narratives (generated commentary per FY)
CREATE TABLE public.audit_ai_narratives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.audit_compliance_runs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  financial_year TEXT NOT NULL,
  narrative_type TEXT NOT NULL, -- executive_summary, gst_risk, tds_risk, revenue_pattern, controls, procedures
  content TEXT NOT NULL,
  data_points JSONB DEFAULT '[]', -- actual data cited
  version INT NOT NULL DEFAULT 1,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_ai_narratives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view narratives"
  ON public.audit_ai_narratives FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admin/Finance can insert narratives"
  ON public.audit_ai_narratives FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_finance(auth.uid()) AND is_org_member(auth.uid(), organization_id));

-- 7. Audit Pack Generation Log
CREATE TABLE public.audit_pack_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  financial_year TEXT NOT NULL,
  run_id UUID REFERENCES public.audit_compliance_runs(id),
  exported_by UUID NOT NULL,
  export_type TEXT NOT NULL DEFAULT 'full', -- full, section-specific
  sections_included TEXT[] DEFAULT '{}',
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'generating', -- generating, completed, failed
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_pack_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view audit pack exports"
  ON public.audit_pack_exports FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admin/Finance can manage audit pack exports"
  ON public.audit_pack_exports FOR ALL TO authenticated
  USING (is_admin_or_finance(auth.uid()) AND is_org_member(auth.uid(), organization_id))
  WITH CHECK (is_admin_or_finance(auth.uid()) AND is_org_member(auth.uid(), organization_id));

-- 8. IFC (Internal Financial Controls) Assessment
CREATE TABLE public.audit_ifc_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.audit_compliance_runs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  check_type TEXT NOT NULL, -- sod_conflict, admin_override, backdated_entry, period_unlock, high_risk_journal
  check_name TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  status TEXT NOT NULL DEFAULT 'pass', -- pass, fail, warning
  details JSONB DEFAULT '{}',
  affected_user_ids UUID[] DEFAULT '{}',
  affected_count INT DEFAULT 0,
  recommendation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_ifc_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view IFC assessments"
  ON public.audit_ifc_assessments FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admin/Finance can insert IFC assessments"
  ON public.audit_ifc_assessments FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_finance(auth.uid()) AND is_org_member(auth.uid(), organization_id));

-- Immutability trigger: prevent UPDATE/DELETE on completed compliance runs
CREATE OR REPLACE FUNCTION public.prevent_audit_run_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot modify a completed audit compliance run. Results are immutable.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_prevent_audit_run_mutation
  BEFORE UPDATE ON public.audit_compliance_runs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_run_mutation();

-- Prevent DELETE on completed runs
CREATE OR REPLACE FUNCTION public.prevent_audit_run_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot delete a completed audit compliance run. Results are immutable.';
  END IF;
  RETURN OLD;
END;
$function$;

CREATE TRIGGER trg_prevent_audit_run_delete
  BEFORE DELETE ON public.audit_compliance_runs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_run_delete();
