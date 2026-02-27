import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface MasterCTCComponent {
  id: string;
  organization_id: string;
  component_name: string;
  component_type: "earning" | "deduction";
  is_taxable: boolean;
  default_percentage_of_basic: number | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useMasterCTCComponents() {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["master-ctc-components", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("master_ctc_components" as any)
        .select("*")
        .eq("organization_id", orgId!)
        .order("component_type")
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as unknown as MasterCTCComponent[];
    },
    enabled: !!orgId,
  });
}

export function useAffectedEmployees(componentName: string | null) {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["affected-employees", orgId, componentName],
    queryFn: async () => {
      if (!componentName || !orgId) return [];

      // Find active compensation structures that use this component name
      const { data, error } = await supabase
        .from("compensation_components")
        .select(`
          id,
          component_name,
          annual_amount,
          compensation_structure_id,
          compensation_structures!compensation_components_compensation_structure_id_fkey(
            id, profile_id, is_active, organization_id,
            profiles!compensation_structures_profile_id_fkey(id, full_name, employee_code)
          )
        `)
        .ilike("component_name", componentName);

      if (error) throw error;

      // Filter to active structures in this org
      const affected = (data ?? [])
        .filter((c: any) => {
          const s = c.compensation_structures;
          return s && s.is_active && s.organization_id === orgId;
        })
        .map((c: any) => ({
          profileId: c.compensation_structures.profile_id,
          fullName: c.compensation_structures.profiles?.full_name ?? "Unknown",
          employeeCode: c.compensation_structures.profiles?.employee_code ?? "",
          annualAmount: Number(c.annual_amount),
        }));

      // Dedupe by profileId
      const unique = new Map<string, typeof affected[0]>();
      affected.forEach((a: any) => unique.set(a.profileId, a));
      return Array.from(unique.values());
    },
    enabled: !!componentName && !!orgId,
  });
}

export function useCreateMasterComponent() {
  const queryClient = useQueryClient();
  const { data: org } = useUserOrganization();

  return useMutation({
    mutationFn: async (input: {
      component_name: string;
      component_type: "earning" | "deduction";
      is_taxable: boolean;
      default_percentage_of_basic?: number | null;
      display_order: number;
    }) => {
      const orgId = org?.organizationId;
      if (!orgId) throw new Error("Organization not found");

      const { data, error } = await supabase
        .from("master_ctc_components" as any)
        .insert({
          organization_id: orgId,
          ...input,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master-ctc-components"] });
      toast.success("CTC component created");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useUpdateMasterComponent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<MasterCTCComponent> & { id: string }) => {
      const { data, error } = await supabase
        .from("master_ctc_components" as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master-ctc-components"] });
      toast.success("CTC component updated");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useDeleteMasterComponent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("master_ctc_components" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master-ctc-components"] });
      toast.success("CTC component deleted");
    },
    onError: (err: any) => toast.error(err.message),
  });
}
