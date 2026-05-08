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

async function updateProgress(id: string, progress: number) {
  await admin.from("background_jobs").update({ progress }).eq("id", id);
}

async function runJob(job: Job): Promise<unknown> {
  switch (job.module) {
    case "noop":
      return { ok: true, at: new Date().toISOString() };
    case "ping":
      return { pong: true, payload: job.payload };

    /**
     * invoice_pdf_batch — kicks off PDF generation for a list of invoice IDs.
     * Payload: { invoice_ids: string[] }
     * Result:  { generated: number, failed: number, errors: Array<{id, msg}> }
     */
    case "invoice_pdf_batch": {
      const ids = Array.isArray(job.payload?.invoice_ids)
        ? (job.payload!.invoice_ids as string[])
        : [];
      if (ids.length === 0) return { generated: 0, failed: 0, errors: [] };
      let generated = 0;
      let failed = 0;
      const errors: Array<{ id: string; msg: string }> = [];
      for (let i = 0; i < ids.length; i++) {
        const invoiceId = ids[i];
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-invoice-pdf`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_ROLE}`,
              apikey: SERVICE_ROLE,
            },
            body: JSON.stringify({ invoiceId, persistOnly: true }),
          });
          if (!res.ok) {
            failed += 1;
            errors.push({ id: invoiceId, msg: await res.text() });
          } else {
            generated += 1;
          }
        } catch (e) {
          failed += 1;
          errors.push({ id: invoiceId, msg: e instanceof Error ? e.message : String(e) });
        }
        await updateProgress(job.id, Math.round(((i + 1) / ids.length) * 100));
      }
      return { generated, failed, errors };
    }

    /**
     * gst_recon_summary — summarises invoice/bill GST totals for a given month
     * within the job's organization. Payload: { period: 'YYYY-MM' }
     */
    case "gst_recon_summary": {
      const period = String(job.payload?.period ?? "");
      if (!/^\d{4}-\d{2}$/.test(period)) {
        throw new Error("Invalid period; expected YYYY-MM");
      }
      if (!job.organization_id) throw new Error("Missing organization context");

      const start = `${period}-01`;
      const [y, m] = period.split("-").map(Number);
      const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

      const [invRes, billRes] = await Promise.all([
        admin
          .from("invoices")
          .select("cgst_total, sgst_total, igst_total, total_amount")
          .eq("organization_id", job.organization_id)
          .gte("invoice_date", start)
          .lt("invoice_date", nextMonth),
        admin
          .from("bills")
          .select("tax_amount, total_amount")
          .eq("organization_id", job.organization_id)
          .gte("bill_date", start)
          .lt("bill_date", nextMonth),
      ]);
      if (invRes.error) throw invRes.error;
      if (billRes.error) throw billRes.error;

      const sum = (rows: any[] | null, key: string) =>
        (rows ?? []).reduce((s, r) => s + Number(r?.[key] ?? 0), 0);

      return {
        period,
        output_tax: {
          cgst: sum(invRes.data, "cgst_total"),
          sgst: sum(invRes.data, "sgst_total"),
          igst: sum(invRes.data, "igst_total"),
          gross: sum(invRes.data, "total_amount"),
          count: invRes.data?.length ?? 0,
        },
        input_tax: {
          tax: sum(billRes.data, "tax_amount"),
          gross: sum(billRes.data, "total_amount"),
          count: billRes.data?.length ?? 0,
        },
      };
    }

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
