/**
 * GST / Tax Tools
 *
 * Covers: GST liability, GSTR-1 data, GSTR-2A reconciliation,
 * input tax credit, e-way bills, statutory filings.
 *
 * Maps to Supabase tables:
 *   invoices, purchase_orders, financial_records, statutory_filings
 */

import { getSupabaseClient, resolveOrgId, query } from "../supabase-client.js";
import { McpTool, ok, fail } from "../types.js";

function db() {
  return getSupabaseClient();
}

export const gstTools: McpTool[] = [
  // ------------------------------------------------------------------ 1
  {
    name: "get_gst_liability",
    description:
      "Calculate GST liability for a period: output GST collected on sales " +
      "minus input tax credit on purchases. Answers 'What GST do I owe this quarter?'",
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

        // Output GST — from sales invoices
        let salesQ = db()
          .from("invoices")
          .select("total_gst, cgst_amount, sgst_amount, igst_amount, status")
          .gte("invoice_date", args.start_date as string)
          .lte("invoice_date", args.end_date as string)
          .in("status", ["sent", "paid"]);

        if (orgId) salesQ = salesQ.eq("organization_id", orgId);

        const salesInvoices = await query(() => salesQ) as Array<{
          total_gst: number;
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
        }>;

        const outputGst = salesInvoices.reduce((s, i) => s + (i.total_gst ?? 0), 0);
        const outputCgst = salesInvoices.reduce((s, i) => s + (i.cgst_amount ?? 0), 0);
        const outputSgst = salesInvoices.reduce((s, i) => s + (i.sgst_amount ?? 0), 0);
        const outputIgst = salesInvoices.reduce((s, i) => s + (i.igst_amount ?? 0), 0);

        // Input tax credit — from purchase orders
        let poQ = db()
          .from("purchase_orders")
          .select("total_gst, status")
          .gte("order_date", args.start_date as string)
          .lte("order_date", args.end_date as string)
          .in("status", ["received"]);

        if (orgId) poQ = poQ.eq("organization_id", orgId);

        const purchaseOrders = await query(() => poQ) as Array<{ total_gst: number }>;
        const inputTaxCredit = purchaseOrders.reduce((s, p) => s + (p.total_gst ?? 0), 0);

        const netGstPayable = outputGst - inputTaxCredit;

        return ok({
          period: { start_date: args.start_date, end_date: args.end_date },
          output_gst: {
            total: outputGst,
            cgst: outputCgst,
            sgst: outputSgst,
            igst: outputIgst,
            invoice_count: salesInvoices.length,
          },
          input_tax_credit: {
            total: inputTaxCredit,
            purchase_order_count: purchaseOrders.length,
          },
          net_gst_payable: netGstPayable,
          gst_refundable: netGstPayable < 0,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    name: "get_gstr1_data",
    description:
      "Generate GSTR-1 outward supply data for a month: B2B, B2C, HSN summary. " +
      "Returns data in the format required for GST filing.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        month: { type: "string", description: "YYYY-MM format (e.g. '2024-03')" },
      },
      required: ["month"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        const [year, mon] = (args.month as string).split("-");
        const startDate = `${year}-${mon}-01`;
        const lastDay = new Date(parseInt(year, 10), parseInt(mon, 10), 0).getDate();
        const endDate = `${year}-${mon}-${lastDay}`;

        let q = db()
          .from("invoices")
          .select(
            "id, invoice_number, invoice_date, customer_id, supply_type, items, subtotal, total_gst, cgst_amount, sgst_amount, igst_amount, total_amount, status"
          )
          .gte("invoice_date", startDate)
          .lte("invoice_date", endDate)
          .in("status", ["sent", "paid"]);

        if (orgId) q = q.eq("organization_id", orgId);

        const invoices = await query(() => q) as Array<{
          id: string;
          invoice_number: string;
          invoice_date: string;
          customer_id: string;
          supply_type: string;
          items?: Array<{ hsn_sac?: string; gst_rate?: number; line_total?: number; gst_amount?: number }>;
          subtotal: number;
          total_gst: number;
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          total_amount: number;
        }>;

        // Group into B2B (inter-business) and B2C (consumers)
        const b2b = invoices.filter((i) => i.supply_type === "inter_state" || i.supply_type === "intra_state");
        const b2c = invoices.filter((i) => !i.supply_type);

        // HSN Summary
        const hsnSummary: Record<
          string,
          { hsn_sac: string; gst_rate: number; taxable_value: number; igst: number; cgst: number; sgst: number }
        > = {};

        for (const inv of invoices) {
          for (const item of inv.items ?? []) {
            const hsn = item.hsn_sac ?? "NA";
            const rate = item.gst_rate ?? 18;
            if (!hsnSummary[hsn]) {
              hsnSummary[hsn] = { hsn_sac: hsn, gst_rate: rate, taxable_value: 0, igst: 0, cgst: 0, sgst: 0 };
            }
            hsnSummary[hsn].taxable_value += item.line_total ?? 0;
            if (inv.supply_type === "inter_state") {
              hsnSummary[hsn].igst += item.gst_amount ?? 0;
            } else {
              hsnSummary[hsn].cgst += (item.gst_amount ?? 0) / 2;
              hsnSummary[hsn].sgst += (item.gst_amount ?? 0) / 2;
            }
          }
        }

        return ok({
          month: args.month,
          gstr1: {
            b2b_invoices: b2b.map((i) => ({
              invoice_number: i.invoice_number,
              invoice_date: i.invoice_date,
              customer_id: i.customer_id,
              taxable_value: i.subtotal,
              cgst: i.cgst_amount,
              sgst: i.sgst_amount,
              igst: i.igst_amount,
              total: i.total_amount,
            })),
            b2c_invoices: b2c,
            hsn_summary: Object.values(hsnSummary),
            totals: {
              total_taxable_value: invoices.reduce((s, i) => s + i.subtotal, 0),
              total_cgst: invoices.reduce((s, i) => s + i.cgst_amount, 0),
              total_sgst: invoices.reduce((s, i) => s + i.sgst_amount, 0),
              total_igst: invoices.reduce((s, i) => s + i.igst_amount, 0),
              total_tax: invoices.reduce((s, i) => s + i.total_gst, 0),
            },
          },
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 3
  {
    name: "get_statutory_filings",
    description:
      "List statutory filings (GST, TDS, PF, ESI) with their status and due dates.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        filing_type: {
          type: "string",
          enum: ["GST", "TDS", "PF", "ESI", "PT"],
        },
        status: {
          type: "string",
          enum: ["pending", "filed", "overdue"],
        },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("statutory_filings")
          .select("*")
          .order("due_date", { ascending: true });

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.filing_type) q = q.eq("filing_type", args.filing_type as string);
        if (args.status) q = q.eq("status", args.status as string);

        const data = await query(() => q) as Array<{
          status: string;
          due_date: string;
        }>;

        const overdue = data.filter(
          (f) => f.status === "pending" && new Date(f.due_date) < new Date()
        ).length;

        return ok({
          filings: data,
          count: data.length,
          overdue_count: overdue,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 4
  {
    name: "get_input_tax_credit_summary",
    description:
      "Summarise available input tax credit (ITC) from purchase invoices " +
      "that can be set off against output GST.",
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
          .from("purchase_orders")
          .select("total_gst, vendor_id, order_date, status")
          .gte("order_date", args.start_date as string)
          .lte("order_date", args.end_date as string)
          .eq("status", "received");

        if (orgId) q = q.eq("organization_id", orgId);

        const orders = await query(() => q) as Array<{
          total_gst: number;
          vendor_id: string;
        }>;

        const totalItc = orders.reduce((s, o) => s + (o.total_gst ?? 0), 0);

        const byVendor: Record<string, number> = {};
        for (const o of orders) {
          byVendor[o.vendor_id] = (byVendor[o.vendor_id] ?? 0) + o.total_gst;
        }

        return ok({
          period: { start_date: args.start_date, end_date: args.end_date },
          total_input_tax_credit: totalItc,
          purchase_count: orders.length,
          itc_by_vendor: byVendor,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },
];
