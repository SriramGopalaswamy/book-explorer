import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface GoalCycleConfig {
  id: string;
  organization_id: string;
  cycle_month: string;
  input_start_day: number;
  input_deadline_day: number;
  scoring_start_day: number;
  scoring_deadline_day: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useGoalCycleConfig() {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["goal-cycle-config", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      // Fetch default config (cycle_month = '*') or latest
      const { data, error } = await supabase
        .from("goal_cycle_config" as any)
        .select("*")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("cycle_month", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as GoalCycleConfig[];
      // Return default config or first found
      return rows.find((r) => r.cycle_month === "*") ?? rows[0] ?? null;
    },
    enabled: !!orgId,
  });
}

export function useGoalCycleConfigs() {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["goal-cycle-configs", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("goal_cycle_config" as any)
        .select("*")
        .eq("organization_id", orgId)
        .order("cycle_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as GoalCycleConfig[];
    },
    enabled: !!orgId,
  });
}

export function useUpsertGoalCycleConfig() {
  const queryClient = useQueryClient();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useMutation({
    mutationFn: async (config: {
      cycle_month: string;
      input_start_day: number;
      input_deadline_day: number;
      scoring_start_day: number;
      scoring_deadline_day: number;
      is_active?: boolean;
    }) => {
      if (!orgId) throw new Error("No organization");
      const { error } = await supabase
        .from("goal_cycle_config" as any)
        .upsert(
          {
            organization_id: orgId,
            cycle_month: config.cycle_month,
            input_start_day: config.input_start_day,
            input_deadline_day: config.input_deadline_day,
            scoring_start_day: config.scoring_start_day,
            scoring_deadline_day: config.scoring_deadline_day,
            is_active: config.is_active ?? true,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "organization_id,cycle_month" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goal-cycle-config"] });
      queryClient.invalidateQueries({ queryKey: ["goal-cycle-configs"] });
      toast.success("Goal cycle configuration saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
