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
  return useMutation({
    mutationFn: async (runId: string) => {
      const { error } = await supabase
        .from("payroll_runs")
        .update({ status: "under_review" } as any)
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Payroll submitted for review");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useApprovePayroll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const { error } = await supabase
        .from("payroll_runs")
        .update({ status: "approved" } as any)
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Payroll approved");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useLockApprovedPayroll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const { error } = await supabase
        .from("payroll_runs")
        .update({ status: "locked" } as any)
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Payroll locked — no further modifications allowed");
    },
    onError: (err: any) => toast.error(err.message),
  });
}
