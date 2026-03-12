import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service is not configured. Please contact support." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify JWT via getClaims (no DB call)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();

    const orgId = profile?.organization_id;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "Your account is not linked to an organization. Please contact support." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const messages: { role: string; content: string }[] = body.messages ?? [];

    if (!messages.length) {
      return new Response(JSON.stringify({ error: "No messages provided." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather live org data snapshot for context
    const snapshot = await gatherOrgSnapshot(supabase, orgId);
    const systemPrompt = buildSystemPrompt(snapshot);

    // Call Claude claude-opus-4-6 with streaming
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        stream: true,
        system: systemPrompt,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const errorText = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errorText);
      if (anthropicRes.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit — try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (anthropicRes.status === 401) {
        return new Response(JSON.stringify({ error: "AI service configuration error. Please contact support." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (anthropicRes.status >= 500) {
        return new Response(JSON.stringify({ error: "AI service is temporarily unavailable. Please try again later." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI service returned an unexpected error. Please try again." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Proxy the SSE stream directly
    return new Response(anthropicRes.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Org data snapshot ──────────────────────────────────────────────────────

async function gatherOrgSnapshot(supabase: any, orgId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];

  // GL accounts for revenue/expense classification
  const { data: glAccounts } = await supabase
    .from("gl_accounts")
    .select("id, code, name, account_type")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  const accounts = glAccounts || [];
  const revenueIds = new Set(accounts.filter((a: any) => a.account_type === "revenue").map((a: any) => a.id));
  const expenseIds = new Set(accounts.filter((a: any) => a.account_type === "expense").map((a: any) => a.id));

  // Current month journal lines
  const { data: currentLines } = await supabase
    .from("journal_lines")
    .select("debit, credit, gl_account_id, journal_entries!inner(entry_date, organization_id)")
    .eq("journal_entries.organization_id", orgId)
    .gte("journal_entries.entry_date", monthStart)
    .lte("journal_entries.entry_date", monthEnd);

  const { data: lastLines } = await supabase
    .from("journal_lines")
    .select("debit, credit, gl_account_id, journal_entries!inner(entry_date, organization_id)")
    .eq("journal_entries.organization_id", orgId)
    .gte("journal_entries.entry_date", lastMonthStart)
    .lte("journal_entries.entry_date", monthStart);

  const calcPeriod = (lines: any[]) => {
    let revenue = 0, expenses = 0;
    (lines || []).forEach((l: any) => {
      if (revenueIds.has(l.gl_account_id)) revenue += Number(l.credit || 0);
      if (expenseIds.has(l.gl_account_id)) expenses += Number(l.debit || 0);
    });
    return { revenue, expenses, net: revenue - expenses };
  };

  const thisMonth = calcPeriod(currentLines || []);
  const lastMonth = calcPeriod(lastLines || []);

  // Parallel data fetches
  const [invoicesRes, billsRes, employeesRes, leavesRes, goalsRes, payrollRes, itemsRes, poRes] =
    await Promise.all([
      supabase.from("invoices").select("status, total_amount, due_date, client_name")
        .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50),
      supabase.from("bills").select("status, total_amount, vendor_name, due_date")
        .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50),
      supabase.from("profiles").select("status, department, full_name")
        .eq("organization_id", orgId),
      supabase.from("leave_requests").select("status, leave_type, days")
        .eq("organization_id", orgId).gte("from_date", lastMonthStart),
      supabase.from("goals").select("title, status, progress, category")
        .eq("organization_id", orgId),
      supabase.from("payroll_records").select("net_pay, status, pay_period")
        .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(30),
      supabase.from("inventory_items").select("name, quantity_on_hand, reorder_level")
        .eq("organization_id", orgId).order("quantity_on_hand", { ascending: true }).limit(20),
      supabase.from("purchase_orders").select("status, total_amount, vendor_name")
        .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20),
    ]);

  const invoices = invoicesRes.data || [];
  const bills = billsRes.data || [];
  const employees = employeesRes.data || [];
  const leaves = leavesRes.data || [];
  const goals = goalsRes.data || [];
  const payroll = payrollRes.data || [];
  const items = itemsRes.data || [];
  const pos = poRes.data || [];

  const overdueInvoices = invoices.filter((i: any) => i.status !== "paid" && i.due_date && new Date(i.due_date) < now);
  const overdueBills = bills.filter((b: any) => b.status !== "paid" && b.due_date && new Date(b.due_date) < now);
  const activeEmployees = employees.filter((e: any) => e.status === "active");
  const pendingLeaves = leaves.filter((l: any) => l.status === "pending");
  const lowStockItems = items.filter((i: any) => i.quantity_on_hand <= (i.reorder_level ?? 0));
  const processedPayroll = payroll.filter((p: any) => p.status === "processed");

  return {
    as_of: now.toISOString(),
    financial: {
      this_month: thisMonth,
      last_month: lastMonth,
      profit_margin_pct: thisMonth.revenue > 0
        ? ((thisMonth.net / thisMonth.revenue) * 100).toFixed(1) + "%"
        : "N/A",
      revenue_change_pct: lastMonth.revenue > 0
        ? (((thisMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100).toFixed(1) + "%"
        : "N/A",
    },
    receivables: {
      total_invoices: invoices.length,
      overdue_count: overdueInvoices.length,
      overdue_amount: overdueInvoices.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0),
      top_overdue: overdueInvoices.slice(0, 5).map((i: any) => ({ client: i.client_name, amount: i.total_amount })),
    },
    payables: {
      total_bills: bills.length,
      overdue_count: overdueBills.length,
      overdue_amount: overdueBills.reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0),
    },
    hr: {
      active_employees: activeEmployees.length,
      total_headcount: employees.length,
      pending_leave_requests: pendingLeaves.length,
      departments: [...new Set(activeEmployees.map((e: any) => e.department).filter(Boolean))],
    },
    payroll: {
      monthly_burn: processedPayroll.reduce((s: number, p: any) => s + Number(p.net_pay || 0), 0),
      processed_count: processedPayroll.length,
      burn_to_revenue: thisMonth.revenue > 0
        ? ((processedPayroll.reduce((s: number, p: any) => s + Number(p.net_pay || 0), 0) / thisMonth.revenue) * 100).toFixed(1) + "%"
        : "N/A",
    },
    inventory: {
      items_tracked: items.length,
      low_stock_count: lowStockItems.length,
      low_stock_items: lowStockItems.slice(0, 5).map((i: any) => ({ name: i.name, qty: i.quantity_on_hand })),
    },
    procurement: {
      open_pos: pos.filter((p: any) => p.status === "draft" || p.status === "sent").length,
      total_po_value: pos.reduce((s: number, p: any) => s + Number(p.total_amount || 0), 0),
    },
    performance: {
      total_goals: goals.length,
      completed: goals.filter((g: any) => g.status === "completed").length,
      avg_progress: goals.length > 0
        ? Math.round(goals.reduce((s: number, g: any) => s + (g.progress || 0), 0) / goals.length)
        : 0,
      stale_goals: goals.filter((g: any) => (g.progress || 0) < 25 && g.status !== "completed").length,
    },
  };
}

// ── System prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(snapshot: Record<string, unknown>) {
  return `You are the AI business advisor for GRX10 Books — an ERP covering Finance, HRMS, Inventory, Procurement, and Performance.

CURRENT LIVE DATA SNAPSHOT (fetched this request):
${JSON.stringify(snapshot, null, 2)}

AVAILABLE MODULES (data present in snapshot above):
- Finance: revenue, expenses, profit/loss (this month & last month)
- Receivables: invoices, overdue amounts, top clients
- Payables: bills, overdue payables
- HR: employee headcount, departments, leave requests
- Payroll: monthly payroll burn, processed records
- Inventory: stock levels, low-stock items
- Procurement: purchase orders, open POs
- Performance: goals, completion rates

MODULES NOT AVAILABLE IN THIS ERP:
- Warehousing / Warehouse management (not a supported module — redirect to Inventory data if relevant)
- Manufacturing / Production (not supported)
- CRM / Customer management (not supported)
- Projects / Project management (not supported)
When asked about any unsupported module, clearly state it is not part of this ERP and offer the closest available alternative.

RULES:
- Answer questions using ONLY the data above. Never invent numbers.
- If a supported module has no data (empty arrays, zero counts), say the data hasn't been recorded yet and suggest where to add it.
- Be direct and concise. Lead with numbers.
- Use ₹ for Indian Rupee amounts. Format numbers with commas (e.g., ₹1,23,456).
- For follow-up analysis questions, use the data provided to calculate ratios, comparisons, and trends.
- When the data shows issues (overdue invoices, low stock, stale goals), proactively mention them.
- Keep responses concise: 2–5 sentences for simple questions, a short structured list for analysis.
- If the user asks how to navigate to a page, describe the sidebar section (e.g., "Go to Financial → Invoicing").
- Today's date: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`;
}
