import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logError } from "../_shared/logger.ts";

// generate-form-24q
//
// Generates an NSDL FVU-compatible text file (Form 24Q — Salary TDS Return)
// from locked/processed payroll_entries for a given quarter.
//
// NSDL FVU text-file format: caret-delimited (^), CRLF line endings.
// Record types generated:
//   BHNT  — Batch Header (one per file)
//   T     — Challan detail (one synthetic challan per quarter)
//   D     — Employee (deductee) detail record (one per employee)
//   VR    — Verification record (one per file)
//
// Auth: admin, finance, or hr role required.
// Body: { quarter: "Q1"|"Q2"|"Q3"|"Q4", financial_year: "2025-26",
//          organization_id?: string }
// Returns: { signed_url: string; employee_count: number; warnings: string[] }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Maps quarter tag to pay_period month range (FY starts April)
const QUARTER_MONTHS: Record<string, string[]> = {
  Q1: ["04", "05", "06"],
  Q2: ["07", "08", "09"],
  Q3: ["10", "11", "12"],
  Q4: ["01", "02", "03"],
};

function pad(v: string | number, len: number, char = " "): string {
  return String(v).padEnd(len, char).slice(0, len);
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
    const allowed = (callerRoles ?? []).some((r: any) =>
      ["admin", "finance", "hr"].includes(r.role)
    );
    if (!allowed) return json({ error: "Forbidden: admin, finance, or hr role required" }, 403);

    const body = await req.json();
    const { quarter, financial_year, organization_id: bodyOrgId } = body;

    if (!quarter || !QUARTER_MONTHS[quarter]) {
      return json({ error: "quarter must be one of Q1, Q2, Q3, Q4" }, 400);
    }
    if (!financial_year || !/^\d{4}-\d{2}$/.test(financial_year)) {
      return json({ error: "financial_year must be in format YYYY-YY (e.g. 2025-26)" }, 400);
    }

    // Resolve organization_id from caller's profile if not supplied
    let orgId: string = bodyOrgId;
    if (!orgId) {
      const { data: prof } = await supabase
        .from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
      if (!prof?.organization_id) return json({ error: "organization_id required" }, 400);
      orgId = prof.organization_id;
    }

    // Fetch organization compliance details (TAN, legal name, address)
    const { data: compliance } = await supabase
      .from("organization_compliance")
      .select("tan_number, registered_name, registered_address, state, pincode")
      .eq("organization_id", orgId)
      .maybeSingle();

    const tan = (compliance?.tan_number ?? "AAAA00000A").toUpperCase();
    const deductorName = compliance?.registered_name ?? "Unknown Employer";
    const deductorAddr = [
      compliance?.registered_address,
      compliance?.state,
      compliance?.pincode,
    ].filter(Boolean).join(", ");

    // Build pay_period filter for the quarter
    const fyStart = parseInt(financial_year.split("-")[0]);
    const months = QUARTER_MONTHS[quarter];
    const payPeriods = months.map((m) => {
      const yr = (quarter === "Q4") ? fyStart + 1 : fyStart;
      return `${yr}-${m}`;
    });

    // Fetch payroll_runs for this org + period
    const { data: runs, error: runErr } = await supabase
      .from("payroll_runs")
      .select("id, pay_period, status")
      .eq("organization_id", orgId)
      .in("pay_period", payPeriods)
      .in("status", ["locked", "finance_approved"]);
    if (runErr) return json({ error: runErr.message }, 500);

    if (!runs || runs.length === 0) {
      return json({ error: `No locked payroll runs found for ${financial_year} ${quarter} (periods: ${payPeriods.join(", ")})` }, 404);
    }

    const runIds = runs.map((r: any) => r.id);

    // Fetch payroll entries
    const { data: entries, error: entryErr } = await supabase
      .from("payroll_entries")
      .select("profile_id, gross_earnings, tds_amount, earnings_breakdown, payroll_run_id")
      .in("payroll_run_id", runIds);
    if (entryErr) return json({ error: entryErr.message }, 500);
    if (!entries || entries.length === 0) {
      return json({ error: "No payroll entries found for the specified quarter" }, 404);
    }

    // Fetch employee details (PAN, name)
    const profileIds = [...new Set(entries.map((e: any) => e.profile_id))];
    const { data: empDetails } = await supabase
      .from("employee_details")
      .select("profile_id, pan_number")
      .in("profile_id", profileIds);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);

    const panMap = new Map((empDetails ?? []).map((d: any) => [d.profile_id, d.pan_number ?? ""]));
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name ?? ""]));

    const warnings: string[] = [];

    // Aggregate per employee across all runs in the quarter
    const empAgg = new Map<string, { name: string; pan: string; gross: number; tds: number; hra: number }>();
    for (const e of entries) {
      const pid = e.profile_id;
      const existing = empAgg.get(pid) ?? {
        name: nameMap.get(pid) ?? "Unknown",
        pan: panMap.get(pid) ?? "",
        gross: 0,
        tds: 0,
        hra: 0,
      };
      const hraMonthly = (e.earnings_breakdown as any[])?.find(
        (c: any) => c.name?.toLowerCase().includes("hra")
      )?.monthly ?? 0;
      existing.gross += Number(e.gross_earnings);
      existing.tds   += Number(e.tds_amount ?? 0);
      existing.hra   += Number(hraMonthly);
      empAgg.set(pid, existing);
    }

    // Check for missing PANs
    for (const [pid, emp] of empAgg) {
      if (!emp.pan) {
        warnings.push(`${emp.name}: PAN missing — PANNOTAVBL used (may be rejected by FVU)`);
        empAgg.set(pid, { ...emp, pan: "PANNOTAVBL" });
      }
    }

    const empArray = [...empAgg.values()];
    const totalTDS = empArray.reduce((s, e) => s + e.tds, 0);
    const quarterLabel = `${quarter} ${financial_year}`;

    // ── NSDL FVU text file ────────────────────────────────────────────────────
    // Caret-delimited; CRLF line endings; fields in exact FVU column order.
    // This implements the simplified employee TDS text-file layout that the
    // NSDL FVU tool accepts as input (not the binary RPU output).

    const lines: string[] = [];

    // BHNT: Batch Header
    // Fields: Record type | Form type | Quarter | FY | TAN | Deductor name | ...
    lines.push([
      "BHNT",
      "24Q",
      quarter,
      financial_year,
      tan,
      deductorName,
      deductorAddr,
      "Regular",
      new Date().toISOString().split("T")[0],
    ].join("^"));

    // T: Challan record (one synthetic challan covering the quarter total)
    // Fields: Record type | Serial | BSR Code | Date | Challan No | TDS amount | ...
    lines.push([
      "T",
      "1",
      "0000000",                           // BSR code placeholder
      new Date().toISOString().split("T")[0],
      "0",                                  // Challan number (0 = not yet deposited)
      totalTDS.toFixed(2),
      "0.00",                              // Surcharge
      "0.00",                              // Education cess
      totalTDS.toFixed(2),                 // Total
      "0",                                 // Interest
      "0",                                 // Others
      "0.00",                              // Fee
      empArray.length.toString(),
    ].join("^"));

    // D: One record per employee
    let seq = 1;
    for (const emp of empArray) {
      const stdDed = Math.min(75000 / 4, emp.gross * 0.5);
      const hraExempt = emp.hra * 0.4;
      const taxableIncome = Math.max(0, emp.gross - hraExempt - stdDed);
      const cess = emp.tds * 0.04;
      lines.push([
        "D",
        String(seq++),
        emp.pan.toUpperCase(),
        emp.name.replace(/\^/g, " "),
        emp.gross.toFixed(2),
        hraExempt.toFixed(2),
        stdDed.toFixed(2),
        taxableIncome.toFixed(2),
        emp.tds.toFixed(2),
        "0.00",          // Surcharge
        cess.toFixed(2), // Health & education cess
        (emp.tds + cess).toFixed(2), // Total TDS
        "1",             // Challan serial reference
      ].join("^"));
    }

    // VR: Verification record
    lines.push(["VR", empArray.length.toString(), totalTDS.toFixed(2)].join("^"));

    const fileContent = lines.join("\r\n");
    const fileBytes = new TextEncoder().encode(fileContent);

    const storagePath = `tds/24q/${orgId}/${financial_year.replace("-", "_")}/${quarter}/Form24Q_${Date.now()}.txt`;
    const { error: uploadErr } = await supabase.storage
      .from("erp-documents")
      .upload(storagePath, fileBytes, { contentType: "text/plain", upsert: false });
    if (uploadErr) return json({ error: `Storage upload failed: ${uploadErr.message}` }, 500);

    const { data: signed } = await supabase.storage
      .from("erp-documents")
      .createSignedUrl(storagePath, 3600);

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: "form_24q_generated",
      entity_type: "tds_return",
      organization_id: orgId,
      metadata: {
        quarter,
        financial_year,
        employee_count: empArray.length,
        total_tds: totalTDS,
        warning_count: warnings.length,
        storage_path: storagePath,
      },
    }).catch(() => {});

    return json({
      signed_url: signed?.signedUrl ?? null,
      employee_count: empArray.length,
      warnings,
    });
  } catch (err) {
    logError("generate-form-24q", err);
    return json({ error: (err as Error).message }, 500);
  }
});
