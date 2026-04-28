import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// migrate-legacy-payroll
//
// Reads payroll_records where is_superseded=false and no matching payroll_entries
// row exists for the same (profile_id, pay_period). For each such record, creates
// a synthetic payroll_run + payroll_entry, then marks the payroll_record as
// is_superseded=true.
//
// The function is idempotent: re-running it skips any payroll_record that already
// has a matching payroll_entries row (matched via the payroll_entries.profile_id +
// payroll_run.pay_period join).
//
// Auth: requires admin or payroll role. Typically called once during migration.
// Returns: { migrated: N, skipped: N, errors: string[] }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Verify caller identity
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // Service role client for bulk reads/writes
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // RBAC: admin or payroll only
    const { data: callerRoles } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    const allowed = (callerRoles ?? []).some((r: any) => ["admin", "payroll"].includes(r.role));
    if (!allowed) return json({ error: "Forbidden: admin or payroll role required" }, 403);

    // Optional: limit to a single organization for targeted migration
    const body = await req.json().catch(() => ({}));
    const orgFilter: string | null = body.organization_id ?? null;

    // Fetch non-superseded payroll_records
    let recordsQuery = supabase
      .from("payroll_records")
      .select("id, profile_id, organization_id, pay_period, basic_salary, hra, transport_allowance, other_allowances, pf_deduction, tax_deduction, other_deductions, lop_days, lop_deduction, working_days, paid_days, net_pay, status")
      .eq("is_superseded", false)
      .not("organization_id", "is", null);

    if (orgFilter) recordsQuery = recordsQuery.eq("organization_id", orgFilter);

    const { data: legacyRecords, error: fetchErr } = await recordsQuery;
    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!legacyRecords || legacyRecords.length === 0) {
      return json({ migrated: 0, skipped: 0, errors: [] });
    }

    // Build a set of (profile_id, pay_period) pairs that already have engine entries.
    // We do this by joining payroll_entries → payroll_runs for pay_period.
    const { data: existingEntries } = await supabase
      .from("payroll_entries")
      .select("profile_id, payroll_runs!payroll_run_id(pay_period)")
      .in("profile_id", [...new Set(legacyRecords.map((r: any) => r.profile_id))]);

    const alreadyMigrated = new Set<string>();
    for (const e of (existingEntries ?? [])) {
      const period = (e.payroll_runs as any)?.pay_period;
      if (period) alreadyMigrated.add(`${e.profile_id}:${period}`);
    }

    let migrated = 0, skipped = 0;
    const errors: string[] = [];

    for (const rec of legacyRecords) {
      const key = `${rec.profile_id}:${rec.pay_period}`;
      if (alreadyMigrated.has(key)) { skipped++; continue; }

      const gross = Number(rec.basic_salary) + Number(rec.hra) +
                    Number(rec.transport_allowance) + Number(rec.other_allowances);
      const totalDed = Number(rec.pf_deduction) + Number(rec.tax_deduction) +
                       Number(rec.other_deductions) + Number(rec.lop_deduction ?? 0);
      const netPay = Number(rec.net_pay);

      const earningsBreakdown = [
        { name: "Basic Salary",     monthly: Number(rec.basic_salary) },
        { name: "HRA",              monthly: Number(rec.hra) },
        { name: "Incentives",       monthly: Number(rec.transport_allowance) },
        { name: "Other Allowances", monthly: Number(rec.other_allowances) },
      ].filter((e) => e.monthly > 0);

      const deductionsBreakdown = [
        { name: "PF Contribution", monthly: Number(rec.pf_deduction) },
        { name: "TDS",             monthly: Number(rec.tax_deduction) },
        { name: "Other Deductions",monthly: Number(rec.other_deductions) + Number(rec.lop_deduction ?? 0) },
      ].filter((d) => d.monthly > 0);

      // Create a synthetic payroll_run for this period + org
      const { data: runRow, error: runErr } = await supabase
        .from("payroll_runs")
        .insert({
          organization_id: rec.organization_id,
          pay_period: rec.pay_period,
          generated_by: userId,
          status: rec.status === "locked" ? "locked" : "draft",
          employee_count: 1,
          total_gross: gross,
          total_deductions: totalDed,
          total_net: netPay,
          notes: "Migrated from legacy payroll_records",
        })
        .select("id")
        .single();

      if (runErr || !runRow) {
        errors.push(`[${rec.id}] payroll_runs insert failed: ${runErr?.message ?? "no row"}`);
        continue;
      }

      const { error: entryErr } = await supabase.from("payroll_entries").insert({
        payroll_run_id: runRow.id,
        profile_id: rec.profile_id,
        organization_id: rec.organization_id,
        gross_earnings: gross,
        total_deductions: totalDed,
        net_pay: netPay,
        annual_ctc: gross * 12,
        lwp_days: rec.lop_days ?? 0,
        lwp_deduction: rec.lop_deduction ?? 0,
        working_days: rec.working_days ?? 0,
        paid_days: rec.paid_days ?? 0,
        earnings_breakdown: earningsBreakdown,
        deductions_breakdown: deductionsBreakdown,
        status: "computed",
      });

      if (entryErr) {
        errors.push(`[${rec.id}] payroll_entries insert failed: ${entryErr.message}`);
        // Clean up the orphaned run
        await supabase.from("payroll_runs").delete().eq("id", runRow.id);
        continue;
      }

      // Mark legacy record as superseded
      await supabase
        .from("payroll_records")
        .update({ is_superseded: true, status: "superseded" })
        .eq("id", rec.id);

      alreadyMigrated.add(key); // prevent duplicate migration for same profile+period
      migrated++;
    }

    return json({ migrated, skipped, errors });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
