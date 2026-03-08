import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Payroll approval workflow mutations.
 * State transitions: draft/completed → under_review → approved → locked
 */

export function useSubmitForReview() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (runId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Only completed runs can be submitted for review
      const { data: run } = await supabase
        .from("payroll_runs")
        .select("status")
        .eq("id", runId)
        .single();
      if (!run) throw new Error("Payroll run not found");
      if (!["completed", "draft"].includes(run.status)) {
        throw new Error(`Cannot submit for review: current status is '${run.status}'`);
      }

      const { error } = await supabase
        .from("payroll_runs")
        .update({ status: "under_review", reviewed_by: user.id, reviewed_at: new Date().toISOString() } as any)
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-analytics"] });
      toast.success("Payroll submitted for review");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useApprovePayroll() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (runId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Only under_review runs can be approved
      const { data: run } = await supabase
        .from("payroll_runs")
        .select("status")
        .eq("id", runId)
        .single();
      if (!run) throw new Error("Payroll run not found");
      if (run.status !== "under_review") {
        throw new Error(`Cannot approve: current status is '${run.status}'. Must be under_review.`);
      }

      const { error } = await supabase
        .from("payroll_runs")
        .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() } as any)
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Payroll approved");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useLockApprovedPayroll() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (runId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Only approved runs can be locked
      const { data: run } = await supabase
        .from("payroll_runs")
        .select("status")
        .eq("id", runId)
        .single();
      if (!run) throw new Error("Payroll run not found");
      if (run.status !== "approved") {
        throw new Error(`Cannot lock: current status is '${run.status}'. Must be approved.`);
      }

      const { error } = await supabase
        .from("payroll_runs")
        .update({ status: "locked", locked_at: new Date().toISOString(), locked_by: user.id } as any)
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-analytics"] });
      toast.success("Payroll locked — no further modifications allowed");
    },
    onError: (err: any) => toast.error(err.message),
  });
}
