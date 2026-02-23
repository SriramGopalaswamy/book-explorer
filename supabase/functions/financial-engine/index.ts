import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { organization_id, engine } = await req.json();

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, unknown> = {};

    // Determine which engines to run
    const engines = engine ? [engine] : [
      "cash_guardian",
      "margin_monitor",
      "compliance_shield",
      "customer_risk",
      "vendor_risk",
      "snapshot",
    ];

    // === CASH GUARDIAN ENGINE ===
    if (engines.includes("cash_guardian")) {
      const cashResult = await runCashGuardian(supabase, organization_id);
      results.cash_guardian = cashResult;
    }

    // === MARGIN DRIFT MONITOR ===
    if (engines.includes("margin_monitor")) {
      const marginResult = await runMarginMonitor(supabase, organization_id);
      results.margin_monitor = marginResult;
    }

    // === COMPLIANCE SHIELD ===
    if (engines.includes("compliance_shield")) {
      const complianceResult = await runComplianceShield(supabase, organization_id);
      results.compliance_shield = complianceResult;
    }

    // === CUSTOMER RISK SCORING ===
    if (engines.includes("customer_risk")) {
      const customerResult = await runCustomerRiskScoring(supabase, organization_id);
      results.customer_risk = customerResult;
    }

    // === VENDOR RISK SCORING ===
    if (engines.includes("vendor_risk")) {
      const vendorResult = await runVendorRiskScoring(supabase, organization_id);
      results.vendor_risk = vendorResult;
    }

    // === SNAPSHOT + COMPOSITE RISK ===
    if (engines.includes("snapshot")) {
      const snapshotResult = await runFinancialSnapshot(supabase, organization_id);
      results.snapshot = snapshotResult;
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("financial-engine error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Cash Guardian Engine ───────────────────────────────────────────
async function runCashGuardian(supabase: any, orgId: string) {
  // Get bank account balances
  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("balance")
    .eq("organization_id", orgId)
    .eq("status", "Active");

  const cashPosition = (accounts || []).reduce(
    (sum: number, a: any) => sum + Number(a.balance || 0),
    0
  );

  // Get last 30 days expenses
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: expenses } = await supabase
    .from("expenses")
    .select("amount")
    .eq("organization_id", orgId)
    .gte("expense_date", thirtyDaysAgo.toISOString().split("T")[0]);

  const expenses30d = (expenses || []).reduce(
    (sum: number, e: any) => sum + Number(e.amount || 0),
    0
  );

  const burnRateDaily = expenses30d / 30;
  const runwayDays = burnRateDaily > 0 ? Math.floor(cashPosition / burnRateDaily) : 999;

  // Generate alerts
  const alerts = [];
  if (runwayDays < 30) {
    alerts.push({
      organization_id: orgId,
      alert_type: "cash_low",
      severity: runwayDays < 14 ? "critical" : "high",
      title: `Cash runway is ${runwayDays} days`,
      description: `At current burn rate of ${burnRateDaily.toFixed(0)}/day, cash reserves will be depleted in ${runwayDays} days.`,
      amount: cashPosition,
    });
  }
  if (burnRateDaily > 0 && expenses30d > 0) {
    // Check for expense spike (compare to previous 30 days)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const { data: prevExpenses } = await supabase
      .from("expenses")
      .select("amount")
      .eq("organization_id", orgId)
      .gte("expense_date", sixtyDaysAgo.toISOString().split("T")[0])
      .lt("expense_date", thirtyDaysAgo.toISOString().split("T")[0]);

    const prevExpenses30d = (prevExpenses || []).reduce(
      (sum: number, e: any) => sum + Number(e.amount || 0),
      0
    );

    if (prevExpenses30d > 0 && expenses30d > prevExpenses30d * 1.3) {
      alerts.push({
        organization_id: orgId,
        alert_type: "expense_spike",
        severity: "medium",
        title: "Expense spike detected",
        description: `Expenses increased ${(((expenses30d - prevExpenses30d) / prevExpenses30d) * 100).toFixed(0)}% vs previous 30 days.`,
        amount: expenses30d - prevExpenses30d,
      });
    }
  }

  // Upsert alerts
  for (const alert of alerts) {
    await supabase.from("ai_alerts").insert(alert);
  }

  return { cashPosition, burnRateDaily, runwayDays, alertsGenerated: alerts.length };
}

// ─── Margin Drift Monitor ───────────────────────────────────────────
async function runMarginMonitor(supabase: any, orgId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const today = new Date().toISOString().split("T")[0];

  // Revenue from invoices
  const { data: invoices } = await supabase
    .from("invoices")
    .select("total_amount")
    .eq("organization_id", orgId)
    .gte("invoice_date", thirtyDaysAgo.toISOString().split("T")[0])
    .in("status", ["sent", "paid", "overdue"]);

  const revenue30d = (invoices || []).reduce(
    (sum: number, i: any) => sum + Number(i.total_amount || 0),
    0
  );

  // Expenses
  const { data: expenses } = await supabase
    .from("expenses")
    .select("amount")
    .eq("organization_id", orgId)
    .gte("expense_date", thirtyDaysAgo.toISOString().split("T")[0]);

  const expenses30d = (expenses || []).reduce(
    (sum: number, e: any) => sum + Number(e.amount || 0),
    0
  );

  const netMarginPct = revenue30d > 0 ? ((revenue30d - expenses30d) / revenue30d) * 100 : 0;

  // Check for revenue drop
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const { data: prevInvoices } = await supabase
    .from("invoices")
    .select("total_amount")
    .eq("organization_id", orgId)
    .gte("invoice_date", sixtyDaysAgo.toISOString().split("T")[0])
    .lt("invoice_date", thirtyDaysAgo.toISOString().split("T")[0])
    .in("status", ["sent", "paid", "overdue"]);

  const prevRevenue = (prevInvoices || []).reduce(
    (sum: number, i: any) => sum + Number(i.total_amount || 0),
    0
  );

  const alerts = [];
  if (prevRevenue > 0 && revenue30d < prevRevenue * 0.8) {
    alerts.push({
      organization_id: orgId,
      alert_type: "revenue_drop",
      severity: "high",
      title: "Revenue decline detected",
      description: `Revenue dropped ${(((prevRevenue - revenue30d) / prevRevenue) * 100).toFixed(0)}% vs previous period.`,
      amount: prevRevenue - revenue30d,
    });
  }

  if (netMarginPct < 10 && revenue30d > 0) {
    alerts.push({
      organization_id: orgId,
      alert_type: "margin_drift",
      severity: netMarginPct < 0 ? "critical" : "medium",
      title: `Net margin at ${netMarginPct.toFixed(1)}%`,
      description: `Operating margin is ${netMarginPct < 0 ? "negative" : "below healthy threshold"}.`,
      amount: revenue30d - expenses30d,
    });
  }

  for (const alert of alerts) {
    await supabase.from("ai_alerts").insert(alert);
  }

  return { revenue30d, expenses30d, netMarginPct, alertsGenerated: alerts.length };
}

// ─── Compliance Shield ──────────────────────────────────────────────
async function runComplianceShield(supabase: any, orgId: string) {
  // Check overdue payables
  const today = new Date().toISOString().split("T")[0];
  const { data: overdueBills } = await supabase
    .from("bills")
    .select("id, vendor_name, total_amount, due_date")
    .eq("organization_id", orgId)
    .lt("due_date", today)
    .in("status", ["pending", "approved"]);

  const alerts = [];
  const overdueCount = (overdueBills || []).length;
  const overdueTotal = (overdueBills || []).reduce(
    (sum: number, b: any) => sum + Number(b.total_amount || 0),
    0
  );

  if (overdueCount > 0) {
    alerts.push({
      organization_id: orgId,
      alert_type: "overdue_payable",
      severity: overdueCount > 5 ? "high" : "medium",
      title: `${overdueCount} overdue payable(s)`,
      description: `Total overdue payables: ${overdueTotal.toFixed(2)}`,
      amount: overdueTotal,
    });
  }

  // Check overdue receivables
  const { data: overdueInvoices } = await supabase
    .from("invoices")
    .select("id, client_name, total_amount, due_date")
    .eq("organization_id", orgId)
    .lt("due_date", today)
    .in("status", ["sent", "overdue"]);

  const overdueRecCount = (overdueInvoices || []).length;
  const overdueRecTotal = (overdueInvoices || []).reduce(
    (sum: number, i: any) => sum + Number(i.total_amount || 0),
    0
  );

  if (overdueRecCount > 0) {
    alerts.push({
      organization_id: orgId,
      alert_type: "overdue_receivable",
      severity: overdueRecCount > 5 ? "high" : "medium",
      title: `${overdueRecCount} overdue receivable(s)`,
      description: `Total overdue receivables: ${overdueRecTotal.toFixed(2)}`,
      amount: overdueRecTotal,
    });
  }

  // Check statutory filing compliance
  const { data: filings } = await supabase
    .from("statutory_filings")
    .select("id, filing_type, due_date, status")
    .eq("organization_id", orgId)
    .lt("due_date", today)
    .neq("status", "filed");

  if ((filings || []).length > 0) {
    alerts.push({
      organization_id: orgId,
      alert_type: "compliance_risk",
      severity: "high",
      title: `${filings.length} overdue statutory filing(s)`,
      description: `Overdue filings may result in penalties.`,
    });
  }

  for (const alert of alerts) {
    await supabase.from("ai_alerts").insert(alert);
  }

  return { overdueBills: overdueCount, overdueInvoices: overdueRecCount, alertsGenerated: alerts.length };
}

// ─── Customer Risk Scoring ──────────────────────────────────────────
async function runCustomerRiskScoring(supabase: any, orgId: string) {
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("status", "active");

  let scored = 0;
  const today = new Date().toISOString().split("T")[0];

  for (const customer of customers || []) {
    // Get all invoices for this customer
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, total_amount, status, due_date, invoice_date")
      .eq("organization_id", orgId)
      .eq("customer_id", customer.id);

    const allInvoices = invoices || [];
    const lifetimeValue = allInvoices.reduce(
      (sum: number, i: any) => sum + Number(i.total_amount || 0),
      0
    );
    const overdueInvoices = allInvoices.filter(
      (i: any) => (i.status === "sent" || i.status === "overdue") && i.due_date < today
    );
    const overdueAmount = overdueInvoices.reduce(
      (sum: number, i: any) => sum + Number(i.total_amount || 0),
      0
    );
    const paidInvoices = allInvoices.filter((i: any) => i.status === "paid");

    // Simple risk score: 0 (safe) to 100 (risky)
    let riskScore = 0;
    if (allInvoices.length > 0) {
      const overdueRatio = overdueInvoices.length / allInvoices.length;
      riskScore = Math.min(100, overdueRatio * 80 + (overdueAmount > 100000 ? 20 : overdueAmount > 50000 ? 10 : 0));
    }

    const trend = overdueInvoices.length > 2 ? "declining" : overdueInvoices.length === 0 ? "improving" : "stable";

    await supabase.from("ai_customer_profiles").upsert(
      {
        organization_id: orgId,
        customer_id: customer.id,
        risk_score: Math.round(riskScore * 100) / 100,
        lifetime_value: lifetimeValue,
        overdue_invoices_count: overdueInvoices.length,
        overdue_amount: overdueAmount,
        trend,
      },
      { onConflict: "organization_id,customer_id" }
    );

    if (riskScore > 60) {
      await supabase.from("ai_alerts").insert({
        organization_id: orgId,
        alert_type: "customer_risk",
        severity: riskScore > 80 ? "high" : "medium",
        title: `High-risk customer: ${customer.name}`,
        description: `Risk score ${riskScore.toFixed(0)}/100. ${overdueInvoices.length} overdue invoices totaling ${overdueAmount.toFixed(2)}.`,
        entity_type: "customer",
        entity_id: customer.id,
        amount: overdueAmount,
      });
    }

    scored++;
  }

  return { customersScored: scored };
}

// ─── Vendor Risk Scoring ────────────────────────────────────────────
async function runVendorRiskScoring(supabase: any, orgId: string) {
  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("status", "active");

  let scored = 0;
  const today = new Date().toISOString().split("T")[0];

  for (const vendor of vendors || []) {
    const { data: bills } = await supabase
      .from("bills")
      .select("id, total_amount, status, due_date, bill_date")
      .eq("organization_id", orgId)
      .eq("vendor_id", vendor.id);

    const allBills = bills || [];
    const totalSpend = allBills.reduce(
      (sum: number, b: any) => sum + Number(b.total_amount || 0),
      0
    );
    const overdueBills = allBills.filter(
      (b: any) => (b.status === "pending" || b.status === "approved") && b.due_date && b.due_date < today
    );

    let reliabilityScore = 100;
    if (allBills.length > 0) {
      const overdueRatio = overdueBills.length / allBills.length;
      reliabilityScore = Math.max(0, 100 - overdueRatio * 60);
    }

    const lastBill = allBills.sort((a: any, b: any) => (b.bill_date > a.bill_date ? 1 : -1))[0];

    await supabase.from("ai_vendor_profiles").upsert(
      {
        organization_id: orgId,
        vendor_id: vendor.id,
        reliability_score: Math.round(reliabilityScore * 100) / 100,
        total_spend: totalSpend,
        dispute_count: 0,
        last_bill_date: lastBill?.bill_date || null,
        trend: overdueBills.length > 2 ? "declining" : "stable",
      },
      { onConflict: "organization_id,vendor_id" }
    );

    scored++;
  }

  return { vendorsScored: scored };
}

// ─── Financial Snapshot + Composite Risk ────────────────────────────
async function runFinancialSnapshot(supabase: any, orgId: string) {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Cash
  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("balance")
    .eq("organization_id", orgId)
    .eq("status", "Active");
  const cashPosition = (accounts || []).reduce((s: number, a: any) => s + Number(a.balance || 0), 0);

  // Revenue & expenses
  const { data: invoices } = await supabase
    .from("invoices")
    .select("total_amount")
    .eq("organization_id", orgId)
    .gte("invoice_date", thirtyDaysAgo.toISOString().split("T")[0])
    .in("status", ["sent", "paid", "overdue"]);
  const revenue30d = (invoices || []).reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);

  const { data: expenses } = await supabase
    .from("expenses")
    .select("amount")
    .eq("organization_id", orgId)
    .gte("expense_date", thirtyDaysAgo.toISOString().split("T")[0]);
  const expenses30d = (expenses || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  const burnRateDaily = expenses30d / 30;
  const runwayDays = burnRateDaily > 0 ? Math.floor(cashPosition / burnRateDaily) : 999;
  const netMarginPct = revenue30d > 0 ? ((revenue30d - expenses30d) / revenue30d) * 100 : 0;

  // Receivables
  const { data: allInvoices } = await supabase
    .from("invoices")
    .select("total_amount, status, due_date")
    .eq("organization_id", orgId)
    .in("status", ["sent", "overdue"]);
  const receivablesTotal = (allInvoices || []).reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
  const receivablesOverdue = (allInvoices || [])
    .filter((i: any) => i.due_date < today)
    .reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);

  // Payables
  const { data: allBills } = await supabase
    .from("bills")
    .select("total_amount, status, due_date")
    .eq("organization_id", orgId)
    .in("status", ["pending", "approved"]);
  const payablesTotal = (allBills || []).reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0);
  const payablesOverdue = (allBills || [])
    .filter((b: any) => b.due_date && b.due_date < today)
    .reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0);

  // Health score: composite 0-100
  const cashScore = Math.min(100, runwayDays > 90 ? 100 : (runwayDays / 90) * 100);
  const marginScore = Math.min(100, Math.max(0, netMarginPct + 20) * 2);
  const recScore = receivablesTotal > 0 ? Math.max(0, 100 - (receivablesOverdue / receivablesTotal) * 100) : 100;
  const payScore = payablesTotal > 0 ? Math.max(0, 100 - (payablesOverdue / payablesTotal) * 100) : 100;
  const healthScore = (cashScore * 0.35 + marginScore * 0.25 + recScore * 0.2 + payScore * 0.2);

  // Delete existing then insert to avoid upsert issues
  await supabase.from("ai_financial_snapshots")
    .delete()
    .eq("organization_id", orgId)
    .eq("snapshot_date", today);

  const { error: snapErr } = await supabase.from("ai_financial_snapshots").insert({
    organization_id: orgId,
    snapshot_date: today,
    health_score: Math.round(healthScore * 100) / 100,
    cash_position: cashPosition,
    burn_rate_daily: Math.round(burnRateDaily * 100) / 100,
    runway_days: runwayDays,
    revenue_30d: revenue30d,
    expenses_30d: expenses30d,
    net_margin_pct: Math.round(netMarginPct * 100) / 100,
    receivables_total: receivablesTotal,
    receivables_overdue: receivablesOverdue,
    payables_total: payablesTotal,
    payables_overdue: payablesOverdue,
  });
  if (snapErr) console.error("snapshot insert error:", snapErr);

  // Composite risk scores
  const cashRisk = Math.max(0, 100 - cashScore);
  const receivablesRisk = receivablesTotal > 0 ? (receivablesOverdue / receivablesTotal) * 100 : 0;
  const marginRisk = Math.max(0, 50 - netMarginPct);
  const complianceRisk = payablesOverdue > 0 ? Math.min(100, (payablesOverdue / (payablesTotal || 1)) * 100) : 0;
  const overallRisk = (cashRisk * 0.3 + receivablesRisk * 0.25 + marginRisk * 0.25 + complianceRisk * 0.2);

  await supabase.from("ai_risk_scores")
    .delete()
    .eq("organization_id", orgId)
    .eq("score_date", today);

  const { error: riskErr } = await supabase.from("ai_risk_scores").insert({
    organization_id: orgId,
    score_date: today,
    cash_risk: Math.round(cashRisk * 100) / 100,
    receivables_risk: Math.round(receivablesRisk * 100) / 100,
    margin_risk: Math.round(marginRisk * 100) / 100,
    compliance_risk: Math.round(complianceRisk * 100) / 100,
    overall_risk: Math.round(overallRisk * 100) / 100,
  });
  if (riskErr) console.error("risk insert error:", riskErr);

  return { healthScore, cashPosition, runwayDays, revenue30d, expenses30d, overallRisk };
}
