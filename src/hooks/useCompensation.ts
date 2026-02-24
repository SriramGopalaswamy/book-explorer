import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface CompensationComponent {
  id?: string;
  compensation_structure_id?: string;
  component_name: string;
  component_type: "earning" | "deduction";
  annual_amount: number;
  monthly_amount?: number;
  percentage_of_basic?: number | null;
  is_taxable: boolean;
  display_order: number;
}

export interface CompensationStructure {
  id: string;
  profile_id: string;
  organization_id: string;
  annual_ctc: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  revision_reason: string | null;
  revision_number: number;
  created_by: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  compensation_components: CompensationComponent[];
}

export interface CreateRevisionInput {
  profile_id: string;
  annual_ctc: number;
  effective_from: string;
  revision_reason?: string;
  notes?: string;
  components: Omit<CompensationComponent, "id" | "compensation_structure_id" | "monthly_amount">[];
}

const DEFAULT_COMPONENTS: Omit<CompensationComponent, "id" | "compensation_structure_id" | "monthly_amount">[] = [
  { component_name: "Basic Salary", component_type: "earning", annual_amount: 0, is_taxable: true, display_order: 0 },
  { component_name: "HRA", component_type: "earning", annual_amount: 0, percentage_of_basic: 50, is_taxable: true, display_order: 1 },
  { component_name: "Transport Allowance", component_type: "earning", annual_amount: 0, is_taxable: false, display_order: 2 },
  { component_name: "Special Allowance", component_type: "earning", annual_amount: 0, is_taxable: true, display_order: 3 },
  { component_name: "PF (Employer)", component_type: "deduction", annual_amount: 0, percentage_of_basic: 12, is_taxable: false, display_order: 10 },
  { component_name: "Professional Tax", component_type: "deduction", annual_amount: 0, is_taxable: false, display_order: 11 },
];

export function useCompensationHistory(profileId: string | null) {
  return useQuery({
    queryKey: ["compensation-history", profileId],
    queryFn: async () => {
      if (!profileId) return [];
      const { data, error } = await supabase
        .from("compensation_structures")
        .select("*, compensation_components(*)")
        .eq("profile_id", profileId)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompensationStructure[];
    },
    enabled: !!profileId,
  });
}

export function useCreateCompensationRevision() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: org } = useUserOrganization();

  return useMutation({
    mutationFn: async (input: CreateRevisionInput) => {
      if (!user) throw new Error("Not authenticated");
      const orgId = org?.organizationId;
      if (!orgId) throw new Error("Organization not found");

      // 1. Insert new compensation structure
      const { data: structure, error: sErr } = await supabase
        .from("compensation_structures")
        .insert({
          profile_id: input.profile_id,
          organization_id: orgId,
          annual_ctc: input.annual_ctc,
          effective_from: input.effective_from,
          revision_reason: input.revision_reason || null,
          notes: input.notes || null,
          created_by: user.id,
          is_active: true,
        })
        .select()
        .single();

      if (sErr) throw sErr;

      // 2. Insert components
      const components = input.components.map((c, i) => ({
        compensation_structure_id: structure.id,
        component_name: c.component_name,
        component_type: c.component_type,
        annual_amount: c.annual_amount,
        percentage_of_basic: c.percentage_of_basic ?? null,
        is_taxable: c.is_taxable,
        display_order: c.display_order ?? i,
      }));

      if (components.length > 0) {
        const { error: cErr } = await supabase
          .from("compensation_components")
          .insert(components);
        if (cErr) throw cErr;
      }

      return structure;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["compensation-history", variables.profile_id] });
      toast.success("Salary revision created successfully");
    },
    onError: (err: any) => {
      toast.error("Failed to create revision: " + err.message);
    },
  });
}

export { DEFAULT_COMPONENTS };
