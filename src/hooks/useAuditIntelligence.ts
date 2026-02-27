import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ComplianceRun {
  id: string;
  organization_id: string;
  financial_year: string;
  run_type: string;
  status: string;
  compliance_score: number | null;
  ai_risk_index: number | null;
  ifc_rating: string | null;
  score_breakdown: Record<string, number>;
  risk_breakdown: Record<string, number>;
  started_at: string;
  completed_at: string | null;
  run_by: string;
  version: number;
  created_at: string;
}

export interface ComplianceCheck {
  id: string;
  run_id: string;
  module: string;
  check_code: string;
  check_name: string;
  severity: string;
  status: string;
  details: Record<string, any>;
  affected_count: number;
  affected_amount: number;
  recommendation: string | null;
  data_references: any[];
  created_at: string;
}

export interface RiskTheme {
  id: string;
  run_id: string;
  theme_name: string;
  risk_score: number;
  confidence_score: number;
  impact_area: string;
  impacted_value: number;
  transaction_count: number;
  contributing_flags: any[];
  explanation: string | null;
  suggested_action: string | null;
  historical_comparison: Record<string, any>;
  created_at: string;
}

export interface AiAnomaly {
  id: string;
  run_id: string;
  anomaly_type: string;
  risk_score: number;
  trigger_condition: string;
  data_reference: Record<string, any>;
  deviation_pct: number | null;
  last_year_value: number | null;
  current_value: number | null;
  confidence_score: number;
  suggested_audit_action: string | null;
  theme_id: string | null;
  created_at: string;
}

export interface AiSample {
  id: string;
  run_id: string;
  sample_type: string;
  sample_name: string;
  entity_type: string;
  entity_id: string;
  entity_reference: string | null;
  risk_weight: number;
  reason_selected: string;
  amount: number | null;
  transaction_date: string | null;
  is_accepted: boolean | null;
  created_at: string;
}

export interface AiNarrative {
  id: string;
  run_id: string;
  financial_year: string;
  narrative_type: string;
  content: string;
  data_points: any[];
  version: number;
  generated_at: string;
}

export interface IfcAssessment {
  id: string;
  run_id: string;
  check_type: string;
  check_name: string;
  severity: string;
  status: string;
  details: Record<string, any>;
  affected_count: number;
  recommendation: string | null;
  created_at: string;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/** Get all compliance runs for current org */
export function useComplianceRuns(financialYear?: string) {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["audit-compliance-runs", orgId, financialYear],
    queryFn: async () => {
      let query = supabase
        .from("audit_compliance_runs" as any)
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });

      if (financialYear) {
        query = query.eq("financial_year", financialYear);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ComplianceRun[];
    },
    enabled: !!user && !!orgId,
  });
}

/** Get the latest completed run */
export function useLatestComplianceRun(financialYear?: string) {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["audit-latest-run", orgId, financialYear],
    queryFn: async () => {
      let query = supabase
        .from("audit_compliance_runs" as any)
        .select("*")
        .eq("organization_id", orgId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1);

      if (financialYear) {
        query = query.eq("financial_year", financialYear);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data?.[0] || null) as unknown as ComplianceRun | null;
    },
    enabled: !!user && !!orgId,
  });
}

/** Get compliance checks for a run */
export function useComplianceChecks(runId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["audit-compliance-checks", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_compliance_checks" as any)
        .select("*")
        .eq("run_id", runId)
        .order("severity", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ComplianceCheck[];
    },
    enabled: !!user && !!runId,
  });
}

/** Get risk themes for a run */
export function useRiskThemes(runId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["audit-risk-themes", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_risk_themes" as any)
        .select("*")
        .eq("run_id", runId)
        .order("risk_score", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as RiskTheme[];
    },
    enabled: !!user && !!runId,
  });
}

/** Get AI anomalies for a run */
export function useAiAnomalies(runId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["audit-ai-anomalies", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_ai_anomalies" as any)
        .select("*")
        .eq("run_id", runId)
        .order("risk_score", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AiAnomaly[];
    },
    enabled: !!user && !!runId,
  });
}

/** Get AI samples for a run */
export function useAiSamples(runId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["audit-ai-samples", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_ai_samples" as any)
        .select("*")
        .eq("run_id", runId)
        .order("risk_weight", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AiSample[];
    },
    enabled: !!user && !!runId,
  });
}

/** Get AI narratives for a run */
export function useAiNarratives(runId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["audit-ai-narratives", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_ai_narratives" as any)
        .select("*")
        .eq("run_id", runId)
        .order("narrative_type");
      if (error) throw error;
      return (data || []) as unknown as AiNarrative[];
    },
    enabled: !!user && !!runId,
  });
}

/** Get IFC assessments for a run */
export function useIfcAssessments(runId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["audit-ifc-assessments", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_ifc_assessments" as any)
        .select("*")
        .eq("run_id", runId)
        .order("severity", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as IfcAssessment[];
    },
    enabled: !!user && !!runId,
  });
}

/** Get current financial year string */
export function getCurrentFinancialYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  if (month >= 4) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  }
  return `${year - 1}-${year.toString().slice(-2)}`;
}
