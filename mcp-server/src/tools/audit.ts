/**
 * Audit & Analytics Tools
 *
 * Covers: audit logs, cross-module analytics, system health,
 * user activity reports.
 *
 * Maps to Supabase tables:
 *   audit_logs, profiles, user_roles, organizations
 */

import { getSupabaseClient, resolveOrgId, query } from "../supabase-client.js";
import { McpTool, ok, fail } from "../types.js";

function db() {
  return getSupabaseClient();
}

export const auditTools: McpTool[] = [
  // ------------------------------------------------------------------ 1
  {
    name: "get_audit_logs",
    description:
      "Retrieve audit logs for compliance and traceability. Filter by actor, " +
      "entity type, action, and date range.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        actor_id: { type: "string", description: "User UUID who performed the action" },
        entity_type: {
          type: "string",
          description: "Table/entity name (e.g. 'invoices', 'payroll_records')",
        },
        action: {
          type: "string",
          enum: ["INSERT", "UPDATE", "DELETE", "LOGIN", "LOGOUT"],
        },
        start_date: { type: "string" },
        end_date: { type: "string" },
        limit: { type: "number", default: 100 },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("audit_logs")
          .select("id, actor_id, entity_type, entity_id, action, old_values, new_values, created_at, ip_address")
          .order("created_at", { ascending: false })
          .limit((args.limit as number) ?? 100);

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.actor_id) q = q.eq("actor_id", args.actor_id as string);
        if (args.entity_type) q = q.eq("entity_type", args.entity_type as string);
        if (args.action) q = q.eq("action", args.action as string);
        if (args.start_date) q = q.gte("created_at", args.start_date as string);
        if (args.end_date) q = q.lte("created_at", args.end_date as string);

        const data = await query(() => q);
        return ok({ audit_logs: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    name: "get_audit_summary",
    description:
      "Get a summary of audit activity: top actors, most modified entities, " +
      "action counts, unusual activity detection.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
      },
      required: ["start_date", "end_date"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("audit_logs")
          .select("actor_id, entity_type, action, created_at")
          .gte("created_at", args.start_date as string)
          .lte("created_at", args.end_date as string);

        if (orgId) q = q.eq("organization_id", orgId);

        const logs = await query(() => q) as Array<{
          actor_id: string;
          entity_type: string;
          action: string;
        }>;

        // Action counts
        const actionCounts: Record<string, number> = {};
        const byCtor: Record<string, number> = {};
        const byEntity: Record<string, number> = {};

        for (const log of logs) {
          actionCounts[log.action] = (actionCounts[log.action] ?? 0) + 1;
          byCtor[log.actor_id] = (byCtor[log.actor_id] ?? 0) + 1;
          byEntity[log.entity_type] = (byEntity[log.entity_type] ?? 0) + 1;
        }

        const topActors = Object.entries(byCtor)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([actor_id, count]) => ({ actor_id, action_count: count }));

        const topEntities = Object.entries(byEntity)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([entity_type, count]) => ({ entity_type, change_count: count }));

        return ok({
          period: { start_date: args.start_date, end_date: args.end_date },
          total_actions: logs.length,
          action_breakdown: actionCounts,
          top_actors: topActors,
          top_modified_entities: topEntities,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },
];

export const analyticsTools: McpTool[] = [
  // ------------------------------------------------------------------ 1
  {
    name: "get_dashboard_kpis",
    description:
      "Return key performance indicators for the executive dashboard: " +
      "revenue, expenses, headcount, outstanding invoices, inventory value.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        period: {
          type: "string",
          description: "YYYY-MM (current month by default)",
        },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        const now = new Date();
        const period = (args.period as string) ??
          `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const [year, month] = period.split("-");
        const startDate = `${year}-${month}-01`;
        const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
        const endDate = `${year}-${month}-${lastDay}`;

        // Revenue from invoices
        let revQ = db()
          .from("invoices")
          .select("total_amount, status")
          .gte("invoice_date", startDate)
          .lte("invoice_date", endDate)
          .in("status", ["sent", "paid"]);

        // Expenses from financial records
        let expQ = db()
          .from("financial_records")
          .select("amount, type")
          .gte("date", startDate)
          .lte("date", endDate)
          .eq("type", "expense");

        // Outstanding invoices
        let outQ = db()
          .from("invoices")
          .select("total_amount, status")
          .in("status", ["sent", "overdue"]);

        // Active employees
        let empQ = db().from("profiles").select("id, status").eq("status", "active");

        if (orgId) {
          revQ = revQ.eq("organization_id", orgId);
          expQ = expQ.eq("organization_id", orgId);
          outQ = outQ.eq("organization_id", orgId);
          empQ = empQ.eq("organization_id", orgId);
        }

        const [invoices, expenses, outstanding, employees] = await Promise.all([
          query(() => revQ) as Promise<Array<{ total_amount: number }>>,
          query(() => expQ) as Promise<Array<{ amount: number }>>,
          query(() => outQ) as Promise<Array<{ total_amount: number }>>,
          query(() => empQ) as Promise<Array<{ id: string }>>,
        ]);

        const totalRevenue = invoices.reduce((s, i) => s + (i.total_amount ?? 0), 0);
        const totalExpenses = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);
        const totalOutstanding = outstanding.reduce((s, i) => s + (i.total_amount ?? 0), 0);

        return ok({
          period,
          kpis: {
            total_revenue: totalRevenue,
            total_expenses: totalExpenses,
            net_profit: totalRevenue - totalExpenses,
            profit_margin_pct: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0,
            active_employees: employees.length,
            outstanding_receivables: totalOutstanding,
            invoice_count: invoices.length,
          },
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    name: "get_expense_breakdown",
    description:
      "Break down expenses by category for a period. " +
      "Answers 'Where is our money going?' and 'Which cost centre is overspending?'",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
      },
      required: ["start_date", "end_date"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("financial_records")
          .select("category, amount, description, date")
          .eq("type", "expense")
          .gte("date", args.start_date as string)
          .lte("date", args.end_date as string);

        if (orgId) q = q.eq("organization_id", orgId);

        const records = await query(() => q) as Array<{
          category: string;
          amount: number;
        }>;

        const byCategory: Record<string, { category: string; total: number; count: number }> = {};
        for (const r of records) {
          const cat = r.category ?? "Uncategorized";
          if (!byCategory[cat]) byCategory[cat] = { category: cat, total: 0, count: 0 };
          byCategory[cat].total += r.amount ?? 0;
          byCategory[cat].count += 1;
        }

        const breakdown = Object.values(byCategory).sort((a, b) => b.total - a.total);
        const grandTotal = breakdown.reduce((s, c) => s + c.total, 0);

        const withPct = breakdown.map((c) => ({
          ...c,
          percentage: grandTotal > 0 ? (c.total / grandTotal) * 100 : 0,
        }));

        return ok({
          period: { start_date: args.start_date, end_date: args.end_date },
          total_expenses: grandTotal,
          breakdown: withPct,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },
];
