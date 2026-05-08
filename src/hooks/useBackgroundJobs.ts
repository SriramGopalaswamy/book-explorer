import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface BackgroundJob {
  id: string;
  organization_id: string | null;
  module: string;
  status: JobStatus;
  progress: number | null;
  payload: Record<string, unknown> | null;
  result: any;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Lists background jobs for the current organization.
 * Live-updates via postgres_changes subscription.
 */
export function useBackgroundJobs(limit = 50) {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["background-jobs", orgId, limit],
    enabled: !!orgId,
    queryFn: async (): Promise<BackgroundJob[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("background_jobs")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as BackgroundJob[];
    },
    refetchInterval: (q) => {
      const rows = (q.state.data ?? []) as BackgroundJob[];
      const hasLive = rows.some((r) => r.status === "queued" || r.status === "running");
      return hasLive ? 2000 : false;
    },
    staleTime: 5_000,
  });

  // Realtime channel for instant updates while a job is running.
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`background-jobs-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "background_jobs", filter: `organization_id=eq.${orgId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["background-jobs", orgId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);

  return query;
}

interface DispatchInput {
  module: "invoice_pdf_batch" | "gst_recon_summary" | "noop" | "ping";
  payload?: Record<string, unknown>;
}

/**
 * Enqueues a job in `background_jobs` and immediately invokes the
 * `process-background-jobs` worker so users see progress without waiting
 * for the next cron tick.
 */
export function useDispatchJob() {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ module, payload }: DispatchInput) => {
      if (!orgId) throw new Error("No organization context");
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("background_jobs")
        .insert([{
          organization_id: orgId,
          module,
          payload: (payload ?? {}) as any,
          status: "queued",
          progress: 0,
          created_by: user?.id ?? null,
        }] as any)
        .select("id")
        .single();
      if (error) throw error;
      // Kick the worker — non-blocking from the user's POV.
      supabase.functions
        .invoke("process-background-jobs", { body: {} })
        .catch((e) => console.warn("worker_kick_failed", e));
      return data.id as string;
    },
    onSuccess: () => {
      toast.success("Job queued");
      qc.invalidateQueries({ queryKey: ["background-jobs", orgId] });
    },
    onError: (e: any) => {
      toast.error(`Failed to queue job: ${e?.message ?? "unknown error"}`);
    },
  });
}
