import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "@/hooks/use-toast";
import { verifyPdfSignature } from "@/lib/pdfSignatureVerifier";

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
    .from("invoice-pdfs")
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

      // Guard: don't re-initiate if already verified
      const { data: current } = await supabase
        .from("invoices")
        .select("signing_status")
        .eq("id", invoiceId)
        .single();

      if ((current as any)?.signing_status === "verified") {
        throw new Error("This invoice is already signed.");
      }

      // Generate PDF via existing Edge Function
      const pdfBlob = await fetchInvoicePdfBytes(invoiceId);

      // Upload to Supabase Storage
      const storagePath = `${orgId}/invoices/${invoiceId}/original.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("invoice-pdfs")
        .upload(storagePath, pdfBlob, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

      // Update invoice signing state
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          signing_status: "pending_download",
          original_pdf_path: storagePath,
          signing_initiated_at: new Date().toISOString(),
        } as any)
        .eq("id", invoiceId);

      if (updateError) throw new Error(`Failed to update invoice: ${updateError.message}`);

      return { storagePath, orgId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not initiate signing",
        description: error.message,
        variant: "destructive",
      });
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

      if (error) throw new Error(error.message);
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

      const storagePath = `${orgId}/invoices/${invoiceId}/signed.pdf`;

      // Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from("invoice-pdfs")
        .upload(storagePath, file, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      // Mark as verifying
      await supabase
        .from("invoices")
        .update({ signing_status: "verifying", signed_pdf_path: storagePath } as any)
        .eq("id", invoiceId);

      // Verify digital signature (browser-side, no external dependencies)
      const result = await verifyPdfSignature(file);

      if (result.hasSig) {
        await supabase
          .from("invoices")
          .update({
            signing_status: "verified",
            signing_completed_at: new Date().toISOString(),
            signing_failure_reason: null,
          } as any)
          .eq("id", invoiceId);
      } else {
        await supabase
          .from("invoices")
          .update({
            signing_status: "failed",
            signing_failure_reason: result.reason ?? "No digital signature found.",
          } as any)
          .eq("id", invoiceId);
      }

      return { verified: result.hasSig, reason: result.reason };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
