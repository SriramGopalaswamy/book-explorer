import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.9";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── ERP Tool Definitions for AI ──────────────────────────────────────────

const ERP_TOOLS = [
  {
    type: "function",
    function: {
      name: "query_dashboard_metrics",
      description: "Get high-level dashboard metrics: total revenue, expenses, invoices count, overdue invoices, employee count, payroll cost for the organization.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "query_invoices",
      description: "List or search invoices with optional filters. Returns invoice number, customer, amount, status, dates.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "cancelled"], description: "Filter by status" },
          limit: { type: "number", description: "Max results (default 20)" },
          customer_name: { type: "string", description: "Filter by customer name (partial match)" },
          min_amount: { type: "number", description: "Minimum invoice amount" },
          date_from: { type: "string", description: "Start date YYYY-MM-DD" },
          date_to: { type: "string", description: "End date YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_employees",
      description: "List employees with details: name, department, designation, status, date of joining.",
      parameters: {
        type: "object",
        properties: {
          department: { type: "string", description: "Filter by department" },
          status: { type: "string", enum: ["active", "inactive", "on_leave", "terminated"], description: "Employment status" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_expenses",
      description: "List expenses with category, amount, status, and date.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Expense category filter" },
          status: { type: "string", description: "Status filter" },
          limit: { type: "number", description: "Max results (default 20)" },
          date_from: { type: "string", description: "Start date YYYY-MM-DD" },
          date_to: { type: "string", description: "End date YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_financial_summary",
      description: "Get profit & loss summary: total revenue, total expenses, net income, top expense categories.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["this_month", "last_month", "this_quarter", "this_year"], description: "Time period" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_attendance",
      description: "Get attendance summary: present, absent, late, on-leave counts for today or a date range.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Specific date YYYY-MM-DD (default today)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_leave_balances",
      description: "Get leave request summary and pending leave requests.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "approved", "rejected"], description: "Filter leave requests by status" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_payroll_runs",
      description: "List payroll runs with status, period, total amounts.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status" },
          limit: { type: "number", description: "Max results (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_purchase_orders",
      description: "List purchase orders with vendor, amount, status.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_inventory_items",
      description: "List inventory items with stock levels, reorder points, and categories.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by category" },
          low_stock: { type: "boolean", description: "Only show items below reorder point" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_bank_accounts",
      description: "Get bank account balances and recent transactions.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max transactions to return (default 10)" },
        },
      },
    },
  },
  // ── Phase 3: Agentic Write Actions ──────────────────────────────────────
  {
    type: "function",
    function: {
      name: "create_journal_entry",
      description: "Create a journal entry in the general ledger. Requires balanced debit/credit lines. This action will be recorded in the audit log.",
      parameters: {
        type: "object",
        properties: {
          memo: { type: "string", description: "Description/narration for the journal entry" },
          lines: {
            type: "array",
            description: "Array of journal lines with gl_account_id, debit, credit, description",
            items: {
              type: "object",
              properties: {
                gl_account_id: { type: "string", description: "GL account UUID" },
                debit: { type: "number", description: "Debit amount (0 if credit)" },
                credit: { type: "number", description: "Credit amount (0 if debit)" },
                description: { type: "string", description: "Line description" },
              },
              required: ["gl_account_id", "debit", "credit"],
            },
          },
        },
        required: ["memo", "lines"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "approve_leave_request",
      description: "Approve or reject a pending leave request. Requires the leave request ID.",
      parameters: {
        type: "object",
        properties: {
          leave_id: { type: "string", description: "UUID of the leave request" },
          action: { type: "string", enum: ["approve", "reject"], description: "Action to take" },
          reason: { type: "string", description: "Reason for approval/rejection" },
        },
        required: ["leave_id", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_ai_insights",
      description: "Run AI-powered analysis on financial, HR, and operational data to detect anomalies, forecast trends, and suggest optimizations.",
      parameters: {
        type: "object",
        properties: {
          modules: {
            type: "array",
            items: { type: "string", enum: ["finance", "hr", "payroll", "inventory", "all"] },
            description: "Which modules to analyze (default: all)",
          },
        },
      },
    },
  },
];

// ── Tool Execution Engine ────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  orgId: string,
  userId: string,
  client: ReturnType<typeof createClient>
): Promise<unknown> {
  switch (toolName) {
    case "query_dashboard_metrics": {
      const [invoices, expenses, employees, payrollRuns] = await Promise.all([
        client.from("invoices").select("id, total_amount, status").eq("organization_id", orgId).eq("is_deleted", false),
        client.from("expenses").select("id, amount, status").eq("organization_id", orgId),
        client.from("profiles").select("id, employment_status").eq("organization_id", orgId),
        client.from("payroll_runs").select("id, total_gross, total_net, status").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(5),
      ]);

      const inv = invoices.data || [];
      const exp = expenses.data || [];
      const emp = employees.data || [];

      return {
        total_revenue: inv.filter(i => i.status === "paid").reduce((s, i) => s + (i.total_amount || 0), 0),
        total_invoices: inv.length,
        overdue_invoices: inv.filter(i => i.status === "overdue").length,
        total_expenses: exp.reduce((s, e) => s + (e.amount || 0), 0),
        active_employees: emp.filter(e => e.employment_status === "active").length,
        total_employees: emp.length,
        recent_payroll_runs: (payrollRuns.data || []).slice(0, 3),
      };
    }

    case "query_invoices": {
      let q = client.from("invoices")
        .select("invoice_number, customer_name, total_amount, status, invoice_date, due_date")
        .eq("organization_id", orgId)
        .eq("is_deleted", false)
        .order("invoice_date", { ascending: false })
        .limit((args.limit as number) || 20);

      if (args.status) q = q.eq("status", args.status as string);
      if (args.customer_name) q = q.ilike("customer_name", `%${args.customer_name}%`);
      if (args.min_amount) q = q.gte("total_amount", args.min_amount as number);
      if (args.date_from) q = q.gte("invoice_date", args.date_from as string);
      if (args.date_to) q = q.lte("invoice_date", args.date_to as string);

      const { data, error } = await q;
      if (error) throw error;
      return { invoices: data, count: data?.length || 0 };
    }

    case "query_employees": {
      let q = client.from("profiles")
        .select("full_name, department, designation, employment_status, date_of_joining, employee_code")
        .eq("organization_id", orgId)
        .limit((args.limit as number) || 20);

      if (args.department) q = q.ilike("department", `%${args.department}%`);
      if (args.status) q = q.eq("employment_status", args.status as string);

      const { data, error } = await q;
      if (error) throw error;
      return { employees: data, count: data?.length || 0 };
    }

    case "query_expenses": {
      let q = client.from("expenses")
        .select("description, amount, category, status, expense_date")
        .eq("organization_id", orgId)
        .order("expense_date", { ascending: false })
        .limit((args.limit as number) || 20);

      if (args.category) q = q.ilike("category", `%${args.category}%`);
      if (args.status) q = q.eq("status", args.status as string);
      if (args.date_from) q = q.gte("expense_date", args.date_from as string);
      if (args.date_to) q = q.lte("expense_date", args.date_to as string);

      const { data, error } = await q;
      if (error) throw error;
      return { expenses: data, count: data?.length || 0 };
    }

    case "query_financial_summary": {
      const period = (args.period as string) || "this_month";
      const now = new Date();
      let dateFrom: string;

      switch (period) {
        case "last_month": {
          const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          dateFrom = lm.toISOString().split("T")[0];
          break;
        }
        case "this_quarter": {
          const qm = Math.floor(now.getMonth() / 3) * 3;
          dateFrom = new Date(now.getFullYear(), qm, 1).toISOString().split("T")[0];
          break;
        }
        case "this_year":
          dateFrom = `${now.getFullYear()}-01-01`;
          break;
        default:
          dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      }

      const [revenue, expenses] = await Promise.all([
        client.from("financial_records")
          .select("amount, category")
          .eq("organization_id", orgId)
          .eq("type", "income")
          .gte("date", dateFrom),
        client.from("financial_records")
          .select("amount, category")
          .eq("organization_id", orgId)
          .eq("type", "expense")
          .gte("date", dateFrom),
      ]);

      const totalRevenue = (revenue.data || []).reduce((s, r) => s + (r.amount || 0), 0);
      const totalExpenses = (expenses.data || []).reduce((s, e) => s + (e.amount || 0), 0);

      // Top expense categories
      const catMap: Record<string, number> = {};
      for (const e of expenses.data || []) {
        catMap[e.category || "Uncategorized"] = (catMap[e.category || "Uncategorized"] || 0) + (e.amount || 0);
      }
      const topCategories = Object.entries(catMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, amount]) => ({ category, amount }));

      return {
        period,
        total_revenue: totalRevenue,
        total_expenses: totalExpenses,
        net_income: totalRevenue - totalExpenses,
        margin_pct: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue * 100).toFixed(1) : 0,
        top_expense_categories: topCategories,
      };
    }

    case "query_attendance": {
      const date = (args.date as string) || new Date().toISOString().split("T")[0];
      const { data, error } = await client.from("attendance_records")
        .select("status")
        .eq("organization_id", orgId)
        .eq("date", date);

      if (error) throw error;
      const records = data || [];
      return {
        date,
        total: records.length,
        present: records.filter(r => r.status === "present").length,
        absent: records.filter(r => r.status === "absent").length,
        late: records.filter(r => r.status === "late").length,
        half_day: records.filter(r => r.status === "half_day").length,
        on_leave: records.filter(r => r.status === "on_leave").length,
      };
    }

    case "query_leave_balances": {
      let q = client.from("leave_requests")
        .select("id, leave_type, start_date, end_date, status, reason, profiles(full_name)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit((args.limit as number) || 20);

      if (args.status) q = q.eq("status", args.status as string);

      const { data, error } = await q;
      if (error) throw error;
      return { leave_requests: data, count: data?.length || 0 };
    }

    case "query_payroll_runs": {
      let q = client.from("payroll_runs")
        .select("id, month, year, status, total_gross, total_net, total_deductions, employee_count, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit((args.limit as number) || 10);

      if (args.status) q = q.eq("status", args.status as string);

      const { data, error } = await q;
      if (error) throw error;
      return { payroll_runs: data, count: data?.length || 0 };
    }

    case "query_purchase_orders": {
      let q = client.from("purchase_orders")
        .select("po_number, vendor_name, total_amount, status, order_date")
        .eq("organization_id", orgId)
        .order("order_date", { ascending: false })
        .limit((args.limit as number) || 20);

      if (args.status) q = q.eq("status", args.status as string);

      const { data, error } = await q;
      if (error) throw error;
      return { purchase_orders: data, count: data?.length || 0 };
    }

    case "query_inventory_items": {
      let q = client.from("items")
        .select("name, sku, category, quantity_on_hand, reorder_point, unit_price, status")
        .eq("organization_id", orgId)
        .limit((args.limit as number) || 20);

      if (args.category) q = q.ilike("category", `%${args.category}%`);
      if (args.low_stock) q = q.not("reorder_point", "is", null);

      const { data, error } = await q;
      if (error) throw error;

      let items = data || [];
      if (args.low_stock) {
        items = items.filter(i => (i.quantity_on_hand || 0) < (i.reorder_point || 0));
      }

      return { items, count: items.length };
    }

    case "query_bank_accounts": {
      const [accounts, transactions] = await Promise.all([
        client.from("bank_accounts").select("name, bank_name, account_number, balance, status").eq("organization_id", orgId),
        client.from("bank_transactions")
          .select("description, amount, transaction_type, transaction_date, category")
          .eq("organization_id", orgId)
          .order("transaction_date", { ascending: false })
          .limit((args.limit as number) || 10),
      ]);

      return {
        accounts: accounts.data || [],
        recent_transactions: transactions.data || [],
        total_balance: (accounts.data || []).reduce((s, a) => s + (a.balance || 0), 0),
      };
    }

    // ── Phase 3: Write Actions ──────────────────────────────────────────
    case "create_journal_entry": {
      const lines = args.lines as Array<{ gl_account_id: string; debit: number; credit: number; description?: string }>;
      if (!lines || lines.length < 2) throw new Error("Journal entry requires at least 2 lines.");

      const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
      const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`Journal entry is unbalanced. Debits (${totalDebit}) ≠ Credits (${totalCredit}).`);
      }

      const { data: entry, error: entryErr } = await client.from("journal_entries").insert({
        organization_id: orgId,
        user_id: userId,
        entry_date: new Date().toISOString().split("T")[0],
        memo: args.memo as string,
        status: "draft",
        is_posted: false,
      }).select("id").single();

      if (entryErr) throw entryErr;

      const lineInserts = lines.map(l => ({
        journal_entry_id: entry.id,
        gl_account_id: l.gl_account_id,
        debit: l.debit || 0,
        credit: l.credit || 0,
        description: l.description || "",
      }));

      const { error: lineErr } = await client.from("journal_lines").insert(lineInserts);
      if (lineErr) throw lineErr;

      // Audit log
      await client.from("audit_logs").insert({
        organization_id: orgId,
        actor_id: userId,
        action: "create",
        entity_type: "journal_entry",
        entity_id: entry.id,
        metadata: { source: "ai_agent", memo: args.memo },
      });

      return { success: true, journal_entry_id: entry.id, status: "draft", message: "Journal entry created as draft. It needs to be reviewed and posted." };
    }

    case "approve_leave_request": {
      const leaveId = args.leave_id as string;
      const action = args.action as string;

      const { data: leave, error: fetchErr } = await client.from("leave_requests")
        .select("id, status, profile_id")
        .eq("id", leaveId)
        .eq("organization_id", orgId)
        .single();

      if (fetchErr || !leave) throw new Error("Leave request not found.");
      if (leave.status !== "pending") throw new Error(`Leave request is already '${leave.status}'.`);

      const newStatus = action === "approve" ? "approved" : "rejected";
      const { error: updateErr } = await client.from("leave_requests")
        .update({
          status: newStatus,
          approved_by: userId,
          approved_at: new Date().toISOString(),
          rejection_reason: action === "reject" ? (args.reason as string) || "Rejected via AI agent" : null,
        })
        .eq("id", leaveId);

      if (updateErr) throw updateErr;

      // Audit log
      await client.from("audit_logs").insert({
        organization_id: orgId,
        actor_id: userId,
        action: action,
        entity_type: "leave_request",
        entity_id: leaveId,
        metadata: { source: "ai_agent", reason: args.reason },
      });

      return { success: true, leave_id: leaveId, new_status: newStatus, message: `Leave request ${newStatus}.` };
    }

    case "generate_ai_insights": {
      // Gather cross-module data for analysis
      const [invoices, expenses, employees, payroll, attendance] = await Promise.all([
        client.from("invoices").select("total_amount, status, invoice_date, due_date").eq("organization_id", orgId).eq("is_deleted", false).limit(500),
        client.from("expenses").select("amount, category, status, expense_date").eq("organization_id", orgId).limit(500),
        client.from("profiles").select("employment_status, department, date_of_joining").eq("organization_id", orgId),
        client.from("payroll_runs").select("total_gross, total_net, total_deductions, employee_count, month, year, status").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(12),
        client.from("attendance_records").select("status, date").eq("organization_id", orgId).gte("date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
      ]);

      return {
        finance: {
          total_invoices: (invoices.data || []).length,
          overdue_invoices: (invoices.data || []).filter(i => i.status === "overdue").length,
          total_revenue: (invoices.data || []).filter(i => i.status === "paid").reduce((s, i) => s + (i.total_amount || 0), 0),
          total_expenses: (expenses.data || []).reduce((s, e) => s + (e.amount || 0), 0),
          expense_categories: (() => {
            const cat: Record<string, number> = {};
            for (const e of expenses.data || []) cat[e.category || "Other"] = (cat[e.category || "Other"] || 0) + (e.amount || 0);
            return Object.entries(cat).map(([k, v]) => ({ category: k, total: v }));
          })(),
        },
        hr: {
          active_employees: (employees.data || []).filter(e => e.employment_status === "active").length,
          departments: (() => {
            const d: Record<string, number> = {};
            for (const e of employees.data || []) d[e.department || "Unassigned"] = (d[e.department || "Unassigned"] || 0) + 1;
            return Object.entries(d).map(([k, v]) => ({ department: k, count: v }));
          })(),
          recent_attendance_30d: {
            total_records: (attendance.data || []).length,
            absent: (attendance.data || []).filter(a => a.status === "absent").length,
            late: (attendance.data || []).filter(a => a.status === "late").length,
          },
        },
        payroll: {
          recent_runs: (payroll.data || []).slice(0, 6),
          avg_cost_per_run: (payroll.data || []).length > 0
            ? (payroll.data || []).reduce((s, r) => s + (r.total_gross || 0), 0) / (payroll.data || []).length
            : 0,
        },
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ── System Prompt ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are GRX10 AI, an intelligent ERP assistant for GRX10 Business Suite.

You have access to real-time company data across Finance, HR, Payroll, Inventory, Procurement, and Banking modules.

## Capabilities
- **Query**: Retrieve invoices, expenses, employees, attendance, payroll, inventory, bank accounts, purchase orders, and financial summaries.
- **Analyze**: Generate AI-powered insights by analyzing cross-module data for anomalies, trends, and optimization opportunities.
- **Act**: Create journal entries (as drafts for review), approve/reject leave requests with audit trail.

## Guidelines
1. Always use tools to fetch real data — never fabricate numbers.
2. When analyzing data, be specific with amounts, counts, and percentages.
3. For write actions (journal entries, approvals), always confirm with the user before executing.
4. Format currency as ₹ (Indian Rupees) with appropriate denominations (L = Lakhs, Cr = Crores).
5. When giving insights, categorize them as: 🔴 Critical, 🟡 Warning, 🟢 Healthy, 💡 Optimization.
6. Be concise but thorough. Use tables and bullet points for clarity.
7. If asked about data you can't access, explain what's available and suggest alternatives.
8. For financial analysis, always consider both absolute values and trends/ratios.

## Safety
- Write actions create items in "draft" status for human review.
- All actions are recorded in the audit log with "ai_agent" source.
- You cannot delete records or modify posted/finalized entries.
- Always verify the user's intent before executing write actions.`;

// ── Main Handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth: resolve user & org
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, supabaseKey);

    // Verify JWT and get user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await client.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get org
    const { data: profile } = await client.from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = profile.organization_id;
    const userId = user.id;

    const { messages, stream: shouldStream } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // ── Agentic loop: call AI, execute tools, loop until final response ──
    let conversationMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const MAX_TOOL_ROUNDS = 5;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: conversationMessages,
          tools: ERP_TOOLS,
          stream: false,
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        const text = await aiResponse.text();
        console.error("AI gateway error:", status, text);

        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in workspace settings." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI gateway error: ${status}`);
      }

      const aiResult = await aiResponse.json();
      const choice = aiResult.choices?.[0];

      if (!choice) throw new Error("No AI response received");

      // If the model wants to call tools
      if (choice.finish_reason === "tool_calls" && choice.message?.tool_calls?.length) {
        conversationMessages.push(choice.message);

        // Execute all tool calls in parallel
        const toolResults = await Promise.all(
          choice.message.tool_calls.map(async (tc: { id: string; function: { name: string; arguments: string } }) => {
            try {
              const toolArgs = JSON.parse(tc.function.arguments || "{}");
              const result = await executeTool(tc.function.name, toolArgs, orgId, userId, client);
              return {
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify(result),
              };
            } catch (err) {
              return {
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify({ error: (err as Error).message }),
              };
            }
          })
        );

        conversationMessages.push(...toolResults);
        continue; // Loop for next AI reasoning
      }

      // Final response — stream it to the client
      if (shouldStream) {
        // Re-call with streaming for the final response
        const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: conversationMessages,
            stream: true,
          }),
        });

        if (!streamResponse.ok) throw new Error("Stream error");

        return new Response(streamResponse.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      // Non-streaming: return the text
      return new Response(
        JSON.stringify({
          content: choice.message?.content || "",
          tool_calls_made: round,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Max tool rounds exceeded" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ai-agent error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
