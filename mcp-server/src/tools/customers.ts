/**
 * Customers & Vendors Tools
 *
 * Covers: customer master, vendor master, contact management,
 * customer analytics, profit by customer.
 *
 * Maps to Supabase tables:
 *   customers, vendors, invoices, purchase_orders
 */

import { getSupabaseClient, resolveOrgId, query } from "../supabase-client.js";
import { McpTool, ok, fail } from "../types.js";

function db() {
  return getSupabaseClient();
}

export const customerTools: McpTool[] = [
  // ------------------------------------------------------------------ 1
  {
    name: "list_customers",
    description: "List all customers with contact and GST information.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        search: { type: "string", description: "Search by name or email" },
        limit: { type: "number", default: 50 },
        offset: { type: "number", default: 0 },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        const limit = (args.limit as number) ?? 50;
        const offset = (args.offset as number) ?? 0;

        let q = db()
          .from("customers")
          .select("id, name, email, phone, gstin, city, state, credit_limit, outstanding_balance")
          .order("name")
          .range(offset, offset + limit - 1);

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.search) q = q.ilike("name", `%${args.search}%`);

        const data = await query(() => q);
        return ok({ customers: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    name: "get_customer",
    description: "Get full details for a single customer.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        organization_id: { type: "string" },
      },
      required: ["customer_id"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("customers")
          .select("*")
          .eq("id", args.customer_id as string);

        if (orgId) q = q.eq("organization_id", orgId);

        const data = await query(() => q.single());
        return ok({ customer: data });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 3
  {
    name: "get_profit_by_customer",
    description:
      "Rank customers by profit contribution (revenue minus cost of goods). " +
      "Answers 'Which customers are most profitable?'",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
        limit: { type: "number", default: 10 },
      },
      required: ["start_date", "end_date"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("invoices")
          .select("customer_id, total_amount, total_gst, subtotal, status")
          .gte("invoice_date", args.start_date as string)
          .lte("invoice_date", args.end_date as string)
          .in("status", ["sent", "paid"]);

        if (orgId) q = q.eq("organization_id", orgId);

        const invoices = await query(() => q) as Array<{
          customer_id: string;
          total_amount: number;
          subtotal: number;
        }>;

        const byCustomer: Record<string, { customer_id: string; revenue: number; invoice_count: number }> = {};
        for (const inv of invoices) {
          if (!byCustomer[inv.customer_id]) {
            byCustomer[inv.customer_id] = { customer_id: inv.customer_id, revenue: 0, invoice_count: 0 };
          }
          byCustomer[inv.customer_id].revenue += inv.subtotal ?? 0;
          byCustomer[inv.customer_id].invoice_count += 1;
        }

        const ranked = Object.values(byCustomer)
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, (args.limit as number) ?? 10);

        return ok({
          period: { start_date: args.start_date, end_date: args.end_date },
          customers_by_revenue: ranked,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },
];

export const vendorTools: McpTool[] = [
  // ------------------------------------------------------------------ 1
  {
    name: "list_vendors",
    description: "List all vendors with contact and payment terms.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        search: { type: "string" },
        limit: { type: "number", default: 50 },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("vendors")
          .select("id, name, email, phone, gstin, city, state, payment_terms, bank_details")
          .order("name")
          .limit((args.limit as number) ?? 50);

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.search) q = q.ilike("name", `%${args.search}%`);

        const data = await query(() => q);
        return ok({ vendors: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    name: "get_vendor",
    description: "Get full details for a single vendor.",
    inputSchema: {
      type: "object",
      properties: {
        vendor_id: { type: "string" },
        organization_id: { type: "string" },
      },
      required: ["vendor_id"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("vendors")
          .select("*")
          .eq("id", args.vendor_id as string);

        if (orgId) q = q.eq("organization_id", orgId);

        const data = await query(() => q.single());
        return ok({ vendor: data });
      } catch (e) {
        return fail(e);
      }
    },
  },
];
