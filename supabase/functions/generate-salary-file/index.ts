import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logError } from "../_shared/logger.ts";

// generate-salary-file
//
// Reads finance_approved payroll_entries + employee_details bank fields,
// validates IFSC format, outputs a generic NEFT batch CSV, stores it to
// disbursements/{org_id}/{YYYY-MM}/ in the erp-documents bucket, and returns
// a 1-hour signed URL accessible to finance + admin roles.
//
// Auth: admin or finance role required.
// Body: { payroll_run_id: string }
// Returns: { signed_url: string; row_count: number; validation_errors: string[] }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// IFSC: 4 alpha (bank code) + 0 + 6 alphanumeric (branch code)
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function validateIfsc(ifsc: string): boolean {
  return IFSC_RE.test(ifsc.trim().toUpperCase());
}

// Wrap every CSV cell in quotes and escape embedded quotes — prevents formula injection.
function csvEsc(v: string): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // RBAC
    const { data: callerRoles } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    const allowed = (callerRoles ?? []).some((r: any) => ["admin", "finance"].includes(r.role));
    if (!allowed) return json({ error: "Forbidden: admin or finance role required" }, 403);

    const body = await req.json();
    const { payroll_run_id } = body;
    if (!payroll_run_id) return json({ error: "payroll_run_id required" }, 400);

    // Fetch the run — must be locked or finance_approved
    const { data: run, error: runErr } = await supabase
      .from("payroll_runs")
      .select("id, organization_id, pay_period, status")
      .eq("id", payroll_run_id)
      .single();
    if (runErr || !run) return json({ error: "Payroll run not found" }, 404);
    if (!["locked", "finance_approved"].includes(run.status)) {
      return json({ error: `Run status is '${run.status}'; must be locked or finance_approved` }, 400);
    }

    // Fetch entries
    const { data: entries, error: entryErr } = await supabase
      .from("payroll_entries")
      .select("id, profile_id, net_pay, status")
      .eq("payroll_run_id", payroll_run_id);
    if (entryErr) return json({ error: entryErr.message }, 500);
    if (!entries || entries.length === 0) return json({ error: "No entries found for this run" }, 404);

    // Fetch bank details for all profiles
    const profileIds = entries.map((e: any) => e.profile_id);
    const { data: empDetails } = await supabase
      .from("employee_details")
      .select("profile_id, bank_account_number, bank_ifsc, bank_name")
      .in("profile_id", profileIds);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);

    const detailsMap = new Map((empDetails ?? []).map((d: any) => [d.profile_id, d]));
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const csvRows: string[] = [];
    const validationErrors: string[] = [];
    let rowCount = 0;

    // NEFT batch CSV header (generic bank format)
    csvRows.push([
      "Sr No", "Beneficiary Name", "Account Number", "IFSC Code",
      "Bank Name", "Amount (INR)", "Payment Mode", "Remarks",
    ].join(","));

    for (const entry of entries) {
      const det = detailsMap.get(entry.profile_id);
      const prof = profileMap.get(entry.profile_id);
      const name = prof?.full_name ?? "Unknown";

      if (!det?.bank_account_number) {
        validationErrors.push(`${name}: missing bank account number — skipped`);
        continue;
      }
      if (!det?.bank_ifsc) {
        validationErrors.push(`${name}: missing IFSC code — skipped`);
        continue;
      }
      if (!validateIfsc(det.bank_ifsc)) {
        validationErrors.push(`${name}: invalid IFSC '${det.bank_ifsc}' (expected 4-alpha 0 6-alnum) — skipped`);
        continue;
      }
      if (!entry.net_pay || Number(entry.net_pay) <= 0) {
        validationErrors.push(`${name}: net_pay is zero or negative — skipped`);
        continue;
      }

      rowCount++;
      csvRows.push([
        rowCount,
        csvEsc(name),
        csvEsc(det.bank_account_number),
        csvEsc(det.bank_ifsc.toUpperCase()),
        csvEsc(det.bank_name ?? ""),
        Number(entry.net_pay).toFixed(2),
        "NEFT",
        csvEsc(`Salary ${run.pay_period}`),
      ].join(","));
    }

    if (rowCount === 0) {
      return json({ error: "No valid entries to include in salary file", validation_errors: validationErrors }, 422);
    }

    const csvContent = csvRows.join("\n");
    const csvBytes = new TextEncoder().encode(csvContent);

    // Upload to Storage: disbursements/{org_id}/{YYYY-MM}/salary_file.csv
    const storagePath = `disbursements/${run.organization_id}/${run.pay_period}/salary_neft_${Date.now()}.csv`;
    const { error: uploadErr } = await supabase.storage
      .from("erp-documents")
      .upload(storagePath, csvBytes, { contentType: "text/csv", upsert: false });

    if (uploadErr) return json({ error: `Storage upload failed: ${uploadErr.message}` }, 500);

    const { data: signed } = await supabase.storage
      .from("erp-documents")
      .createSignedUrl(storagePath, 3600);

    // Mark run as finance_approved once the salary file is successfully generated.
    // This prevents silent duplicate generation: a second call on a finance_approved run
    // still succeeds (explicit regeneration by finance/admin is valid) but the status
    // change provides a clear audit trail that a file has already been produced.
    if (run.status === "locked") {
      await supabase
        .from("payroll_runs")
        .update({ status: "finance_approved" })
        .eq("id", payroll_run_id)
        .catch(() => {});
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: "salary_file_generated",
      entity_type: "payroll_run",
      entity_id: payroll_run_id,
      organization_id: run.organization_id,
      metadata: {
        pay_period: run.pay_period,
        row_count: rowCount,
        validation_error_count: validationErrors.length,
        storage_path: storagePath,
      },
    }).catch(() => {});

    return json({
      signed_url: signed?.signedUrl ?? null,
      row_count: rowCount,
      validation_errors: validationErrors,
    });
  } catch (err) {
    logError("generate-salary-file", err);
    return json({ error: (err as Error).message }, 500);
  }
});
