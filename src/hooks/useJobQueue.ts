import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";

export interface JobQueueRow {
  id: string;
  organization_id: string;
  job_type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  progress_label: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  retry_count: number;
  max_retries: number;
}

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function useEnqueueJob() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();

  return useCallback(
    async (jobType: string, payload: Record<string, unknown>): Promise<string> => {
      if (!user) throw new Error("Not authenticated");
      const orgId = orgData?.organizationId;
      if (!orgId) throw new Error("Organization not found");

      const { data, error } = await supabase
        .from("job_queue")
        .insert({
          organization_id: orgId,
          job_type: jobType,
          payload,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (error) throw error;
      return (data as any).id as string;
    },
    [user, orgData]
  );
}

export function useJobSubscription(jobId: string | null) {
  const [job, setJob] = useState<JobQueueRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId) return;

    setLoading(true);

    // Initial fetch
    supabase
      .from("job_queue")
      .select("*")
      .eq("id", jobId)
      .single()
      .then(({ data }) => {
        if (data) setJob(data as JobQueueRow);
        setLoading(false);
      });

    // Realtime subscription
    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "job_queue", filter: `id=eq.${jobId}` },
        (payload) => {
          const updated = payload.new as JobQueueRow;
          setJob(updated);
          if (TERMINAL.has(updated.status)) {
            supabase.removeChannel(channel);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { job, loading };
}
