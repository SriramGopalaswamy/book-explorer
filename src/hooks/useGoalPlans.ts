import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoalItem {
  id: string;
  client: string;
  bucket: string;
  line_item: string;
  weightage: number;
  target: string;
  actual: string | null;
}

export type GoalPlanStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "pending_edit_approval"
  | "pending_score_approval"
  | "completed";

export interface GoalPlan {
  id: string;
  user_id: string;
  profile_id: string | null;
  month: string;
  status: GoalPlanStatus;
  items: GoalItem[];
  reviewer_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalPlanWithProfile extends GoalPlan {
  _profile?: {
    full_name: string | null;
    department: string | null;
    user_id: string;
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function newGoalItem(): GoalItem {
  return {
    id: crypto.randomUUID(),
    client: "",
    bucket: "",
    line_item: "",
    weightage: 0,
    target: "",
    actual: null,
  };
}

export function totalWeightage(items: GoalItem[]): number {
  return items.reduce((s, i) => s + (Number(i.weightage) || 0), 0);
}

// Cast database row (JSONB items typed as Json by supabase) to GoalPlan
function toGoalPlan(row: unknown): GoalPlan {
  return row as GoalPlan;
}

function toGoalPlanArr(rows: unknown): GoalPlan[] {
  return (rows as unknown[]).map(toGoalPlan);
}

// ─── Fetch Hooks ─────────────────────────────────────────────────────────────

export function useMyGoalPlans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["goal-plans", "my", user?.id],
    queryFn: async () => {
      if (!user) return [] as GoalPlan[];
      const { data, error } = await supabase
        .from("goal_plans")
        .select("*")
        .eq("user_id", user.id)
        .order("month", { ascending: false });
      if (error) throw error;
      return toGoalPlanArr(data || []);
    },
    enabled: !!user,
  });
}

export function useGoalPlan(month: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["goal-plan", month, user?.id],
    queryFn: async () => {
      if (!user || !month) return null;
      const { data, error } = await supabase
        .from("goal_plans")
        .select("*")
        .eq("user_id", user.id)
        .eq("month", month)
        .maybeSingle();
      if (error) throw error;
      return data ? toGoalPlan(data) : null;
    },
    enabled: !!user && !!month,
  });
}

export function useDirectReportsPendingGoalPlans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["direct-reports-goal-plans", user?.id],
    queryFn: async () => {
      if (!user) return [] as GoalPlanWithProfile[];
      const { data: myProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!myProfile) return [] as GoalPlanWithProfile[];

      const { data: reports } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, department")
        .eq("manager_id", myProfile.id);
      if (!reports || reports.length === 0) return [] as GoalPlanWithProfile[];

      const reportUserIds = reports.map((r) => r.user_id);

      const { data, error } = await supabase
        .from("goal_plans")
        .select("*")
        .in("user_id", reportUserIds)
        .in("status", ["pending_approval", "pending_edit_approval", "pending_score_approval"])
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const profileMap = Object.fromEntries(reports.map((r) => [r.user_id, r]));
      return (data || []).map((plan) => ({
        ...toGoalPlan(plan),
        _profile: profileMap[plan.user_id] || null,
      })) as GoalPlanWithProfile[];
    },
    enabled: !!user,
  });
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────

export function useCreateGoalPlan() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ month, items }: { month: string; items: GoalItem[] }) => {
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data, error } = await supabase
        .from("goal_plans")
        .insert({
          user_id: user.id,
          profile_id: profile?.id ?? null,
          month,
          items: items as unknown as any,
          status: "draft",
        })
        .select()
        .single();
      if (error) throw error;
      return toGoalPlan(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["goal-plan"] });
      toast.success("Goal plan created as draft");
    },
    onError: (e: any) => toast.error("Failed to create goal plan: " + e.message),
  });
}

export function useSaveGoalPlanDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, items }: { planId: string; items: GoalItem[] }) => {
      const { error } = await supabase
        .from("goal_plans")
        .update({ items: items as unknown as any })
        .eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["goal-plan"] });
      toast.success("Draft saved");
    },
    onError: (e: any) => toast.error("Failed to save: " + e.message),
  });
}

