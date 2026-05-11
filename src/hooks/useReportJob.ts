/**
 * GBC-12: server-side PDF rendering via report_jobs queue.
 *
 * Usage from a "Heavy Report" button:
 *
 *   const { enqueue, jobs, downloadJob } = useReportJob();
 *   await enqueue("general_ledger", { from: "2026-01-01", to: "2026-03-31" });
 *
 * `jobs` is a list of the caller's recent report_jobs rows (Realtime-
 * subscribed). When a row flips to 'succeeded', `downloadJob(job.id)`
 * mints a short-lived signed URL from erp-documents-storage and opens it.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useAuth } from "@/contexts/AuthContext";

export interface ReportJob {
  id: string;
  organization_id: string;
  user_id: string;
  report_type: string;
  params: Record<string, unknown>;
  status: "queued" | "running" | "succeeded" | "failed";
  progress_pct: number;
  storage_path: string | null;
  page_count: number | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export function useReportJob() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const [jobs, setJobs] = useState<ReportJob[]>([]);

  // Initial fetch
  useEffect(() => {
    if (!orgId || !user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("report_jobs")
        .select(
          "id, organization_id, user_id, report_type, params, status, progress_pct, " +
          "storage_path, page_count, error, started_at, finished_at, created_at",
        )
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error || cancelled) return;
      setJobs((data || []) as unknown as ReportJob[]);
    })();
    return () => { cancelled = true; };
  }, [orgId, user]);

  // Realtime channel: subscribe to my jobs and merge updates.
  useEffect(() => {
    if (!orgId || !user) return;
    const channel = supabase
      .channel(`report-jobs-${orgId}-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "report_jobs",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setJobs((prev) => {
            const next = [...prev];
            if (payload.eventType === "INSERT") {
              const row = payload.new as ReportJob;
              if (row.organization_id === orgId) next.unshift(row);
            } else if (payload.eventType === "UPDATE") {
              const row = payload.new as ReportJob;
              const idx = next.findIndex((j) => j.id === row.id);
              if (idx >= 0) next[idx] = row;
              else if (row.organization_id === orgId) next.unshift(row);
            } else if (payload.eventType === "DELETE") {
              const oldRow = payload.old as ReportJob;
              return next.filter((j) => j.id !== oldRow.id);
            }
            return next.slice(0, 20);
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, user]);

  const enqueue = useCallback(
    async (reportType: string, params: Record<string, unknown> = {}) => {
      const { data, error } = await (supabase as any).rpc("enqueue_report_job", {
        p_report_type: reportType,
        p_params: params,
      });
      if (error) throw error;
      return data as string;
    },
    [],
  );

  const downloadJob = useCallback(async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.status !== "succeeded" || !job.storage_path) {
      throw new Error("Job is not ready for download");
    }
    const { data, error } = await supabase.storage
      .from("erp-documents-storage")
      .createSignedUrl(job.storage_path, 300); // 5 min
    if (error) throw error;
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }, [jobs]);

  return { jobs, enqueue, downloadJob };
}
