import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "./useUserOrganization";

// ─── Financial Snapshot ─────────────────────────────────────────────
export function useFinancialSnapshot() {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["ai-financial-snapshot", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_financial_snapshots")
        .select("*")
        .eq("organization_id", orgId!)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}

// ─── AI Alerts ──────────────────────────────────────────────────────
export function useAIAlerts(unresolvedOnly = true) {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["ai-alerts", orgId, unresolvedOnly],
    queryFn: async () => {
      let query = supabase
        .from("ai_alerts")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(50);

      if (unresolvedOnly) {
        query = query.eq("is_resolved", false);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });
}

// ─── Risk Scores ────────────────────────────────────────────────────
export function useRiskScores() {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["ai-risk-scores", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_risk_scores")
        .select("*")
        .eq("organization_id", orgId!)
        .order("score_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}

// ─── Customer Profiles ──────────────────────────────────────────────
export function useCustomerRiskProfiles() {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["ai-customer-profiles", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_customer_profiles")
        .select("*, customers(name, email)")
        .eq("organization_id", orgId!)
        .order("risk_score", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });
}

// ─── Vendor Profiles ────────────────────────────────────────────────
export function useVendorRiskProfiles() {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["ai-vendor-profiles", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_vendor_profiles")
        .select("*, vendors(name, email)")
        .eq("organization_id", orgId!)
        .order("reliability_score", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });
}

// ─── Resolve Alert ──────────────────────────────────────────────────
export function useResolveAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("ai_alerts")
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-alerts"] });
    },
  });
}

// ─── Run Engine ─────────────────────────────────────────────────────
export function useRunFinancialEngine() {
  const { data: org } = useUserOrganization();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (engine?: string) => {
      const { data, error } = await supabase.functions.invoke("financial-engine", {
        body: { organization_id: org?.organizationId, engine },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-financial-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["ai-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["ai-risk-scores"] });
      queryClient.invalidateQueries({ queryKey: ["ai-customer-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["ai-vendor-profiles"] });
    },
  });
}