export function useSubmitGoalPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, items }: { planId: string; items: GoalItem[] }) => {
      const { data, error } = await supabase
        .from("goal_plans")
        .update({ status: "pending_approval", items: items as unknown as any })
        .eq("id", planId)
        .select()
        .single();
      if (error) throw error;
      return toGoalPlan(data);
    },
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: ["goal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["goal-plan"] });
      toast.success("Goal plan submitted for approval");
      supabase.functions
        .invoke("send-notification-email", {
          body: { type: "goal_plan_submitted", payload: { goal_plan_id: plan.id, is_edit: false } },
        })
        .catch(console.warn);
    },
    onError: (e: any) => toast.error("Failed to submit: " + e.message),
  });
}

export function useSubmitGoalEdit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, items }: { planId: string; items: GoalItem[] }) => {
      const { data, error } = await supabase
        .from("goal_plans")
        .update({ status: "pending_edit_approval", items: items as unknown as any })
        .eq("id", planId)
        .select()
        .single();
      if (error) throw error;
      return toGoalPlan(data);
    },
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: ["goal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["goal-plan"] });
      toast.success("Edit submitted for approval");
      supabase.functions
        .invoke("send-notification-email", {
          body: { type: "goal_plan_submitted", payload: { goal_plan_id: plan.id, is_edit: true } },
        })
        .catch(console.warn);
    },
    onError: (e: any) => toast.error("Failed to submit edit: " + e.message),
  });
}

export function useSubmitGoalScoring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, items }: { planId: string; items: GoalItem[] }) => {
      const { data, error } = await supabase
        .from("goal_plans")
        .update({ status: "pending_score_approval", items: items as unknown as any })
        .eq("id", planId)
        .select()
        .single();
      if (error) throw error;
      return toGoalPlan(data);
    },
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: ["goal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["goal-plan"] });
      toast.success("Actuals submitted for approval");
      supabase.functions
        .invoke("send-notification-email", {
          body: { type: "goal_scoring_submitted", payload: { goal_plan_id: plan.id } },
        })
        .catch(console.warn);
    },
    onError: (e: any) => toast.error("Failed to submit actuals: " + e.message),
  });
}

export function useApproveGoalPlan() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      planId,
      items,
      notes,
      isScoring,
    }: {
      planId: string;
      items?: GoalItem[];
      notes?: string;
      isScoring?: boolean;
    }) => {
      const update: Record<string, unknown> = {
        status: isScoring ? "completed" : "approved",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        reviewer_notes: notes || null,
      };
      if (items) update.items = items as unknown;

      const { data, error } = await supabase
        .from("goal_plans")
        .update(update as any)
        .eq("id", planId)
        .select()
        .single();
      if (error) throw error;
      return { plan: toGoalPlan(data), isScoring };
    },
    onSuccess: ({ plan, isScoring }) => {
      queryClient.invalidateQueries({ queryKey: ["goal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["goal-plan"] });
      queryClient.invalidateQueries({ queryKey: ["direct-reports-goal-plans"] });
      toast.success(isScoring ? "Goal scoring approved" : "Goal plan approved");
      const notifType = isScoring ? "goal_scoring_decided" : "goal_plan_decided";
      supabase.functions
        .invoke("send-notification-email", {
          body: { type: notifType, payload: { goal_plan_id: plan.id, decision: "approved" } },
        })
        .catch(console.warn);
    },
    onError: (e: any) => toast.error("Failed to approve: " + e.message),
  });
}

export function useRejectGoalPlan() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      planId,
      notes,
      isScoring,
    }: {
      planId: string;
      notes?: string;
      isScoring?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("goal_plans")
        .update({
          status: isScoring ? "approved" : "rejected",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: notes || null,
        })
        .eq("id", planId)
        .select()
        .single();
      if (error) throw error;
      return { plan: toGoalPlan(data), isScoring };
    },
    onSuccess: ({ plan, isScoring }) => {
      queryClient.invalidateQueries({ queryKey: ["goal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["goal-plan"] });
      queryClient.invalidateQueries({ queryKey: ["direct-reports-goal-plans"] });
      toast.success(isScoring ? "Scoring returned for revision" : "Goal plan rejected");
      const notifType = isScoring ? "goal_scoring_decided" : "goal_plan_decided";
      supabase.functions
        .invoke("send-notification-email", {
          body: { type: notifType, payload: { goal_plan_id: plan.id, decision: "rejected" } },
        })
        .catch(console.warn);
    },
    onError: (e: any) => toast.error("Failed to reject: " + e.message),
  });
}

export function useDeleteGoalPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase.from("goal_plans").delete().eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["goal-plan"] });
      toast.success("Goal plan deleted");
    },
    onError: (e: any) => toast.error("Failed to delete: " + e.message),
  });
}
