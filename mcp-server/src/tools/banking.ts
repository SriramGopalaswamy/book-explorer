/**
 * Banking Tools
 *
 * Covers: bank accounts, transactions, cash flow, reconciliation.
 *
 * Maps to Supabase tables:
 *   bank_accounts, bank_transactions, financial_records
 */

import { getSupabaseClient, resolveOrgId, query } from "../supabase-client.js";
import { McpTool, ok, fail } from "../types.js";

function db() {
  return getSupabaseClient();
}

export const bankingTools: McpTool[] = [
  // ------------------------------------------------------------------ 1
  {
    name: "get_bank_accounts",
    description:
      "List all bank accounts with current balances.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("bank_accounts")
          .select("*")
          .order("account_name");

        if (orgId) q = q.eq("organization_id", orgId);

        const data = await query(() => q) as Array<{ balance: number }>;
        const totalBalance = data.reduce((s, a) => s + (a.balance ?? 0), 0);

        return ok({
          bank_accounts: data,
          count: data.length,
          total_balance: totalBalance,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    name: "get_bank_transactions",
    description:
      "Fetch bank transactions for an account or date range.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        account_id: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
        transaction_type: {
          type: "string",
          enum: ["credit", "debit"],
        },
        limit: { type: "number", default: 100 },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("bank_transactions")
          .select("*")
          .order("date", { ascending: false })
          .limit((args.limit as number) ?? 100);

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.account_id) q = q.eq("account_id", args.account_id as string);
        if (args.start_date) q = q.gte("date", args.start_date as string);
        if (args.end_date) q = q.lte("date", args.end_date as string);
        if (args.transaction_type) q = q.eq("type", args.transaction_type as string);

        const data = await query(() => q) as Array<{
          type: string;
          amount: number;
        }>;

        const credits = data.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);
        const debits = data.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);

        return ok({
          transactions: data,
          count: data.length,
          total_credits: credits,
          total_debits: debits,
          net: credits - debits,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 3
  {
    name: "get_cashflow_analysis",
    description:
      "Analyse cash inflows vs outflows for the period. " +
      "Answers 'What is our cash position?' and 'Are we cash flow positive?'",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
        group_by: {
          type: "string",
          enum: ["week", "month"],
          default: "month",
        },
      },
      required: ["start_date", "end_date"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("bank_transactions")
          .select("date, type, amount, category, description")
          .gte("date", args.start_date as string)
          .lte("date", args.end_date as string)
          .order("date");

        if (orgId) q = q.eq("organization_id", orgId);

        const txns = await query(() => q) as Array<{
          date: string;
          type: string;
          amount: number;
          category: string;
        }>;

        const totalInflow = txns.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);
        const totalOutflow = txns.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);

        // Category breakdown
        const byCategory: Record<string, { inflow: number; outflow: number }> = {};
        for (const t of txns) {
          const cat = t.category ?? "Uncategorized";
          if (!byCategory[cat]) byCategory[cat] = { inflow: 0, outflow: 0 };
          if (t.type === "credit") byCategory[cat].inflow += t.amount;
          else byCategory[cat].outflow += t.amount;
        }

        return ok({
          period: { start_date: args.start_date, end_date: args.end_date },
          total_inflow: totalInflow,
          total_outflow: totalOutflow,
          net_cashflow: totalInflow - totalOutflow,
          cash_flow_positive: totalInflow > totalOutflow,
          breakdown_by_category: byCategory,
          transaction_count: txns.length,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 4
  {
    name: "record_bank_transaction",
    description:
      "Record a new bank transaction (credit or debit) for a bank account.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        account_id: { type: "string" },
        date: { type: "string" },
        type: { type: "string", enum: ["credit", "debit"] },
        amount: { type: "number" },
        description: { type: "string" },
        category: { type: "string" },
        reference: { type: "string" },
      },
      required: ["account_id", "date", "type", "amount", "description"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        const txn = await query(() =>
          db()
            .from("bank_transactions")
            .insert({
              organization_id: orgId,
              account_id: args.account_id,
              date: args.date,
              type: args.type,
              amount: args.amount,
              description: args.description,
              category: args.category,
              reference: args.reference,
              created_at: new Date().toISOString(),
            })
            .select()
            .single()
        );

        return ok({ transaction: txn });
      } catch (e) {
        return fail(e);
      }
    },
  },
];
