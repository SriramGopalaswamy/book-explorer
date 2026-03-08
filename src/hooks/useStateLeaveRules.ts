import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface StateLeaveRule {
  id: string;
  organization_id: string;
  state_code: string;
  state_name: string;
  casual_leave_days: number;
  sick_leave_days: number;
  earned_leave_days: number;
  maternity_leave_days: number;
  paternity_leave_days: number;
  carry_forward_allowed: boolean;
  max_carry_forward_days: number;
  min_days_for_el_accrual: number;
  weekly_off_count: number;
  max_work_hours_per_week: number;
  overtime_rate_multiplier: number;
  effective_from: string;
  notes: string | null;
}

/** Indian states with default leave entitlements per Shops & Establishments Act */
export const INDIAN_STATES = [
  { code: "MH", name: "Maharashtra", casual: 7, sick: 7, earned: 21 },
  { code: "KA", name: "Karnataka", casual: 7, sick: 12, earned: 18 },
  { code: "DL", name: "Delhi", casual: 12, sick: 7, earned: 15 },
  { code: "TN", name: "Tamil Nadu", casual: 12, sick: 12, earned: 12 },
  { code: "UP", name: "Uttar Pradesh", casual: 7, sick: 7, earned: 15 },
  { code: "GJ", name: "Gujarat", casual: 7, sick: 7, earned: 15 },
  { code: "WB", name: "West Bengal", casual: 14, sick: 14, earned: 15 },
  { code: "RJ", name: "Rajasthan", casual: 7, sick: 7, earned: 15 },
  { code: "AP", name: "Andhra Pradesh", casual: 12, sick: 10, earned: 15 },
  { code: "TS", name: "Telangana", casual: 12, sick: 10, earned: 15 },
  { code: "KL", name: "Kerala", casual: 12, sick: 12, earned: 12 },
  { code: "HR", name: "Haryana", casual: 7, sick: 7, earned: 15 },
  { code: "PB", name: "Punjab", casual: 7, sick: 7, earned: 15 },
  { code: "MP", name: "Madhya Pradesh", casual: 7, sick: 7, earned: 15 },
] as const;

export function useStateLeaveRules() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["state-leave-rules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("state_leave_rules")
        .select("*")
        .order("state_name", { ascending: true });
      if (error) throw error;
      return data as StateLeaveRule[];
    },
    enabled: !!user,
  });
}

export function useUpsertStateLeaveRule() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (rule: Partial<StateLeaveRule> & { state_code: string; state_name: string }) => {
      const { data, error } = await (supabase as any)
        .from("state_leave_rules")
        .upsert(rule, { onConflict: "organization_id,state_code" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["state-leave-rules"] });
      toast.success("State leave rule saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
