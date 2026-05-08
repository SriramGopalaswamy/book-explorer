// Background job worker — picks up queued jobs from `background_jobs` and processes them.
// Designed to be invoked on a schedule (cron) and also callable on-demand.

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface Job {
  id: string;
  organization_id: string | null;
  module: string;
  status: string;
  payload: Record<string, unknown> | null;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function claimJobs(limit = 5): Promise<Job[]> {
  const { data, error } = await admin
    .from("background_jobs")
    .select("id, organization_id, module, status, payload")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const ids = data.map((j) => j.id);
  const { data: updated, error: upErr } = await admin
    .from("background_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "queued")
    .select("id, organization_id, module, status, payload");
  if (upErr) throw upErr;
  return (updated as Job[]) ?? [];
}

async function markCompleted(id: string, result: unknown) {
  await admin
    .from("background_jobs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      progress: 100,
      result: result as never,
      error: null,
    })
    .eq("id", id);
}

async function markFailed(id: string, err: string) {
  await admin
    .from("background_jobs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: err,
    })
    .eq("id", id);
}

async function runJob(job: Job): Promise<unknown> {
  switch (job.module) {
    case "noop":
      return { ok: true, at: new Date().toISOString() };
    case "ping":
      return { pong: true, payload: job.payload };
    default:
      throw new Error(`Unknown module: ${job.module}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const claimed = await claimJobs(5);
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const job of claimed) {
      try {
        const result = await runJob(job);
        await markCompleted(job.id, result);
        results.push({ id: job.id, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await markFailed(job.id, msg);
        results.push({ id: job.id, ok: false, error: msg });
      }
    }

    return new Response(
      JSON.stringify({ processed: claimed.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : (typeof e === "string" ? e : JSON.stringify(e));
    console.error("worker_error", msg, e);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
