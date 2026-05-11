// GBC-12: Edge Function that picks up queued report_jobs rows, renders
// them to PDF, uploads to erp-documents-storage, and marks the job done.
//
// Scheduling: this function is meant to be triggered by a cron (every
// minute) OR by a Postgres trigger that POSTs to it on row insert.
// Either is fine — duplicate runs are safe because mark_report_job_running
// only flips a row out of `queued`.
//
// Rendering backend: uses pdf-lib (Deno-compatible) for simple text
// reports. For complex HTML→PDF (CSS-styled invoices, multi-column
// payslips) a Playwright-based remote-rendering service is the next
// step; the function shape stays the same.
//
// Authentication: invoked with the service-role key from Supabase
// Scheduler; the helper RPCs (mark_report_job_*) are SECURITY DEFINER so
// the function doesn't need direct table privileges.

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STORAGE_BUCKET = "erp-documents-storage";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface ReportJob {
  id: string;
  organization_id: string;
  user_id: string;
  report_type: string;
  params: Record<string, unknown>;
}

// Minimal placeholder PDF renderer. Production-grade implementation
// should switch on report_type and produce a real document. For now this
// renders a one-page text PDF noting the report type and parameters —
// enough to validate the full pipeline (queue → render → upload → notify)
// before per-report-type templates land.
async function renderPdfBytes(job: ReportJob): Promise<{ bytes: Uint8Array; pageCount: number }> {
  // Tiny ad-hoc PDF builder. Avoids pulling pdf-lib over the egress for
  // the initial wiring; once Lovable adds a pdf-lib dependency the
  // template can use richer layout.
  const title = `Report: ${job.report_type}`;
  const subtitle = `Generated ${new Date().toISOString()}`;
  const paramsLine = `Params: ${JSON.stringify(job.params)}`;

  const escape = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const contentStream =
    `BT /F1 18 Tf 72 750 Td (${escape(title)}) Tj ET\n` +
    `BT /F1 10 Tf 72 725 Td (${escape(subtitle)}) Tj ET\n` +
    `BT /F1 9 Tf 72 700 Td (${escape(paramsLine.slice(0, 200))}) Tj ET\n`;

  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += off.toString().padStart(10, "0") + " 00000 n \n";
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return { bytes: new TextEncoder().encode(pdf), pageCount: 1 };
}

Deno.serve(async (_req: Request) => {
  try {
    const { data: queued, error: qErr } = await admin
      .from("report_jobs")
      .select("id, organization_id, user_id, report_type, params")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(5);
    if (qErr) throw qErr;

    const processed: { id: string; status: string }[] = [];

    for (const job of (queued || []) as ReportJob[]) {
      // Mark running. This is a no-op if another worker already grabbed it.
      const { error: runErr } = await admin.rpc("mark_report_job_running", { p_id: job.id });
      if (runErr) {
        console.warn(`[render_report] mark_running failed for ${job.id}:`, runErr.message);
        continue;
      }

      try {
        const { bytes, pageCount } = await renderPdfBytes(job);
        const path = `${job.organization_id}/reports/${job.id}.pdf`;

        const upload = await admin.storage
          .from(STORAGE_BUCKET)
          .upload(path, bytes, { contentType: "application/pdf", upsert: true });
        if (upload.error) throw upload.error;

        const { error: doneErr } = await admin.rpc("mark_report_job_succeeded", {
          p_id: job.id,
          p_storage_path: path,
          p_page_count: pageCount,
        });
        if (doneErr) throw doneErr;
        processed.push({ id: job.id, status: "succeeded" });
      } catch (err: any) {
        await admin.rpc("mark_report_job_failed", {
          p_id: job.id,
          p_error: String(err?.message ?? err).slice(0, 1000),
        });
        processed.push({ id: job.id, status: "failed" });
      }
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
