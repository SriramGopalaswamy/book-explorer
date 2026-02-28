import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";

export interface ComplianceData {
  // Step 1
  legal_name?: string;
  trade_name?: string;
  entity_type?: string;
  pan?: string;
  tan?: string;
  cin_or_llpin?: string;
  registered_address?: string;
  state?: string;
  pincode?: string;
  // Step 2
  gstin?: string[];
  registration_type?: string;
  filing_frequency?: string;
  reverse_charge_applicable?: boolean;
  einvoice_applicable?: boolean;
  ewaybill_applicable?: boolean;
  itc_eligible?: boolean;
  // Step 3
  financial_year_start?: string;
  books_start_date?: string;
  accounting_method?: string;
  base_currency?: string;
  msme_status?: boolean;
  // Step 4
  industry_template?: string;
  coa_confirmed?: boolean;
  // Phase tracking
  phase1_completed_at?: string;
  phase2_completed_at?: string;
  // Step 5
  logo_url?: string;
  brand_color?: string;
  authorized_signatory_name?: string;
  signature_url?: string;
  // Step 6
  payroll_enabled?: boolean;
  payroll_frequency?: string;
  pf_applicable?: boolean;
  esi_applicable?: boolean;
  professional_tax_applicable?: boolean;
  gratuity_applicable?: boolean;
}

export function useOnboardingCompliance() {
  const { data: org } = useUserOrganization();
  const queryClient = useQueryClient();
  const orgId = org?.organizationId;

  const query = useQuery({
    queryKey: ["onboarding-compliance", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("organization_compliance" as any)
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data as ComplianceData | null;
    },
    enabled: !!orgId,
  });

  const upsertMutation = useMutation({
    mutationFn: async (updates: Partial<ComplianceData>) => {
      if (!orgId) throw new Error("No organization");

      // Check if record exists
      const { data: existing } = await supabase
        .from("organization_compliance" as any)
        .select("id")
        .eq("organization_id", orgId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("organization_compliance" as any)
          .update({ ...updates, updated_at: new Date().toISOString() } as any)
          .eq("organization_id", orgId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("organization_compliance" as any)
          .insert({ organization_id: orgId, ...updates } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-compliance", orgId] });
    },
  });

  const completePhase1 = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization");
      const { data, error } = await supabase.rpc("complete_phase1_onboarding" as any, {
        _org_id: orgId,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || "Phase 1 activation failed");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-organization"] });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-compliance", orgId] });
    },
  });

  return {
    compliance: query.data,
    isLoading: query.isLoading,
    upsert: upsertMutation,
    completePhase1,
    orgId,
  };
}

export function useOrganizationRoles() {
  const { data: org } = useUserOrganization();
  const queryClient = useQueryClient();
  const orgId = org?.organizationId;

  const query = useQuery({
    queryKey: ["org-roles", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("organization_roles" as any)
        .select("*")
        .eq("organization_id", orgId);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    enabled: !!orgId,
  });

  const upsertRole = useMutation({
    mutationFn: async (role: { role_type: string; name: string; email: string }) => {
      if (!orgId) throw new Error("No organization");
      const { data: existing } = await supabase
        .from("organization_roles" as any)
        .select("id")
        .eq("organization_id", orgId)
        .eq("role_type", role.role_type)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("organization_roles" as any)
          .update({ name: role.name, email: role.email } as any)
          .eq("organization_id", orgId)
          .eq("role_type", role.role_type);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("organization_roles" as any)
          .insert({ organization_id: orgId, ...role } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-roles", orgId] });
    },
  });

  return { roles: query.data ?? [], isLoading: query.isLoading, upsertRole };
}
