import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logError } from "../_shared/logger.ts";

// generate-pt-challan
//
// Generates a GRAS (Government Receipts Accounting System) CSV for Professional
// Tax (PT) payment from locked payroll_entries for a given month.
//
// Karnataka PT slabs (default; configurable via organization_compliance.state):
//   Gross > 15,000  → Rs. 200/month
//   Gross > 10,000  → Rs. 150/month
//   Gross <= 10,000 → Rs. 0
//
// Auth: admin, finance, or hr role required.
// Body: { pay_period: "2025-06", organization_id?: string }
// Returns: { signed_url: string; employee_count: number;
//             total_pt: number; warnings: string[] }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function ptSlab(gross: number, state: string): number {
  // Karnataka and most states use this slab; extend as needed
  if (gross > 15000) return 200;
  if (gross > 10000) return 150;
  return 0;
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
    const { pay_period, organization_id: bodyOrgId } = body;

    if (!pay_period || !/^\d{4}-\d{2}$/.test(pay_period)) {
      return json({ error: "pay_period must be in YYYY-MM format" }, 400);
    }

    // Resolve organization
    let orgId: string = bodyOrgId;
    if (!orgId) {
      const { data: prof } = await supabase
        .from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
      if (!prof?.organization_id) return json({ error: "organization_id required" }, 400);
      orgId = prof.organization_id;
    }

    // Fetch org details
    const { data: compliance } = await supabase
      .from("organization_compliance")
      .select("registered_name, state, pt_number")
      .eq("organization_id", orgId)
      .maybeSingle();

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();

    const employerName = compliance?.registered_name ?? org?.name ?? "Unknown Employer";
    const state = compliance?.state ?? "Karnataka";
    const ptNumber = compliance?.pt_number ?? "";

    // Fetch locked payroll run for this period
    const { data: runs } = await supabase
      .from("payroll_runs")
      .select("id, pay_period, status")
      .eq("organization_id", orgId)
      .eq("pay_period", pay_period)
      .in("status", ["locked", "finance_approved"]);

    if (!runs || runs.length === 0) {
      return json({ error: `No locked payroll run found for pay_period=${pay_period}` }, 404);
    }

    const runIds = runs.map((r: any) => r.id);

    // Fetch entries with gross earnings
    const { data: entries, error: entryErr } = await supabase
      .from("payroll_entries")
      .select("profile_id, gross_earnings, deductions_breakdown")
      .in("payroll_run_id", runIds);
    if (entryErr) return json({ error: entryErr.message }, 500);
    if (!entries || entries.length === 0) {
      return json({ error: "No payroll entries found" }, 404);
    }

    const profileIds = entries.map((e: any) => e.profile_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name ?? ""]));

    const warnings: string[] = [];
    const csvRows: string[] = [];

    // GRAS CSV header for PT challan
    csvRows.push([
      "Sr No", "Employee Name", "Gross Salary (Rs.)",
      "PT Slab (Rs.)", "Remarks",
    ].join(","));

    let sr = 0;
    let totalPT = 0;

    for (const e of entries) {
      const name = nameMap.get(e.profile_id) ?? e.profile_id;
      const gross = Number(e.gross_earnings);

      // Prefer stored PT from deductions_breakdown if present
      const storedPT = (e.deductions_breakdown as any[])?.find(
        (d: any) => d.name?.toLowerCase().includes("professional tax")
      )?.monthly ?? null;

      const ptAmount = storedPT !== null ? Number(storedPT) : ptSlab(gross, state);

      if (ptAmount === 0) {
        warnings.push(`${name}: gross Rs. ${gross.toFixed(2)} — PT = 0 (below slab threshold)`);
        continue;
      }

      sr++;
      totalPT += ptAmount;
      const safeName = `"${String(name).replace(/"/g, '""')}"`;
      csvRows.push([sr, safeName, gross.toFixed(2), ptAmount.toFixed(2), `"Salary ${pay_period}"`].join(","));
    }

    if (sr === 0) {
      return json({ error: "No employees have PT liability for this period", warnings }, 422);
    }

    // Summary row
    csvRows.push(["", `"TOTAL (${sr} employees)"`, "", totalPT.toFixed(2), ""].join(","));

    // Challan header block (GRAS fields)
    const header = [
      `"Employer: ${employerName}"`,
      `"PT Registration No: ${ptNumber || 'N/A'}"`,
      `"State: ${state}"`,
      `"Pay Period: ${pay_period}"`,
      `"Generated: ${new Date().toISOString().split("T")[0]}"`,
    ].join("\n");

    const csvContent = header + "\n\n" + csvRows.join("\n");
    const csvBytes = new TextEncoder().encode(csvContent);

    const storagePath = `pt-challan/${orgId}/${pay_period}/PT_Challan_${Date.now()}.csv`;
    const { error: uploadErr } = await supabase.storage
      .from("erp-documents")
      .upload(storagePath, csvBytes, { contentType: "text/csv", upsert: false });
    if (uploadErr) return json({ error: `Storage upload failed: ${uploadErr.message}` }, 500);

    const { data: signed } = await supabase.storage
      .from("erp-documents")
      .createSignedUrl(storagePath, 3600);

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: "pt_challan_generated",
      entity_type: "statutory_filing",
      organization_id: orgId,
      metadata: {
        pay_period,
        state,
        employee_count: sr,
        total_pt: totalPT,
        warning_count: warnings.length,
        storage_path: storagePath,
      },
    }).catch(() => {});

    return json({
      signed_url: signed?.signedUrl ?? null,
      employee_count: sr,
      total_pt: totalPT,
      warnings,
    });
  } catch (err) {
    logError("generate-pt-challan", err);
    return json({ error: (err as Error).message }, 500);
  }
});
