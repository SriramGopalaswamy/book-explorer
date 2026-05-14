import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Subscribe to live status changes on a single payroll_runs row.
 * Survives page refresh — state lives in the database, the UI just
 * resubscribes on mount.
 */
export function usePayrollRunRealtime(payrollRunId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!payrollRunId) return;

    const channel = supabase
      .channel(`payroll_run_${payrollRunId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "payroll_runs",
          filter: `id=eq.${payrollRunId}`,
        },
        (payload) => {
          const newStatus = (payload.new as any)?.status;
          queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
          queryClient.invalidateQueries({ queryKey: ["payroll-entries", payrollRunId] });
          if (newStatus === "completed") {
            toast.success("Payroll generation completed");
          } else if (newStatus === "failed") {
            toast.error("Payroll generation failed");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [payrollRunId, queryClient]);
}
