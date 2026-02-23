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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create client with user's auth for RLS
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    // Get user's organization_id for explicit scoping
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.organization_id;
    if (!orgId) throw new Error("No organization found for user");

    const { mode, module, messages } = await req.json();

    // === CHAT MODE: streaming conversational AI ===
    if (mode === "chat") {
      const dataSnapshot = await gatherAllData(supabase, orgId);
      const systemPrompt = buildChatSystemPrompt(dataSnapshot);

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "system", content: systemPrompt }, ...(messages || [])],
          stream: true,
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", status, t);
        throw new Error(`AI gateway error: ${status}`);
      }

      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // === INSIGHTS MODE: structured dashboard/module commentary ===
    const dataSnapshot = await gatherAllData(supabase, orgId);
    const systemPrompt = buildInsightsSystemPrompt(module || "dashboard");
    const userPrompt = buildDataPrompt(dataSnapshot, module);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_insights",
              description: "Generate sharp business insights from data analysis",
              parameters: {
                type: "object",
                properties: {
                  headline: {
                    type: "string",
                    description: "A punchy, blunt 1-line headline (max 12 words). No fluff.",
                  },
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        severity: { type: "string", enum: ["critical", "warning", "opportunity", "positive"] },
                        title: { type: "string", description: "Bold statement, max 8 words" },
                        commentary: { type: "string", description: "Sharp, data-driven analysis. 2-3 sentences max. Include specific numbers." },
                        metric: { type: "string", description: "The key number or ratio driving this insight" },
                      },
                      required: ["severity", "title", "commentary", "metric"],
                      additionalProperties: false,
                    },
                  },
                  overall_grade: {
                    type: "string",
                    enum: ["A", "B", "C", "D", "F"],
                    description: "Letter grade for operational health",
                  },
                  one_liner: {
                    type: "string",
                    description: "A devastatingly honest 1-sentence summary. No corporate speak.",
                  },
                },
                required: ["headline", "insights", "overall_grade", "one_liner"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_insights" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const insights = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(insights), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-insights error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============== DATA GATHERING (GL-BASED, ORG-SCOPED) ==============

async function gatherAllData(supabase: any, orgId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];

  // 1. Get GL accounts for this org
  const { data: glAccounts } = await supabase
    .from("gl_accounts")
    .select("id, code, name, account_type, normal_balance")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  const accounts = glAccounts || [];
  const revenueIds = new Set(accounts.filter((a: any) => a.account_type === "revenue").map((a: any) => a.id));
  const expenseIds = new Set(accounts.filter((a: any) => a.account_type === "expense").map((a: any) => a.id));
  const cashId = accounts.find((a: any) => a.code === "1100")?.id;
  const arId = accounts.find((a: any) => a.code === "1200")?.id;
  const apId = accounts.find((a: any) => a.code === "2100")?.id;

  // 2. Get journal lines for current + last month (org-scoped via journal_entries)
  const [currentLinesRes, lastLinesRes, allLinesRes] = await Promise.all([
    supabase
      .from("journal_lines")
      .select("debit, credit, gl_account_id, journal_entries!inner(entry_date, organization_id)")
      .eq("journal_entries.organization_id", orgId)
      .gte("journal_entries.entry_date", monthStart)
      .lte("journal_entries.entry_date", monthEnd),
    supabase
      .from("journal_lines")
      .select("debit, credit, gl_account_id, journal_entries!inner(entry_date, organization_id)")
      .eq("journal_entries.organization_id", orgId)
      .gte("journal_entries.entry_date", lastMonthStart)
      .lte("journal_entries.entry_date", lastMonthEnd),
    supabase
      .from("journal_lines")
      .select("debit, credit, gl_account_id, journal_entries!inner(organization_id)")
      .eq("journal_entries.organization_id", orgId),
  ]);

  const calcFinancials = (lines: any[]) => {
    let revenue = 0, expenses = 0;
    (lines || []).forEach((l: any) => {
      if (revenueIds.has(l.gl_account_id)) revenue += Number(l.credit || 0);
      if (expenseIds.has(l.gl_account_id)) expenses += Number(l.debit || 0);
    });
    return { revenue, expenses };
  };

  const currentMonth = calcFinancials(currentLinesRes.data || []);
  const lastMonth = calcFinancials(lastLinesRes.data || []);

  // GL balances (all-time for balance sheet accounts)
  const balanceMap: Record<string, number> = {};
  (allLinesRes.data || []).forEach((l: any) => {
    balanceMap[l.gl_account_id] = (balanceMap[l.gl_account_id] || 0) + Number(l.debit || 0) - Number(l.credit || 0);
  });

  const cashBalance = cashId ? (balanceMap[cashId] || 0) : 0;
  const arBalance = arId ? (balanceMap[arId] || 0) : 0;
  const apBalance = apId ? Math.abs(balanceMap[apId] || 0) : 0;

  // Category breakdowns from GL
  const expensesByCategory: Record<string, number> = {};
  const revenueByCategory: Record<string, number> = {};
  (currentLinesRes.data || []).forEach((l: any) => {
    const acc = accounts.find((a: any) => a.id === l.gl_account_id);
    if (!acc) return;
    if (acc.account_type === "revenue") {
      revenueByCategory[acc.name] = (revenueByCategory[acc.name] || 0) + Number(l.credit || 0);
    } else if (acc.account_type === "expense") {
      expensesByCategory[acc.name] = (expensesByCategory[acc.name] || 0) + Number(l.debit || 0);
    }
  });

  // 3. Operational data (all org-scoped)
  const [
    invoices, bills, employees, leaves, attendance,
    goals, payroll, reimbursements, memos,
  ] = await Promise.all([
    supabase.from("invoices").select("status, amount, total_amount, due_date, client_name, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50),
    supabase.from("bills").select("status, total_amount, vendor_name, due_date, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50),
    supabase.from("profiles").select("status, department, job_title, join_date").eq("organization_id", orgId),
    supabase.from("leave_requests").select("status, leave_type, days, from_date, to_date").eq("organization_id", orgId).gte("from_date", lastMonthStart),
    supabase.from("attendance_records").select("status, date, check_in, check_out").eq("organization_id", orgId).gte("date", monthStart),
    supabase.from("goals").select("title, status, progress, category, due_date").eq("organization_id", orgId),
    supabase.from("payroll_records").select("net_pay, basic_salary, status, pay_period").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50),
    supabase.from("reimbursement_requests").select("status, amount, category, created_at").eq("organization_id", orgId).gte("created_at", lastMonthStart),
    supabase.from("memos").select("status, priority, department, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20),
  ]);

  const overdueInvoices = (invoices.data || []).filter((i: any) => i.status !== "paid" && new Date(i.due_date) < now);
  const overdueBills = (bills.data || []).filter((b: any) => b.status !== "paid" && b.due_date && new Date(b.due_date) < now);
  const pendingLeaves = (leaves.data || []).filter((l: any) => l.status === "pending");
  const approvedLeaves = (leaves.data || []).filter((l: any) => l.status === "approved");
  const activeEmployees = (employees.data || []).filter((e: any) => e.status === "active");
  const pendingReimbursements = (reimbursements.data || []).filter((r: any) => r.status === "pending" || r.status === "submitted");
  const staleGoals = (goals.data || []).filter((g: any) => g.progress < 25 && g.status !== "completed");
  const processedPayroll = (payroll.data || []).filter((p: any) => p.status === "processed");
  const totalPayrollBurn = processedPayroll.reduce((s: number, p: any) => s + Number(p.net_pay), 0);

  const deptCounts: Record<string, number> = {};
  activeEmployees.forEach((e: any) => {
    const dept = e.department || "Unassigned";
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });

  return {
    _source: "general_ledger",
    _org_id: orgId,
    _timestamp: now.toISOString(),
    financial: {
      revenueThisMonth: currentMonth.revenue,
      revenueLastMonth: lastMonth.revenue,
      revenueChangePercent: lastMonth.revenue > 0 ? ((currentMonth.revenue - lastMonth.revenue) / lastMonth.revenue * 100).toFixed(1) : "N/A",
      expensesThisMonth: currentMonth.expenses,
      expensesLastMonth: lastMonth.expenses,
      expenseChangePercent: lastMonth.expenses > 0 ? ((currentMonth.expenses - lastMonth.expenses) / lastMonth.expenses * 100).toFixed(1) : "N/A",
      netIncomeThisMonth: currentMonth.revenue - currentMonth.expenses,
      profitMarginPercent: currentMonth.revenue > 0 ? ((currentMonth.revenue - currentMonth.expenses) / currentMonth.revenue * 100).toFixed(1) : "N/A",
      expensesByCategory,
      revenueByCategory,
    },
    balanceSheet: {
      cashBalance,
      accountsReceivable: arBalance,
      accountsPayable: apBalance,
    },
    receivables: {
      totalInvoices: (invoices.data || []).length,
      overdueInvoices: overdueInvoices.length,
      overdueAmount: overdueInvoices.reduce((s: number, i: any) => s + Number(i.total_amount || i.amount), 0),
      topOverdueClients: overdueInvoices.slice(0, 5).map((i: any) => ({ client: i.client_name, amount: i.total_amount || i.amount })),
    },
    payables: {
      totalBills: (bills.data || []).length,
      overdueBills: overdueBills.length,
      overdueAmount: overdueBills.reduce((s: number, b: any) => s + Number(b.total_amount), 0),
    },
    hr: {
      totalActiveEmployees: activeEmployees.length,
      departmentDistribution: deptCounts,
      pendingLeaveRequests: pendingLeaves.length,
      approvedLeaveDays: approvedLeaves.reduce((s: number, l: any) => s + l.days, 0),
      pendingReimbursements: pendingReimbursements.length,
      pendingReimbursementAmount: pendingReimbursements.reduce((s: number, r: any) => s + Number(r.amount), 0),
    },
    payroll: {
      totalMonthlyBurn: totalPayrollBurn,
      processedCount: processedPayroll.length,
      burnToRevenueRatio: currentMonth.revenue > 0 ? (totalPayrollBurn / currentMonth.revenue * 100).toFixed(1) : "N/A",
    },
    performance: {
      totalGoals: (goals.data || []).length,
      staleGoals: staleGoals.length,
      avgProgress: (goals.data || []).length > 0
        ? ((goals.data || []).reduce((s: number, g: any) => s + g.progress, 0) / (goals.data || []).length).toFixed(0)
        : "0",
      completedGoals: (goals.data || []).filter((g: any) => g.status === "completed").length,
    },
    memos: {
      recentCount: (memos.data || []).length,
      highPriority: (memos.data || []).filter((m: any) => m.priority === "high").length,
    },
  };
}

// ============== PROMPT ENGINEERING ==============

function buildInsightsSystemPrompt(module: string) {
  return `You are the CFO's brutal inner voice — think T.J. Rodgers at Cypress Semiconductor. You speak in numbers, not feelings. 

CRITICAL DATA RULES:
- ALL financial numbers come from the General Ledger (journal_lines + gl_accounts). This is the ONLY source of truth.
- The _source field confirms the data origin. If it says "general_ledger", the numbers are deterministic.
- Balance sheet figures (cash, AR, AP) are cumulative all-time GL balances.
- Revenue and expense figures are period-specific from posted journal entries.
- NEVER invent or estimate numbers not present in the data snapshot.
- If a metric is zero or N/A, say so — do not speculate.

ANALYSIS RULES:
- Lead with the most alarming or impressive data point
- Call out waste, inefficiency, and complacency by name
- If something is going well, say so briefly then pivot to what's broken
- Use specific numbers and ratios, never vague language
- Compare month-over-month, always
- If payroll exceeds 60% of revenue, that's a problem. Say so.
- If overdue invoices exceed 10% of receivables, that's cash flow negligence
- If goals are stale (< 25% progress), question whether leadership is asleep
- Never use words like "exciting", "amazing", "great progress" — this is a boardroom, not a pep rally
- Keep each insight to 2-3 sentences max. Dense. Data-first.
- The one_liner should be something a CEO would wince at but know is true

You are analyzing: ${module === "dashboard" ? "the entire business" : `the ${module} module specifically`}`;
}

function buildChatSystemPrompt(data: any) {
  return `You are the CFO's AI advisor for GRX10 Books — a combined financial and HR operating system. You speak like T.J. Rodgers: blunt, data-obsessed, zero tolerance for inefficiency.

CRITICAL: All financial data below comes from the General Ledger (source: ${data._source}). These are deterministic, double-entry verified numbers — not estimates.
Organization: ${data._org_id}
Snapshot: ${data._timestamp}

When users ask questions, you pull from this live ledger data. Be specific. Use actual numbers. If asked about something not in the data, say so honestly — never fabricate.

LIVE LEDGER DATA:
${JSON.stringify(data, null, 2)}

RULES:
- Always reference specific numbers from the ledger snapshot
- Cross-reference domains: if payroll burn is high AND goals are stale, connect the dots
- If revenue is flat but expenses are growing, say "you're funding your own decline"
- Be concise. No filler. Every sentence must carry a data point or actionable insight.
- If asked to compare periods, use the month-over-month data available
- Format currency in Indian format (₹ with L for lakhs, Cr for crores)
- If a balance sheet account shows a negative cash position, flag it as critical`;
}

function buildDataPrompt(data: any, module?: string) {
  return `Analyze this live GENERAL LEDGER data (deterministic, double-entry verified) and generate insights. Focus on ${module || "cross-domain analysis"}.

DATA SOURCE: ${data._source} (organization: ${data._org_id})
SNAPSHOT TIME: ${data._timestamp}

LEDGER DATA:
${JSON.stringify(data, null, 2)}

Generate 3-5 of the most critical insights. At least one must be cross-domain (e.g. payroll vs revenue, attendance vs goals). Grade the overall operational health honestly.`;
}
