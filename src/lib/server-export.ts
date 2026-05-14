import { supabase } from "@/integrations/supabase/client";
import { logExportEvent } from "@/lib/log-export";

const BATCH_SIZE = 1000;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers: string[], rows: any[], pick: (r: any) => any[]): string {
  const out: string[] = [];
  out.push(headers.map(csvEscape).join(","));
  for (const r of rows) {
    out.push(pick(r).map(csvEscape).join(","));
  }
  return out.join("\n");
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ExportRangeFilter {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
  status?: string;    // 'all' to skip
  search?: string;
}

/**
 * Stream all invoices for the given org+filter via paged .range() requests
 * (1k rows/batch) and download as CSV. Lets users access invoices older than
 * the 500-row UI cap without slowing the live list.
 */
export async function exportInvoicesCsv(orgId: string, filter: ExportRangeFilter = {}) {
  let from = 0;
  const all: any[] = [];

  for (;;) {
    let q = supabase
      .from("invoices")
      .select(
        "invoice_number, client_name, client_email, customer_gstin, invoice_date, due_date, status, subtotal, cgst_total, sgst_total, igst_total, total_amount, amount, place_of_supply, payment_terms, notes, created_at",
      )
      .eq("organization_id", orgId);

    if (filter.startDate) q = q.gte("invoice_date", filter.startDate);
    if (filter.endDate) q = q.lte("invoice_date", filter.endDate);
    if (filter.status && filter.status !== "all") q = q.eq("status", filter.status);
    if (filter.search?.trim()) {
      const s = filter.search.trim().replace(/[,%]/g, "");
      q = q.or(`invoice_number.ilike.%${s}%,client_name.ilike.%${s}%,client_email.ilike.%${s}%`);
    }

    const { data, error } = await q
      .order("invoice_date", { ascending: false })
      .range(from, from + BATCH_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
    if (from > 100_000) break; // hard safety cap
  }

  const csv = rowsToCsv(
    [
      "Invoice #", "Client", "Email", "GSTIN", "Invoice Date", "Due Date", "Status",
      "Subtotal", "CGST", "SGST", "IGST", "Total", "Amount",
      "Place of Supply", "Payment Terms", "Notes", "Created At",
    ],
    all,
    (r) => [
      r.invoice_number, r.client_name, r.client_email, r.customer_gstin,
      r.invoice_date, r.due_date, r.status,
      r.subtotal, r.cgst_total, r.sgst_total, r.igst_total, r.total_amount, r.amount,
      r.place_of_supply, r.payment_terms, r.notes, r.created_at,
    ],
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `invoices-export-${stamp}.csv`;
  await logExportEvent({
    organizationId: orgId,
    exportType: "invoices_csv",
    fileName,
    rowCount: all.length,
  });
  downloadBlob(fileName, csv, "text/csv");
  return all.length;
}

export async function exportPurchaseOrdersCsv(orgId: string, filter: ExportRangeFilter = {}) {
  let from = 0;
  const all: any[] = [];

  for (;;) {
    let q = (supabase as any)
      .from("purchase_orders")
      .select(
        "po_number, vendor_name, order_date, expected_delivery, status, subtotal, tax_amount, total_amount, notes, created_at",
      )
      .eq("organization_id", orgId);

    if (filter.startDate) q = q.gte("order_date", filter.startDate);
    if (filter.endDate) q = q.lte("order_date", filter.endDate);
    if (filter.status && filter.status !== "all") q = q.eq("status", filter.status);
    if (filter.search?.trim()) {
      const s = filter.search.trim().replace(/[,%]/g, "");
      q = q.or(`po_number.ilike.%${s}%,vendor_name.ilike.%${s}%`);
    }

    const { data, error } = await q
      .order("order_date", { ascending: false })
      .range(from, from + BATCH_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
    if (from > 100_000) break;
  }

  const csv = rowsToCsv(
    [
      "PO #", "Vendor", "Order Date", "Expected Delivery", "Status",
      "Subtotal", "Tax", "Total", "Notes", "Created At",
    ],
    all,
    (r) => [
      r.po_number, r.vendor_name, r.order_date, r.expected_delivery, r.status,
      r.subtotal, r.tax_amount, r.total_amount, r.notes, r.created_at,
    ],
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `purchase-orders-export-${stamp}.csv`;
  await logExportEvent({
    organizationId: orgId,
    exportType: "purchase_orders_csv",
    fileName,
    rowCount: all.length,
  });
  downloadBlob(fileName, csv, "text/csv");
  return all.length;
}
