import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify JWT using getClaims
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");
    const userId = claimsData.claims.sub as string;

    // Use service role for data operations
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .single();

    console.log("Profile lookup for user:", userId, "result:", profile, "error:", profileErr);

    const orgId = profile?.organization_id;
    if (!orgId) throw new Error("No organization found for user " + userId);

    const { action, financial_year, run_id } = await req.json();

    // ─── ACTION: run_full_audit ───────────────────────────────────────
    if (action === "run_full_audit") {
      return await runFullAudit(supabase, orgId, userId, financial_year, LOVABLE_API_KEY);
    }

    // ─── ACTION: generate_auditor_pack ────────────────────────────────
    if (action === "generate_auditor_pack") {
      return await generateAuditorPack(supabase, orgId, userId, financial_year, run_id);
    }

    // ─── ACTION: pre_audit_simulation ─────────────────────────────────
    if (action === "pre_audit_simulation") {
      return await runPreAuditSimulation(supabase, orgId, userId, financial_year, LOVABLE_API_KEY);
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-audit-engine error:", e);
    const status = e instanceof Error && e.message === "Unauthorized" ? 401 : 500;
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FULL AUDIT RUN
// ═══════════════════════════════════════════════════════════════════════════

async function runFullAudit(
  supabase: any, orgId: string, userId: string,
  financialYear: string, apiKey: string,
) {
  // 1. Create the compliance run record
  const { data: run, error: runErr } = await supabase
    .from("audit_compliance_runs")
    .insert({
      organization_id: orgId,
      financial_year: financialYear,
      run_by: userId,
      run_type: "full",
      status: "running",
    })
    .select("*")
    .single();

  if (runErr) throw new Error(`Failed to create run: ${runErr.message}`);
  const runId = run.id;

  try {
    // 2. Gather all financial data for the FY
    const snapshot = await gatherAuditData(supabase, orgId, financialYear);

    // 3. Run deterministic compliance checks (ICE Layer 2)
    const complianceResults = runDeterministicChecks(snapshot);
    
    // 4. Run deterministic IFC checks (Layer 3)
    const ifcResults = runIFCChecks(snapshot);

    // 5. Insert compliance checks
    if (complianceResults.checks.length > 0) {
      await supabase.from("audit_compliance_checks").insert(
        complianceResults.checks.map((c: any) => ({
          ...c, run_id: runId, organization_id: orgId,
        }))
      );
    }

    // 6. Insert IFC assessments
    if (ifcResults.assessments.length > 0) {
      await supabase.from("audit_ifc_assessments").insert(
        ifcResults.assessments.map((a: any) => ({
          ...a, run_id: runId, organization_id: orgId,
        }))
      );
    }

    // 7. Call AI for anomaly detection, risk clustering, sampling, narratives
    const aiResults = await callAIEngine(apiKey, snapshot, complianceResults, ifcResults, financialYear);

    // 8. Insert AI anomalies
    if (aiResults.anomalies?.length > 0) {
      await supabase.from("audit_ai_anomalies").insert(
        aiResults.anomalies.map((a: any) => ({
          ...a, run_id: runId, organization_id: orgId,
        }))
      );
    }

    // 9. Insert risk themes
    if (aiResults.risk_themes?.length > 0) {
      await supabase.from("audit_risk_themes").insert(
        aiResults.risk_themes.map((t: any) => ({
          ...t, run_id: runId, organization_id: orgId,
        }))
      );
    }

    // 10. Insert samples
    if (aiResults.samples?.length > 0) {
      await supabase.from("audit_ai_samples").insert(
        aiResults.samples.map((s: any) => ({
          ...s, run_id: runId, organization_id: orgId,
        }))
      );
    }

    // 11. Insert narratives
    if (aiResults.narratives?.length > 0) {
      await supabase.from("audit_ai_narratives").insert(
        aiResults.narratives.map((n: any) => ({
          ...n, run_id: runId, organization_id: orgId, financial_year: financialYear,
        }))
      );
    }

    // 12. Compute scores
    const complianceScore = computeComplianceScore(complianceResults, ifcResults, snapshot);
    const riskIndex = computeRiskIndex(aiResults);
    const ifcRating = computeIFCRating(ifcResults);

    // 13. Finalize run
    await supabase.from("audit_compliance_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        compliance_score: complianceScore.total,
        ai_risk_index: riskIndex.total,
        ifc_rating: ifcRating,
        score_breakdown: complianceScore.breakdown,
        risk_breakdown: riskIndex.breakdown,
      })
      .eq("id", runId);

    return new Response(JSON.stringify({
      success: true,
      run_id: runId,
      compliance_score: complianceScore.total,
      ai_risk_index: riskIndex.total,
      ifc_rating: ifcRating,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (innerErr) {
    // Mark run as failed
    await supabase.from("audit_compliance_runs")
      .update({ status: "failed" })
      .eq("id", runId);
    throw innerErr;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA GATHERING
// ═══════════════════════════════════════════════════════════════════════════

async function gatherAuditData(supabase: any, orgId: string, fy: string) {
  // Parse FY "2025-26" → Apr 2025 – Mar 2026
  const parts = fy.split("-");
  const startYear = parseInt(parts[0]);
  const endYearShort = parseInt(parts[1]);
  const endYear = endYearShort < 100 ? startYear + 1 : endYearShort;
  const fyStart = `${startYear}-04-01`;
  const fyEnd = `${endYear}-03-31`;

  const [
    glAccounts, journalEntries, journalLines,
    invoices, bills, expenses, vendors, customers,
    auditLogs, assets, payrollRecords, bankTxns,
  ] = await Promise.all([
    supabase.from("gl_accounts").select("*").eq("organization_id", orgId).eq("is_active", true),
    supabase.from("journal_entries").select("*").eq("organization_id", orgId)
      .gte("entry_date", fyStart).lte("entry_date", fyEnd).order("entry_date"),
    supabase.from("journal_lines").select("*, journal_entries!inner(entry_date, organization_id, source, status, created_by, approved_by, is_manual, narration, created_at)")
      .eq("journal_entries.organization_id", orgId)
      .gte("journal_entries.entry_date", fyStart).lte("journal_entries.entry_date", fyEnd),
    supabase.from("invoices").select("*").eq("organization_id", orgId)
      .gte("created_at", fyStart).lte("created_at", fyEnd + "T23:59:59"),
    supabase.from("bills").select("*").eq("organization_id", orgId)
      .gte("bill_date", fyStart).lte("bill_date", fyEnd),
    supabase.from("financial_records").select("*").eq("organization_id", orgId).eq("type", "expense")
      .gte("date", fyStart).lte("date", fyEnd),
    supabase.from("vendors").select("*").eq("organization_id", orgId),
    supabase.from("customers").select("*").eq("organization_id", orgId),
    supabase.from("audit_logs").select("*").eq("organization_id", orgId)
      .gte("created_at", fyStart).lte("created_at", fyEnd + "T23:59:59").limit(500),
    supabase.from("assets").select("*").eq("organization_id", orgId),
    supabase.from("payroll_records").select("*").eq("organization_id", orgId).limit(200),
    supabase.from("bank_transactions").select("*").eq("organization_id", orgId)
      .gte("transaction_date", fyStart).lte("transaction_date", fyEnd),
  ]);

  return {
    fyStart, fyEnd, financialYear: fy,
    glAccounts: glAccounts.data || [],
    journalEntries: journalEntries.data || [],
    journalLines: journalLines.data || [],
    invoices: invoices.data || [],
    bills: bills.data || [],
    expenses: expenses.data || [],
    vendors: vendors.data || [],
    customers: customers.data || [],
    auditLogs: auditLogs.data || [],
    assets: assets.data || [],
    payrollRecords: payrollRecords.data || [],
    bankTransactions: bankTxns.data || [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISTIC COMPLIANCE CHECKS (ICE)
// ═══════════════════════════════════════════════════════════════════════════

function runDeterministicChecks(snapshot: any) {
  const checks: any[] = [];

  // ─── GST Checks ────────────────────────────────────────────────────
  // G1: GSTIN format validation on vendors/customers
  const invalidGSTINVendors = (snapshot.vendors || []).filter((v: any) =>
    v.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v.gstin)
  );
  checks.push({
    module: "gst", check_code: "G1", check_name: "GSTIN Format Validation (Vendors)",
    severity: invalidGSTINVendors.length > 0 ? "warning" : "info",
    status: invalidGSTINVendors.length === 0 ? "pass" : "fail",
    affected_count: invalidGSTINVendors.length,
    affected_amount: 0,
    recommendation: invalidGSTINVendors.length > 0 ? "Correct invalid GSTINs to avoid ITC disallowance." : null,
    details: { invalid_vendors: invalidGSTINVendors.slice(0, 10).map((v: any) => v.name) },
    data_references: [],
  });

  const invalidGSTINCustomers = (snapshot.customers || []).filter((c: any) =>
    c.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(c.gstin)
  );
  checks.push({
    module: "gst", check_code: "G2", check_name: "GSTIN Format Validation (Customers)",
    severity: invalidGSTINCustomers.length > 0 ? "warning" : "info",
    status: invalidGSTINCustomers.length === 0 ? "pass" : "fail",
    affected_count: invalidGSTINCustomers.length,
    affected_amount: 0,
    recommendation: invalidGSTINCustomers.length > 0 ? "Verify customer GSTINs for accurate GSTR-1 filing." : null,
    details: { invalid_customers: invalidGSTINCustomers.slice(0, 10).map((c: any) => c.name) },
    data_references: [],
  });

  // G3: Invoice tax amount consistency
  const taxMismatchInvoices = (snapshot.invoices || []).filter((inv: any) => {
    const expectedTotal = Number(inv.amount || 0) + Number(inv.tax_amount || 0);
    return Math.abs(expectedTotal - Number(inv.total_amount || 0)) > 1;
  });
  checks.push({
    module: "gst", check_code: "G3", check_name: "Invoice Tax Amount Consistency",
    severity: taxMismatchInvoices.length > 0 ? "critical" : "info",
    status: taxMismatchInvoices.length === 0 ? "pass" : "fail",
    affected_count: taxMismatchInvoices.length,
    affected_amount: taxMismatchInvoices.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0),
    recommendation: taxMismatchInvoices.length > 0 ? "Tax + subtotal ≠ total on these invoices. Reconcile immediately." : null,
    details: {},
    data_references: taxMismatchInvoices.slice(0, 5).map((i: any) => i.invoice_number),
  });

  // G4: Bills without vendor GSTIN (ITC at risk)
  const billsNoGSTIN = (snapshot.bills || []).filter((b: any) => {
    if (!b.vendor_id) return true;
    const vendor = (snapshot.vendors || []).find((v: any) => v.id === b.vendor_id);
    return !vendor?.gstin;
  });
  checks.push({
    module: "gst", check_code: "G4", check_name: "ITC at Risk – Bills Without Vendor GSTIN",
    severity: billsNoGSTIN.length > 0 ? "warning" : "info",
    status: billsNoGSTIN.length === 0 ? "pass" : "warning",
    affected_count: billsNoGSTIN.length,
    affected_amount: billsNoGSTIN.reduce((s: number, b: any) => s + Number(b.tax_amount || 0), 0),
    recommendation: "Obtain vendor GSTINs to claim Input Tax Credit.",
    details: {},
    data_references: [],
  });

  // ─── TDS Checks ────────────────────────────────────────────────────
  // T1: High-value expenses without TDS deduction indicator
  const highValueExpenses = (snapshot.expenses || []).filter((e: any) => Number(e.amount || 0) > 30000);
  checks.push({
    module: "tds", check_code: "T1", check_name: "High-Value Expenses – TDS Review Required",
    severity: highValueExpenses.length > 5 ? "warning" : "info",
    status: highValueExpenses.length === 0 ? "pass" : "warning",
    affected_count: highValueExpenses.length,
    affected_amount: highValueExpenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0),
    recommendation: "Verify TDS deducted on all expenses above threshold per applicable section.",
    details: {},
    data_references: [],
  });

  // T2: Vendor payments without PAN (Section 206AA – TDS at higher rate)
  const vendorsNoPAN = (snapshot.vendors || []).filter((v: any) => !v.pan);
  const billsToNoPAN = (snapshot.bills || []).filter((b: any) =>
    vendorsNoPAN.some((v: any) => v.id === b.vendor_id)
  );
  checks.push({
    module: "tds", check_code: "T2", check_name: "Vendors Without PAN (206AA Risk)",
    severity: vendorsNoPAN.length > 0 ? "warning" : "info",
    status: vendorsNoPAN.length === 0 ? "pass" : "warning",
    affected_count: vendorsNoPAN.length,
    affected_amount: billsToNoPAN.reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0),
    recommendation: "Collect PANs from all vendors. TDS must be deducted at higher rates without PAN.",
    details: { vendors_without_pan: vendorsNoPAN.slice(0, 10).map((v: any) => v.name) },
    data_references: [],
  });

  // ─── Income Tax Checks ─────────────────────────────────────────────
  // IT1: Cash expenses > ₹10,000 (Section 40A(3))
  const cashExpenses = (snapshot.expenses || []).filter((e: any) =>
    Number(e.amount || 0) > 10000 && (e.payment_mode === "cash" || e.category?.toLowerCase().includes("cash"))
  );
  checks.push({
    module: "income_tax", check_code: "IT1", check_name: "Cash Payments > ₹10,000 (Sec 40A(3))",
    severity: cashExpenses.length > 0 ? "critical" : "info",
    status: cashExpenses.length === 0 ? "pass" : "fail",
    affected_count: cashExpenses.length,
    affected_amount: cashExpenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0),
    recommendation: "Payments exceeding ₹10,000 in cash are disallowed u/s 40A(3). Switch to banking channels.",
    details: {},
    data_references: [],
  });

  // IT2: Round figure entries (potential manipulation)
  const roundFigureEntries = (snapshot.journalLines || []).filter((l: any) => {
    const amount = Number(l.debit || l.credit || 0);
    return amount > 10000 && amount % 1000 === 0;
  });
  checks.push({
    module: "income_tax", check_code: "IT2", check_name: "Round Figure Journal Entries",
    severity: roundFigureEntries.length > 20 ? "warning" : "info",
    status: roundFigureEntries.length > 20 ? "warning" : "pass",
    affected_count: roundFigureEntries.length,
    affected_amount: roundFigureEntries.reduce((s: number, l: any) => s + Number(l.debit || l.credit || 0), 0),
    recommendation: "High frequency of round figure entries may indicate estimation or manipulation.",
    details: { count: roundFigureEntries.length },
    data_references: [],
  });

  // ─── Fixed Asset Checks ────────────────────────────────────────────
  // FA1: Assets with zero depreciation
  const zeroDepAssets = (snapshot.assets || []).filter((a: any) =>
    a.status === "active" && Number(a.accumulated_depreciation || 0) === 0 &&
    a.depreciation_method !== "none"
  );
  checks.push({
    module: "fixed_assets", check_code: "FA1", check_name: "Active Assets with Zero Depreciation",
    severity: zeroDepAssets.length > 0 ? "warning" : "info",
    status: zeroDepAssets.length === 0 ? "pass" : "warning",
    affected_count: zeroDepAssets.length,
    affected_amount: zeroDepAssets.reduce((s: number, a: any) => s + Number(a.purchase_price || 0), 0),
    recommendation: "Run depreciation schedule for assets not yet depreciated.",
    details: {},
    data_references: [],
  });

  // FA2: Disposed assets without disposal price
  const badDisposals = (snapshot.assets || []).filter((a: any) =>
    a.status === "disposed" && (a.disposal_price === null || a.disposal_price === undefined)
  );
  checks.push({
    module: "fixed_assets", check_code: "FA2", check_name: "Disposed Assets Without Disposal Value",
    severity: badDisposals.length > 0 ? "warning" : "info",
    status: badDisposals.length === 0 ? "pass" : "fail",
    affected_count: badDisposals.length,
    affected_amount: badDisposals.reduce((s: number, a: any) => s + Number(a.purchase_price || 0), 0),
    recommendation: "Record disposal price for all disposed assets for gain/loss computation.",
    details: {},
    data_references: [],
  });

  // ─── Data Integrity ────────────────────────────────────────────────
  // DI1: Unbalanced journal entries
  const entryBalances: Record<string, { debit: number; credit: number }> = {};
  (snapshot.journalLines || []).forEach((l: any) => {
    const entryId = l.journal_entry_id || l.entry_id;
    if (!entryId) return;
    if (!entryBalances[entryId]) entryBalances[entryId] = { debit: 0, credit: 0 };
    entryBalances[entryId].debit += Number(l.debit || 0);
    entryBalances[entryId].credit += Number(l.credit || 0);
  });
  const unbalanced = Object.entries(entryBalances).filter(
    ([_, v]) => Math.abs(v.debit - v.credit) > 0.01
  );
  checks.push({
    module: "data_integrity", check_code: "DI1", check_name: "Unbalanced Journal Entries",
    severity: unbalanced.length > 0 ? "critical" : "info",
    status: unbalanced.length === 0 ? "pass" : "fail",
    affected_count: unbalanced.length,
    affected_amount: unbalanced.reduce((s, [_, v]) => s + Math.abs(v.debit - v.credit), 0),
    recommendation: "All journal entries must balance. Fix immediately.",
    details: {},
    data_references: [],
  });

  return { checks, summary: { total: checks.length, pass: checks.filter(c => c.status === "pass").length, fail: checks.filter(c => c.status === "fail").length } };
}

// ═══════════════════════════════════════════════════════════════════════════
// IFC CHECKS
// ═══════════════════════════════════════════════════════════════════════════

function runIFCChecks(snapshot: any) {
  const assessments: any[] = [];

  // IFC1: Manual journal entries ratio
  const manualEntries = (snapshot.journalEntries || []).filter((e: any) => e.is_manual === true);
  const manualRatio = snapshot.journalEntries.length > 0
    ? (manualEntries.length / snapshot.journalEntries.length * 100)
    : 0;
  assessments.push({
    check_type: "segregation",
    check_name: "Manual Journal Entry Ratio",
    severity: manualRatio > 30 ? "critical" : manualRatio > 15 ? "warning" : "info",
    status: manualRatio > 30 ? "fail" : manualRatio > 15 ? "warning" : "pass",
    affected_count: manualEntries.length,
    recommendation: manualRatio > 15 ? "Reduce manual journal entries. Automate posting from source documents." : null,
    details: { manual_count: manualEntries.length, total: snapshot.journalEntries.length, ratio_pct: manualRatio.toFixed(1) },
  });

  // IFC2: Entries without approval
  const unapproved = (snapshot.journalEntries || []).filter((e: any) => !e.approved_by && e.status === "posted");
  assessments.push({
    check_type: "maker_checker",
    check_name: "Posted Entries Without Approval",
    severity: unapproved.length > 0 ? "critical" : "info",
    status: unapproved.length === 0 ? "pass" : "fail",
    affected_count: unapproved.length,
    recommendation: unapproved.length > 0 ? "Enforce maker-checker. No journal entry should post without approval." : null,
    details: { unapproved_count: unapproved.length },
  });

  // IFC3: Year-end entry concentration (March entries)
  const marchEntries = (snapshot.journalEntries || []).filter((e: any) => {
    const d = new Date(e.entry_date);
    return d.getMonth() === 2; // March
  });
  const marchPct = snapshot.journalEntries.length > 0
    ? (marchEntries.length / snapshot.journalEntries.length * 100) : 0;
  assessments.push({
    check_type: "period_controls",
    check_name: "March Entry Concentration",
    severity: marchPct > 25 ? "warning" : "info",
    status: marchPct > 25 ? "warning" : "pass",
    affected_count: marchEntries.length,
    recommendation: marchPct > 25 ? "High concentration of year-end entries suggests window dressing risk." : null,
    details: { march_count: marchEntries.length, pct: marchPct.toFixed(1) },
  });

  // IFC4: Admin overrides in audit log
  const overrides = (snapshot.auditLogs || []).filter((l: any) =>
    l.action?.toLowerCase().includes("override") || l.action?.toLowerCase().includes("unlock")
  );
  assessments.push({
    check_type: "override_controls",
    check_name: "Admin Override Activity",
    severity: overrides.length > 5 ? "warning" : "info",
    status: overrides.length > 5 ? "warning" : "pass",
    affected_count: overrides.length,
    recommendation: overrides.length > 5 ? "Review all admin overrides for justification." : null,
    details: { override_count: overrides.length },
  });

  // IFC5: Backdated entries
  const backdated = (snapshot.journalEntries || []).filter((e: any) => {
    if (!e.created_at || !e.entry_date) return false;
    const created = new Date(e.created_at);
    const entryDate = new Date(e.entry_date);
    const diffDays = (created.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 30;
  });
  assessments.push({
    check_type: "period_controls",
    check_name: "Backdated Journal Entries (>30 days)",
    severity: backdated.length > 0 ? "warning" : "info",
    status: backdated.length === 0 ? "pass" : "warning",
    affected_count: backdated.length,
    recommendation: backdated.length > 0 ? "Investigate backdated entries for potential manipulation." : null,
    details: { backdated_count: backdated.length },
  });

  return { assessments };
}

// ═══════════════════════════════════════════════════════════════════════════
// AI ENGINE – Anomaly, Themes, Sampling, Narratives
// ═══════════════════════════════════════════════════════════════════════════

async function callAIEngine(apiKey: string, snapshot: any, compliance: any, ifc: any, fy: string) {
  const revenueAccounts = (snapshot.glAccounts || []).filter((a: any) => a.account_type === "revenue");
  const expenseAccounts = (snapshot.glAccounts || []).filter((a: any) => a.account_type === "expense");
  const revenueIds = new Set(revenueAccounts.map((a: any) => a.id));
  const expenseIds = new Set(expenseAccounts.map((a: any) => a.id));

  let totalRevenue = 0, totalExpenses = 0;
  (snapshot.journalLines || []).forEach((l: any) => {
    if (revenueIds.has(l.gl_account_id)) totalRevenue += Number(l.credit || 0);
    if (expenseIds.has(l.gl_account_id)) totalExpenses += Number(l.debit || 0);
  });

  // Summarize by month for AI
  const monthlyRevenue: Record<string, number> = {};
  const monthlyExpenses: Record<string, number> = {};
  (snapshot.journalLines || []).forEach((l: any) => {
    const month = l.journal_entries?.entry_date?.substring(0, 7);
    if (!month) return;
    if (revenueIds.has(l.gl_account_id)) {
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + Number(l.credit || 0);
    }
    if (expenseIds.has(l.gl_account_id)) {
      monthlyExpenses[month] = (monthlyExpenses[month] || 0) + Number(l.debit || 0);
    }
  });

  // Vendor concentration
  const vendorSpend: Record<string, number> = {};
  (snapshot.bills || []).forEach((b: any) => {
    const name = b.vendor_name || "Unknown";
    vendorSpend[name] = (vendorSpend[name] || 0) + Number(b.total_amount || 0);
  });
  const sortedVendors = Object.entries(vendorSpend).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const totalBillValue = Object.values(vendorSpend).reduce((s, v) => s + v, 0);

  // Manual entries by month
  const manualByMonth: Record<string, number> = {};
  (snapshot.journalEntries || []).filter((e: any) => e.is_manual).forEach((e: any) => {
    const m = e.entry_date?.substring(0, 7);
    if (m) manualByMonth[m] = (manualByMonth[m] || 0) + 1;
  });

  // Round figure count
  const roundFigures = (snapshot.journalLines || []).filter((l: any) => {
    const amt = Number(l.debit || l.credit || 0);
    return amt > 10000 && amt % 1000 === 0;
  }).length;

  const dataSummary = {
    financial_year: fy,
    total_revenue: totalRevenue,
    total_expenses: totalExpenses,
    net_income: totalRevenue - totalExpenses,
    monthly_revenue: monthlyRevenue,
    monthly_expenses: monthlyExpenses,
    total_journal_entries: snapshot.journalEntries.length,
    manual_entries_count: (snapshot.journalEntries || []).filter((e: any) => e.is_manual).length,
    manual_by_month: manualByMonth,
    round_figure_entries: roundFigures,
    vendor_concentration: { top_vendors: sortedVendors, total_spend: totalBillValue },
    total_invoices: snapshot.invoices.length,
    total_bills: snapshot.bills.length,
    total_assets: snapshot.assets.length,
    compliance_checks_summary: compliance.summary,
    ifc_checks_count: ifc.assessments.length,
    ifc_failures: ifc.assessments.filter((a: any) => a.status === "fail").length,
    overdue_invoices: snapshot.invoices.filter((i: any) => i.status !== "paid" && new Date(i.due_date) < new Date()).length,
    bank_transactions_count: snapshot.bankTransactions.length,
  };

  const systemPrompt = `You are an Indian Chartered Accountant AI Auditor performing a statutory audit risk analysis for FY ${fy}.

CRITICAL RULES:
- You MUST be explainable. Every flag includes: trigger condition, data reference, % deviation, historical comparison, confidence score.
- No black-box scoring. Every risk score has a deterministic explanation.
- Use Indian CA/audit terminology (Companies Act 2013, CARO 2020, SA standards).
- All ₹ values in Indian numbering system.
- Be specific with numbers. Never say "significant" without a number.

You will output structured data using the tool provided.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze this organization's financial data for FY ${fy} and generate audit intelligence:\n\n${JSON.stringify(dataSummary, null, 2)}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "generate_audit_intelligence",
          description: "Generate complete audit intelligence output including anomalies, risk themes, sampling, and narratives.",
          parameters: {
            type: "object",
            properties: {
              anomalies: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    anomaly_type: { type: "string", enum: ["revenue_clustering", "round_figure", "manual_journal_spike", "odd_hour_posting", "negative_cash", "vendor_concentration", "expense_volatility", "reversal_pattern", "year_end_spike", "other"] },
                    risk_score: { type: "number", description: "0-100" },
                    trigger_condition: { type: "string", description: "Why this was flagged - deterministic explanation" },
                    deviation_pct: { type: "number", description: "% deviation from expected or historical" },
                    current_value: { type: "number" },
                    last_year_value: { type: "number" },
                    confidence_score: { type: "number", description: "0-100" },
                    suggested_audit_action: { type: "string" },
                  },
                  required: ["anomaly_type", "risk_score", "trigger_condition", "confidence_score", "suggested_audit_action"],
                  additionalProperties: false,
                },
              },
              risk_themes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    theme_name: { type: "string" },
                    risk_score: { type: "number" },
                    confidence_score: { type: "number" },
                    impact_area: { type: "string" },
                    impacted_value: { type: "number" },
                    transaction_count: { type: "number" },
                    explanation: { type: "string" },
                    suggested_action: { type: "string" },
                    contributing_flags: { type: "array", items: { type: "string" } },
                  },
                  required: ["theme_name", "risk_score", "confidence_score", "impact_area", "explanation", "suggested_action"],
                  additionalProperties: false,
                },
              },
              samples: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    sample_type: { type: "string", enum: ["high_risk", "stratified", "random"] },
                    sample_name: { type: "string" },
                    entity_type: { type: "string" },
                    entity_id: { type: "string" },
                    entity_reference: { type: "string" },
                    risk_weight: { type: "number" },
                    reason_selected: { type: "string" },
                    amount: { type: "number" },
                  },
                  required: ["sample_type", "sample_name", "entity_type", "entity_id", "reason_selected", "risk_weight"],
                  additionalProperties: false,
                },
              },
              narratives: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    narrative_type: { type: "string", enum: ["executive_summary", "gst_risk", "tds_risk", "revenue_pattern", "internal_controls", "suggested_procedures"] },
                    content: { type: "string", description: "Rich markdown narrative with bullet points, ₹ values, and % references" },
                    data_points: { type: "array", items: { type: "string" } },
                  },
                  required: ["narrative_type", "content"],
                  additionalProperties: false,
                },
              },
              risk_breakdown: {
                type: "object",
                properties: {
                  revenue_pattern: { type: "number", description: "0-20" },
                  cash_manipulation: { type: "number", description: "0-15" },
                  gst: { type: "number", description: "0-15" },
                  tds: { type: "number", description: "0-15" },
                  journal: { type: "number", description: "0-15" },
                  control_override: { type: "number", description: "0-10" },
                  vendor_concentration: { type: "number", description: "0-10" },
                },
                required: ["revenue_pattern", "cash_manipulation", "gst", "tds", "journal", "control_override", "vendor_concentration"],
                additionalProperties: false,
              },
            },
            required: ["anomalies", "risk_themes", "samples", "narratives", "risk_breakdown"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "generate_audit_intelligence" } },
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const text = await response.text();
    console.error("AI gateway error:", status, text);
    if (status === 429) throw new Error("AI rate limit exceeded. Try again later.");
    if (status === 402) throw new Error("AI credits exhausted. Please top up.");
    throw new Error(`AI gateway error: ${status}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No tool call in AI response");

  return JSON.parse(toolCall.function.arguments);
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════════════════════════

function computeComplianceScore(compliance: any, ifc: any, _snapshot: any) {
  const checks = compliance.checks;
  const getModuleScore = (module: string, maxScore: number) => {
    const moduleChecks = checks.filter((c: any) => c.module === module);
    if (moduleChecks.length === 0) return maxScore;
    const passRate = moduleChecks.filter((c: any) => c.status === "pass").length / moduleChecks.length;
    return Math.round(passRate * maxScore);
  };

  const gst = getModuleScore("gst", 25);
  const tds = getModuleScore("tds", 20);
  const income_tax = getModuleScore("income_tax", 20);
  const data_integrity = getModuleScore("data_integrity", 15);

  // IFC score
  const ifcChecks = ifc.assessments;
  const ifcPassRate = ifcChecks.length > 0
    ? ifcChecks.filter((a: any) => a.status === "pass").length / ifcChecks.length
    : 1;
  const ifcScore = Math.round(ifcPassRate * 20);

  const total = gst + tds + income_tax + ifcScore + data_integrity;

  return {
    total,
    breakdown: { gst, tds, income_tax, ifc: ifcScore, data_integrity },
  };
}

function computeRiskIndex(aiResults: any) {
  const rb = aiResults.risk_breakdown || {};
  const total = (rb.revenue_pattern || 0) + (rb.cash_manipulation || 0) + (rb.gst || 0) +
    (rb.tds || 0) + (rb.journal || 0) + (rb.control_override || 0) + (rb.vendor_concentration || 0);

  return { total: Math.min(100, total), breakdown: rb };
}

function computeIFCRating(ifc: any) {
  const assessments = ifc.assessments;
  if (assessments.length === 0) return "Strong";
  const failCount = assessments.filter((a: any) => a.status === "fail").length;
  const warningCount = assessments.filter((a: any) => a.status === "warning").length;
  if (failCount >= 2) return "Weak";
  if (failCount >= 1 || warningCount >= 3) return "Moderate";
  return "Strong";
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDITOR PACK GENERATION
// ═══════════════════════════════════════════════════════════════════════════

async function generateAuditorPack(
  supabase: any, orgId: string, userId: string,
  financialYear: string, runId: string | null,
) {
  // Gather comprehensive data
  const snapshot = await gatherAuditData(supabase, orgId, financialYear);

  // Gather audit results if run exists
  let auditResults: any = null;
  if (runId) {
    const [checks, themes, anomalies, samples, narratives, ifc] = await Promise.all([
      supabase.from("audit_compliance_checks").select("*").eq("run_id", runId),
      supabase.from("audit_risk_themes").select("*").eq("run_id", runId),
      supabase.from("audit_ai_anomalies").select("*").eq("run_id", runId),
      supabase.from("audit_ai_samples").select("*").eq("run_id", runId),
      supabase.from("audit_ai_narratives").select("*").eq("run_id", runId),
      supabase.from("audit_ifc_assessments").select("*").eq("run_id", runId),
    ]);
    auditResults = {
      checks: checks.data || [],
      themes: themes.data || [],
      anomalies: anomalies.data || [],
      samples: samples.data || [],
      narratives: narratives.data || [],
      ifc: ifc.data || [],
    };
  }

  // Build sections as JSON (frontend will handle CSV/PDF conversion)
  const pack = {
    metadata: {
      organization_id: orgId,
      financial_year: financialYear,
      generated_at: new Date().toISOString(),
      generated_by: userId,
    },
    sections: {
      "01_Financials": {
        gl_accounts: snapshot.glAccounts,
        journal_entries_count: snapshot.journalEntries.length,
        total_invoices: snapshot.invoices.length,
        total_bills: snapshot.bills.length,
      },
      "02_Ledgers": {
        journal_lines_count: snapshot.journalLines.length,
      },
      "03_GST": {
        invoices: snapshot.invoices.map((i: any) => ({
          invoice_number: i.invoice_number, client_name: i.client_name,
          amount: i.amount, tax_amount: i.tax_amount, total_amount: i.total_amount,
          status: i.status, date: i.invoice_date || i.created_at,
        })),
        gst_checks: auditResults?.checks.filter((c: any) => c.module === "gst") || [],
      },
      "04_TDS": {
        tds_checks: auditResults?.checks.filter((c: any) => c.module === "tds") || [],
        high_value_vendors: snapshot.vendors.slice(0, 20),
      },
      "05_FixedAssets": {
        assets: snapshot.assets.map((a: any) => ({
          name: a.name, asset_tag: a.asset_tag, category: a.category,
          purchase_price: a.purchase_price, accumulated_depreciation: a.accumulated_depreciation,
          current_book_value: a.current_book_value, status: a.status,
          depreciation_method: a.depreciation_method,
        })),
        asset_checks: auditResults?.checks.filter((c: any) => c.module === "fixed_assets") || [],
      },
      "06_IFC": { assessments: auditResults?.ifc || [] },
      "07_ComplianceReports": { all_checks: auditResults?.checks || [] },
      "08_AuditLogs": {
        recent_logs: snapshot.auditLogs.slice(0, 200).map((l: any) => ({
          action: l.action, entity_type: l.entity_type, actor_name: l.actor_name,
          created_at: l.created_at,
        })),
      },
      "09_AI_RiskInsights": {
        risk_themes: auditResults?.themes || [],
        anomalies: auditResults?.anomalies || [],
        samples: auditResults?.samples || [],
        narratives: auditResults?.narratives || [],
      },
    },
  };

  // Log export
  await supabase.from("audit_pack_exports").insert({
    organization_id: orgId,
    financial_year: financialYear,
    exported_by: userId,
    run_id: runId,
    export_type: "json",
    status: "completed",
    sections_included: Object.keys(pack.sections),
  });

  return new Response(JSON.stringify(pack), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PRE-AUDIT SIMULATION
// ═══════════════════════════════════════════════════════════════════════════

async function runPreAuditSimulation(
  supabase: any, orgId: string, userId: string,
  financialYear: string, apiKey: string,
) {
  // Similar to full audit but stored as "simulation" run type
  const { data: run, error: runErr } = await supabase
    .from("audit_compliance_runs")
    .insert({
      organization_id: orgId,
      financial_year: financialYear,
      run_by: userId,
      run_type: "simulation",
      status: "running",
    })
    .select("*")
    .single();

  if (runErr) throw new Error(`Failed to create simulation run: ${runErr.message}`);

  try {
    const snapshot = await gatherAuditData(supabase, orgId, financialYear);
    const complianceResults = runDeterministicChecks(snapshot);
    const ifcResults = runIFCChecks(snapshot);

    // Insert checks
    if (complianceResults.checks.length > 0) {
      await supabase.from("audit_compliance_checks").insert(
        complianceResults.checks.map((c: any) => ({ ...c, run_id: run.id, organization_id: orgId }))
      );
    }
    if (ifcResults.assessments.length > 0) {
      await supabase.from("audit_ifc_assessments").insert(
        ifcResults.assessments.map((a: any) => ({ ...a, run_id: run.id, organization_id: orgId }))
      );
    }

    const complianceScore = computeComplianceScore(complianceResults, ifcResults, snapshot);
    const ifcRating = computeIFCRating(ifcResults);

    await supabase.from("audit_compliance_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        compliance_score: complianceScore.total,
        ifc_rating: ifcRating,
        score_breakdown: complianceScore.breakdown,
        risk_breakdown: {},
      })
      .eq("id", run.id);

    return new Response(JSON.stringify({
      success: true,
      run_id: run.id,
      run_type: "simulation",
      compliance_score: complianceScore.total,
      ifc_rating: ifcRating,
      checks_count: complianceResults.checks.length,
      ifc_count: ifcResults.assessments.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (innerErr) {
    await supabase.from("audit_compliance_runs").update({ status: "failed" }).eq("id", run.id);
    throw innerErr;
  }
}
