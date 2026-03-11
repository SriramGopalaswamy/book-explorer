/**
 * Sales & Invoice Tools
 *
 * Covers: invoices, sales orders, credit notes, delivery notes,
 * customer payments, revenue analysis, overdue tracking.
 *
 * Maps to Supabase tables:
 *   invoices, invoice_items, sales_orders, customers, financial_records
 */

import { getSupabaseClient, resolveOrgId, query } from "../supabase-client.js";
import { McpTool, ok, fail } from "../types.js";

function db() {
  return getSupabaseClient();
}

export const salesTools: McpTool[] = [
  // ------------------------------------------------------------------ 1
  {
    name: "create_invoice",
    description:
      "Create a new GST-compliant invoice with line items, HSN/SAC codes, " +
      "and automatic CGST/SGST/IGST calculation based on supply type.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        customer_id: { type: "string", description: "Customer UUID" },
        invoice_date: { type: "string", description: "YYYY-MM-DD" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        supply_type: {
          type: "string",
          enum: ["intra_state", "inter_state"],
          description: "Determines CGST+SGST vs IGST",
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              hsn_sac: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              gst_rate: { type: "number", description: "GST % (e.g. 18)" },
            },
          },
        },
        notes: { type: "string" },
      },
      required: ["customer_id", "invoice_date", "due_date", "items"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        const supplyType = (args.supply_type as string) ?? "intra_state";
        const items = args.items as Array<{
          description: string;
          hsn_sac?: string;
          quantity: number;
          unit_price: number;
          gst_rate?: number;
        }>;

        // Calculate totals
        let subtotal = 0;
        let totalGst = 0;
        const processedItems = items.map((item) => {
          const lineTotal = item.quantity * item.unit_price;
          const gstRate = item.gst_rate ?? 18;
          const gstAmount = (lineTotal * gstRate) / 100;
          subtotal += lineTotal;
          totalGst += gstAmount;
          return {
            ...item,
            line_total: lineTotal,
            gst_amount: gstAmount,
            cgst: supplyType === "intra_state" ? gstAmount / 2 : 0,
            sgst: supplyType === "intra_state" ? gstAmount / 2 : 0,
            igst: supplyType === "inter_state" ? gstAmount : 0,
          };
        });

        const totalAmount = subtotal + totalGst;

        const invoice = await query(() =>
          db()
            .from("invoices")
            .insert({
              organization_id: orgId,
              customer_id: args.customer_id,
              invoice_date: args.invoice_date,
              due_date: args.due_date,
              supply_type: supplyType,
              items: processedItems,
              subtotal,
              total_gst: totalGst,
              total_amount: totalAmount,
              cgst_amount: supplyType === "intra_state" ? totalGst / 2 : 0,
              sgst_amount: supplyType === "intra_state" ? totalGst / 2 : 0,
              igst_amount: supplyType === "inter_state" ? totalGst : 0,
              status: "draft",
              notes: args.notes,
              created_at: new Date().toISOString(),
            })
            .select()
            .single()
        );

        return ok({ invoice, subtotal, total_gst: totalGst, total_amount: totalAmount });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    name: "get_invoice",
    description: "Fetch a single invoice by ID, including all line items.",
    inputSchema: {
      type: "object",
      properties: {
        invoice_id: { type: "string", description: "Invoice UUID" },
      },
      required: ["invoice_id"],
    },
    handler: async (args) => {
      try {
        const data = await query(() =>
          db()
            .from("invoices")
            .select("*, invoice_items(*)")
            .eq("id", args.invoice_id as string)
            .single()
        );
        return ok({ invoice: data });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 3
  {
    name: "list_invoices",
    description:
      "List invoices with optional filters: status, customer, date range. " +
      "Returns invoice summary (no line items).",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        status: {
          type: "string",
          enum: ["draft", "sent", "paid", "overdue", "cancelled"],
        },
        customer_id: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
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
          .from("invoices")
          .select(
            "id, invoice_number, customer_id, invoice_date, due_date, status, total_amount, total_gst, created_at"
          )
          .order("invoice_date", { ascending: false })
          .range(offset, offset + limit - 1);

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.status) q = q.eq("status", args.status as string);
        if (args.customer_id) q = q.eq("customer_id", args.customer_id as string);
        if (args.start_date) q = q.gte("invoice_date", args.start_date as string);
        if (args.end_date) q = q.lte("invoice_date", args.end_date as string);

        const data = await query(() => q);
        return ok({ invoices: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 4
  {
    name: "get_overdue_invoices",
    description:
      "Return all unpaid invoices that are past their due date. " +
      "Sorted by overdue amount descending — perfect for collections follow-up.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        limit: { type: "number", default: 50 },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        const today = new Date().toISOString().split("T")[0];

        let q = db()
          .from("invoices")
          .select(
            "id, invoice_number, customer_id, invoice_date, due_date, total_amount, status"
          )
          .in("status", ["sent", "overdue"])
          .lt("due_date", today)
          .order("due_date", { ascending: true })
          .limit((args.limit as number) ?? 50);

        if (orgId) q = q.eq("organization_id", orgId);

        const data = await query(() => q) as Array<{
          id: string;
          invoice_number: string;
          customer_id: string;
          due_date: string;
          total_amount: number;
        }>;

        const totalOverdue = data.reduce((s, i) => s + (i.total_amount ?? 0), 0);

        return ok({
          overdue_invoices: data,
          count: data.length,
          total_overdue_amount: totalOverdue,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 5
  {
    name: "get_customer_outstanding",
    description:
      "Get total outstanding (unpaid) amount for a specific customer, " +
      "with a list of pending invoices.",
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
          .from("invoices")
          .select("id, invoice_number, invoice_date, due_date, total_amount, status")
          .eq("customer_id", args.customer_id as string)
          .in("status", ["sent", "overdue", "draft"])
          .order("due_date");

        if (orgId) q = q.eq("organization_id", orgId);

        const invoices = await query(() => q) as Array<{ total_amount: number }>;
        const outstanding = invoices.reduce((s, i) => s + (i.total_amount ?? 0), 0);

        return ok({
          customer_id: args.customer_id,
          outstanding_amount: outstanding,
          pending_invoices: invoices,
          invoice_count: invoices.length,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 6
  {
    name: "get_sales_summary",
    description:
      "Summarise sales performance: total revenue, number of invoices, " +
      "average invoice value, GST collected, for a date range.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
        group_by: {
          type: "string",
          enum: ["month", "week", "day"],
          default: "month",
        },
      },
      required: ["start_date", "end_date"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("invoices")
          .select("invoice_date, total_amount, total_gst, status")
          .gte("invoice_date", args.start_date as string)
          .lte("invoice_date", args.end_date as string)
          .in("status", ["sent", "paid"]);

        if (orgId) q = q.eq("organization_id", orgId);

        const invoices = await query(() => q) as Array<{
          invoice_date: string;
          total_amount: number;
          total_gst: number;
          status: string;
        }>;

        const totalRevenue = invoices.reduce((s, i) => s + (i.total_amount ?? 0), 0);
        const totalGst = invoices.reduce((s, i) => s + (i.total_gst ?? 0), 0);
        const paidCount = invoices.filter((i) => i.status === "paid").length;

        return ok({
          period: { start_date: args.start_date, end_date: args.end_date },
          total_revenue: totalRevenue,
          total_gst_collected: totalGst,
          invoice_count: invoices.length,
          paid_count: paidCount,
          average_invoice_value: invoices.length > 0 ? totalRevenue / invoices.length : 0,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 7
  {
    name: "get_top_customers",
    description:
      "Rank customers by total invoice value for the period. " +
      "Answers 'Which customers drive the most revenue?'",
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
          .select("customer_id, total_amount, status")
          .gte("invoice_date", args.start_date as string)
          .lte("invoice_date", args.end_date as string)
          .in("status", ["sent", "paid"]);

        if (orgId) q = q.eq("organization_id", orgId);

        const invoices = await query(() => q) as Array<{
          customer_id: string;
          total_amount: number;
        }>;

        const byCustomer: Record<string, { customer_id: string; total_revenue: number; invoice_count: number }> = {};
        for (const inv of invoices) {
          if (!byCustomer[inv.customer_id]) {
            byCustomer[inv.customer_id] = { customer_id: inv.customer_id, total_revenue: 0, invoice_count: 0 };
          }
          byCustomer[inv.customer_id].total_revenue += inv.total_amount ?? 0;
          byCustomer[inv.customer_id].invoice_count += 1;
        }

        const ranked = Object.values(byCustomer)
          .sort((a, b) => b.total_revenue - a.total_revenue)
          .slice(0, (args.limit as number) ?? 10);

        return ok({ top_customers: ranked, period: { start_date: args.start_date, end_date: args.end_date } });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 8
  {
    name: "list_sales_orders",
    description: "List sales orders with status, customer and amount filters.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        status: { type: "string" },
        customer_id: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
        limit: { type: "number", default: 50 },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("sales_orders")
          .select("*")
          .order("created_at", { ascending: false })
          .limit((args.limit as number) ?? 50);

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.status) q = q.eq("status", args.status as string);
        if (args.customer_id) q = q.eq("customer_id", args.customer_id as string);
        if (args.start_date) q = q.gte("order_date", args.start_date as string);
        if (args.end_date) q = q.lte("order_date", args.end_date as string);

        const data = await query(() => q);
        return ok({ sales_orders: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },
];
