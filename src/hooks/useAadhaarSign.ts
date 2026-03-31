import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";
import { verifyPdfSignature } from "@/lib/pdfSignatureVerifier";

// Storage bucket — uses the existing invoice-assets bucket (private, finance/admin upload policy).
// Once the DB migration 20260317200000_add_aadhaar_esign.sql is applied via the Supabase SQL Editor,
// a dedicated invoice-pdfs bucket can be used instead. For now, invoice-assets works correctly.
const SIGNING_BUCKET = "invoice-assets";

// ─────────────────────────────────────────────────────────────
// Helper: silently handle missing-column DB errors (pre-migration)
// PostgreSQL error code 42703 = "undefined_column"
// ─────────────────────────────────────────────────────────────
function isMissingColumnError(err: { code?: string; message?: string } | null): boolean {
  return err?.code === "42703" || (err?.message?.includes("column") && err?.message?.includes("does not exist")) === true;
}

let _migrationWarningShown = false;
function warnMigrationNeeded() {
  if (_migrationWarningShown) return;
  _migrationWarningShown = true;
  toast("Database migration pending", {
    description:
      "Apply migration 20260317200000_add_aadhaar_esign.sql in the Supabase SQL Editor to enable full signing status tracking.",
  });
}

// ─────────────────────────────────────────────────────────────
// Helper: fetch PDF bytes from the existing Edge Function
// ─────────────────────────────────────────────────────────────
async function fetchInvoicePdfBytes(invoiceId: string): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-invoice-pdf`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ invoiceId }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `Failed to generate PDF (${response.status})`);
  }

  return response.blob();
}

// ─────────────────────────────────────────────────────────────
// Helper: get a short-lived signed URL for a storage path
// ─────────────────────────────────────────────────────────────
export async function getInvoicePdfSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(SIGNING_BUCKET)
    .createSignedUrl(storagePath, 120); // 2-minute TTL

  if (error || !data?.signedUrl) {
    throw new Error("Could not generate download link. Please try again.");
  }
  return data.signedUrl;
}

// ─────────────────────────────────────────────────────────────
// Mutation 1: Initiate signing — generate & store original PDF
// ─────────────────────────────────────────────────────────────
export function useInitiateAadhaarSign() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();

  return useMutation({
    mutationFn: async ({ invoiceId }: { invoiceId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const orgId = orgData?.organizationId;
      if (!orgId) throw new Error("Organisation not found");

      // Guard: don't re-initiate if already verified.
      // Use select("*") so this doesn't fail when signing_status column is missing.
      const { data: current } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      if ((current as any)?.signing_status === "verified") {
        throw new Error("This invoice is already signed.");
      }

      // Generate PDF via existing Edge Function
      const pdfBlob = await fetchInvoicePdfBytes(invoiceId);

      // Upload to Supabase Storage (invoice-assets bucket — always exists)
      const storagePath = `esign/${orgId}/${invoiceId}/original.pdf`;
      const { error: uploadError } = await supabase.storage
        .from(SIGNING_BUCKET)
        .upload(storagePath, pdfBlob, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

      // Update invoice signing state — silently skip if columns not yet migrated
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          signing_status: "pending_download",
          original_pdf_path: storagePath,
          signing_initiated_at: new Date().toISOString(),
        } as any)
        .eq("id", invoiceId);

      if (updateError) {
        if (isMissingColumnError(updateError)) {
          warnMigrationNeeded();
          // Proceed without DB persistence — storage upload succeeded
        } else {
          throw new Error(`Failed to update invoice: ${updateError.message}`);
        }
      }

      return { storagePath, orgId, pdfSize: pdfBlob.size };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Mutation 2: Advance status to pending_upload
// (called when user clicks "I've signed it — Upload Now")
// ─────────────────────────────────────────────────────────────
export function useMarkPendingUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceId }: { invoiceId: string }) => {
      const { error } = await supabase
        .from("invoices")
        .update({ signing_status: "pending_upload" } as any)
        .eq("id", invoiceId);

      if (error && !isMissingColumnError(error)) {
        throw new Error(error.message);
      }
      if (error) warnMigrationNeeded();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Mutation 3: Upload signed PDF + verify signature
// ─────────────────────────────────────────────────────────────
export function useUploadSignedPdf() {
  const queryClient = useQueryClient();
  const { data: orgData } = useUserOrganization();

  return useMutation({
    mutationFn: async ({
      invoiceId,
      file,
    }: {
      invoiceId: string;
      file: File;
    }) => {
      const orgId = orgData?.organizationId;
      if (!orgId) throw new Error("Organisation not found");

      // Guards
      if (file.type !== "application/pdf") {
        throw new Error("Only PDF files are accepted. Please upload the signed PDF from DigiLocker.");
      }
      if (file.size > 10_000_000) {
        throw new Error("File is too large. Signed PDFs must be under 10 MB.");
      }

      const storagePath = `esign/${orgId}/${invoiceId}/signed.pdf`;

      // Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from(SIGNING_BUCKET)
        .upload(storagePath, file, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      // Mark as verifying
      const { error: verifyingErr } = await supabase
        .from("invoices")
        .update({ signing_status: "verifying", signed_pdf_path: storagePath } as any)
        .eq("id", invoiceId);

      if (verifyingErr && !isMissingColumnError(verifyingErr)) {
        throw new Error(`Failed to update invoice: ${verifyingErr.message}`);
      }
      if (verifyingErr) warnMigrationNeeded();

      // Verify digital signature (browser-side, no external dependencies)
      const result = await verifyPdfSignature(file);

      if (result.hasSig) {
        const { error: verifiedErr } = await supabase
          .from("invoices")
          .update({
            signing_status: "verified",
            signing_completed_at: new Date().toISOString(),
            signing_failure_reason: null,
          } as any)
          .eq("id", invoiceId);
        if (verifiedErr && !isMissingColumnError(verifiedErr)) {
          throw new Error(`Failed to record verification: ${verifiedErr.message}`);
        }
      } else {
        const { error: failedErr } = await supabase
          .from("invoices")
          .update({
            signing_status: "failed",
            signing_failure_reason: result.reason ?? "No digital signature found.",
          } as any)
          .eq("id", invoiceId);
        if (failedErr && !isMissingColumnError(failedErr)) {
          throw new Error(`Failed to record verification: ${failedErr.message}`);
        }
      }

      return { verified: result.hasSig, reason: result.reason, signedPdfPath: storagePath };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
