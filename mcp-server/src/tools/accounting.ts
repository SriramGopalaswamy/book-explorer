/**
 * Accounting Tools
 *
 * Covers: journal entries, ledger, trial balance, chart of accounts,
 * profit & loss, balance sheet, financial summary.
 *
 * Maps to Supabase tables:
 *   journal_entries, ledger_entries, financial_records, fiscal_periods
 */

import { getSupabaseClient, resolveOrgId, query } from "../supabase-client.js";
import { McpTool, ok, fail } from "../types.js";

// ── helpers ────────────────────────────────────────────────────────────────

function db() {
  return getSupabaseClient();
}

// ── TOOL DEFINITIONS ───────────────────────────────────────────────────────

export const accountingTools: McpTool[] = [
  // ------------------------------------------------------------------ 1
  {
    name: "post_journal_entry",
    description:
      "Create and post a double-entry journal entry to the general ledger. " +
      "Each entry must have balanced debits and credits. Supports GST-tagged lines.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: {
          type: "string",
          description: "Organization UUID (required for multi-tenant setup)",
        },
        date: {
          type: "string",
          description: "Posting date in YYYY-MM-DD format",
        },
        reference: {
          type: "string",
          description: "Reference number or description (e.g., 'INV-001')",
        },
        narration: {
          type: "string",
          description: "Human-readable description of the transaction",
        },
        lines: {
          type: "array",
          description: "Debit/credit lines — must balance to zero net",
          items: {
            type: "object",
            properties: {
              account_code: { type: "string" },
              account_name: { type: "string" },
              debit: { type: "number" },
              credit: { type: "number" },
              gst_type: {
                type: "string",
                enum: ["CGST", "SGST", "IGST", "none"],
              },
            },
          },
        },
      },
      required: ["date", "narration", "lines"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        const lines = args.lines as Array<{
          account_code?: string;
          account_name?: string;
          debit?: number;
          credit?: number;
          gst_type?: string;
        }>;

        // Validate balance
        const totalDebit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
        const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          return fail(
            `Journal entry is unbalanced: debits=${totalDebit}, credits=${totalCredit}`
          );
        }

        const entry = await query(() =>
          db()
            .from("journal_entries")
            .insert({
              organization_id: orgId,
              date: args.date,
              reference: args.reference,
              narration: args.narration,
              lines: lines,
              total_debit: totalDebit,
              total_credit: totalCredit,
              status: "posted",
              created_at: new Date().toISOString(),
            })
            .select()
            .single()
        );

        return ok({ journal_entry: entry, total_debit: totalDebit, total_credit: totalCredit });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    name: "get_trial_balance",
    description:
      "Retrieve the trial balance for a given date range. Shows all accounts with " +
      "opening balance, period movements, and closing balance.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        start_date: { type: "string", description: "Period start YYYY-MM-DD" },
        end_date: { type: "string", description: "Period end YYYY-MM-DD" },
      },
      required: ["start_date", "end_date"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("ledger_entries")
          .select("account_code, account_name, account_type, debit, credit, date")
          .gte("date", args.start_date as string)
          .lte("date", args.end_date as string);

        if (orgId) q = q.eq("organization_id", orgId);

        const entries = await query(() => q);

        // Aggregate by account
        const accounts: Record<
          string,
          {
            account_code: string;
            account_name: string;
            account_type: string;
            total_debit: number;
            total_credit: number;
          }
        > = {};

        for (const e of (entries as Array<{
          account_code: string;
          account_name: string;
          account_type: string;
          debit: number;
          credit: number;
        }>)) {
          if (!accounts[e.account_code]) {
            accounts[e.account_code] = {
              account_code: e.account_code,
              account_name: e.account_name,
              account_type: e.account_type,
              total_debit: 0,
              total_credit: 0,
            };
          }
          accounts[e.account_code].total_debit += e.debit ?? 0;
          accounts[e.account_code].total_credit += e.credit ?? 0;
        }

        const rows = Object.values(accounts).sort((a, b) =>
          a.account_code.localeCompare(b.account_code)
        );
        const grandDebit = rows.reduce((s, r) => s + r.total_debit, 0);
        const grandCredit = rows.reduce((s, r) => s + r.total_credit, 0);

        return ok({
          period: { start_date: args.start_date, end_date: args.end_date },
          accounts: rows,
          totals: { total_debit: grandDebit, total_credit: grandCredit, balanced: Math.abs(grandDebit - grandCredit) < 0.01 },
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 3
  {
    name: "get_ledger_entries",
    description:
      "Fetch ledger entries for a specific account or date range. " +
      "Useful for drilling into any account movement.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        account_code: { type: "string", description: "Account code to filter" },
        start_date: { type: "string" },
        end_date: { type: "string" },
        limit: { type: "number", default: 100 },
        offset: { type: "number", default: 0 },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        let q = db()
          .from("ledger_entries")
          .select("*")
          .order("date", { ascending: false })
          .limit((args.limit as number) ?? 100)
          .range(
            (args.offset as number) ?? 0,
            ((args.offset as number) ?? 0) + ((args.limit as number) ?? 100) - 1
          );

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.account_code) q = q.eq("account_code", args.account_code as string);
        if (args.start_date) q = q.gte("date", args.start_date as string);
        if (args.end_date) q = q.lte("date", args.end_date as string);

        const data = await query(() => q);
        return ok({ entries: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 4
  {
    name: "get_financial_summary",
    description:
      "Get a high-level financial summary: total revenue, total expenses, net profit, " +
      "and key KPIs for the requested period. Great for answering 'Why did profit fall?'",
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
          .select("type, amount, category, date")
          .gte("date", args.start_date as string)
          .lte("date", args.end_date as string);

        if (orgId) q = q.eq("organization_id", orgId);

        const records = await query(() => q) as Array<{
          type: string;
          amount: number;
          category: string;
        }>;

        const revenue = records
          .filter((r) => r.type === "income" || r.type === "revenue")
          .reduce((s, r) => s + (r.amount ?? 0), 0);

        const expenses = records
          .filter((r) => r.type === "expense")
          .reduce((s, r) => s + (r.amount ?? 0), 0);

        const byCategory: Record<string, number> = {};
        for (const r of records) {
          byCategory[r.category] = (byCategory[r.category] ?? 0) + r.amount;
        }

        return ok({
          period: { start_date: args.start_date, end_date: args.end_date },
          total_revenue: revenue,
          total_expenses: expenses,
          net_profit: revenue - expenses,
          profit_margin_pct: revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0,
          breakdown_by_category: byCategory,
          record_count: records.length,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 5
  {
    name: "get_profit_and_loss",
    description:
      "Generate a Profit & Loss statement for the given period, " +
      "grouped by income and expense categories.",
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
          .select("type, amount, category, description, date")
          .gte("date", args.start_date as string)
          .lte("date", args.end_date as string)
          .order("date");

        if (orgId) q = q.eq("organization_id", orgId);

        const records = await query(() => q) as Array<{
          type: string;
          amount: number;
          category: string;
          description: string;
        }>;

        const income: Record<string, number> = {};
        const expenses: Record<string, number> = {};

        for (const r of records) {
          if (r.type === "income" || r.type === "revenue") {
            income[r.category] = (income[r.category] ?? 0) + r.amount;
          } else if (r.type === "expense") {
            expenses[r.category] = (expenses[r.category] ?? 0) + r.amount;
          }
        }

        const totalIncome = Object.values(income).reduce((s, v) => s + v, 0);
        const totalExpenses = Object.values(expenses).reduce((s, v) => s + v, 0);

        return ok({
          period: { start_date: args.start_date, end_date: args.end_date },
          income: { breakdown: income, total: totalIncome },
          expenses: { breakdown: expenses, total: totalExpenses },
          gross_profit: totalIncome - totalExpenses,
          net_profit: totalIncome - totalExpenses,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 6
  {
    name: "get_chart_of_accounts",
    description:
      "List the full chart of accounts with account codes, names, and types.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        account_type: {
          type: "string",
          enum: ["asset", "liability", "equity", "income", "expense"],
          description: "Filter by account type",
        },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("chart_of_accounts")
          .select("*")
          .order("account_code");

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.account_type) q = q.eq("account_type", args.account_type as string);

        const data = await query(() => q);
        return ok({ accounts: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 7
  {
    name: "get_fiscal_periods",
    description:
      "List fiscal periods with their status (open/closed/locked). " +
      "Use this before posting to confirm the period is open.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        status: {
          type: "string",
          enum: ["open", "closed", "locked"],
        },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("fiscal_periods")
          .select("*")
          .order("start_date", { ascending: false });

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.status) q = q.eq("status", args.status as string);

        const data = await query(() => q);
        return ok({ fiscal_periods: data });
      } catch (e) {
        return fail(e);
      }
    },
  },
];
