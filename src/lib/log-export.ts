import { supabase } from "@/integrations/supabase/client";

/**
 * GBC-13: Record a CSV / PDF / file export to the server-side audit log.
 *
 * Throws if the audit row could not be written. Callers MUST await this BEFORE
 * triggering the actual file download — if it throws, do not give the user
 * the file.
 */
export async function logExportEvent(params: {
  organizationId: string;
  exportType: string;        // e.g. "invoices_csv", "payroll_csv", "payslip_pdf"
  fileName: string;
  rowCount?: number;
}): Promise<void> {
  const { error } = await supabase.functions.invoke("log-export-event", {
    body: {
      organization_id: params.organizationId,
      export_type: params.exportType,
      file_name: params.fileName,
      row_count: params.rowCount,
    },
  });
  if (error) {
    throw new Error(`Export blocked — audit log failed: ${error.message}`);
  }
}
