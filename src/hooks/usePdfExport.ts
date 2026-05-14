import { useCallback, useState } from "react";
import { logExportEvent } from "@/lib/log-export";

interface ExportPdfArgs {
  blob: Blob;
  fileName: string;
  organizationId: string;
  exportType: string;        // e.g. "payslip_pdf", "invoice_pdf"
  rowCount?: number;
}

/**
 * GBC-13: Download a PDF blob AFTER recording the export in the server-side
 * audit log. If the audit call fails, the file is NOT delivered to the user.
 */
export function usePdfExport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const exportPdf = useCallback(async (args: ExportPdfArgs) => {
    setLoading(true);
    setError(null);
    try {
      // Audit FIRST — this throws on failure and aborts the download.
      await logExportEvent({
        organizationId: args.organizationId,
        exportType: args.exportType,
        fileName: args.fileName,
        rowCount: args.rowCount,
      });

      const url = URL.createObjectURL(args.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = args.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { exportPdf, loading, error };
}

export default usePdfExport;
