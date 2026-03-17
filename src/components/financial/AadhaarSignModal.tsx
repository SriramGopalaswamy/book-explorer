import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Download,
  Upload,
  Loader2,
  ShieldCheck,
  FileText,
  X,
  ArrowRight,
} from "lucide-react";
import { Invoice } from "@/hooks/useInvoices";
import {
  useInitiateAadhaarSign,
  useMarkPendingUpload,
  useUploadSignedPdf,
  getInvoicePdfSignedUrl,
} from "@/hooks/useAadhaarSign";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type Step = "initiate" | "download" | "upload" | "verifying" | "done" | "failed";

function getInitialStep(signingStatus: Invoice["signing_status"]): Step {
  switch (signingStatus) {
    case "pending_download": return "download";
    case "pending_upload":   return "upload";
    case "failed":           return "upload";
    case "verified":         return "done";
    default:                 return "initiate";
  }
}

interface AadhaarSignModalProps {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export function AadhaarSignModal({ invoice, open, onOpenChange }: AadhaarSignModalProps) {
  const [step, setStep] = useState<Step>(() => getInitialStep(invoice.signing_status));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ verified: boolean; reason?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initiateSign = useInitiateAadhaarSign();
  const markPendingUpload = useMarkPendingUpload();
  const uploadSignedPdf = useUploadSignedPdf();

  // Reset step when modal reopens for a different signing status
  const handleOpenChange = useCallback((o: boolean) => {
    if (o) setStep(getInitialStep(invoice.signing_status));
    onOpenChange(o);
  }, [invoice.signing_status, onOpenChange]);

  // ── Step handlers ─────────────────────────────────────────

  async function handleBegin() {
    try {
      await initiateSign.mutateAsync({ invoiceId: invoice.id });
      setStep("download");
    } catch {
      // error toast handled in hook
    }
  }

  async function handleDownloadPdf() {
    const path = invoice.original_pdf_path;
    if (!path) {
      toast({ title: "PDF not ready", description: "Please click Begin again.", variant: "destructive" });
      return;
    }
    try {
      const url = await getInvoicePdfSignedUrl(path);
      window.open(url, "_blank");
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    }
  }

  async function handleIveSigned() {
    await markPendingUpload.mutateAsync({ invoiceId: invoice.id });
    setStep("upload");
  }

  function handleFileSelect(file: File) {
    if (file.type !== "application/pdf") {
      toast({ title: "Wrong file type", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
  }

  async function handleVerifySubmit() {
    if (!selectedFile) return;
    setStep("verifying");
    try {
      const result = await uploadSignedPdf.mutateAsync({
        invoiceId: invoice.id,
        file: selectedFile,
      });
      setVerificationResult(result);
      setStep(result.verified ? "done" : "failed");
    } catch {
      setStep("failed");
    }
  }

  async function handleDownloadSignedPdf() {
    const path = invoice.signed_pdf_path;
    if (!path) return;
    try {
      const url = await getInvoicePdfSignedUrl(path);
      window.open(url, "_blank");
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    }
  }

  // File size mismatch warning (heuristic: same size = likely original)
  const fileLooksLikeOriginal =
    selectedFile &&
    invoice.original_pdf_path &&
    selectedFile.size > 0 &&
    selectedFile.size === (selectedFile as any)._originalSize;

  // ── Render ───────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">

        {/* ── Step 1: Initiate ─────────────────────────────── */}
        {step === "initiate" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                Sign Invoice with Aadhaar eSign
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                You are about to initiate Aadhaar-based digital signing for:
              </p>
              <div className="rounded-md border bg-muted/40 px-4 py-3">
                <p className="font-semibold">{invoice.invoice_number}</p>
                <p className="text-sm text-muted-foreground">{invoice.client_name}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">This process has 3 steps:</p>
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 pl-1">
                  <li>Download the invoice PDF</li>
                  <li>Sign it via DigiLocker (outside this app)</li>
                  <li>Upload the signed PDF back here</li>
                </ol>
              </div>

              <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Aadhaar eSign is legally valid under the IT Act, 2000. Signing happens
                securely via the DigiLocker / NeSL portal — no Aadhaar data is shared
                with this application.
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleBegin} disabled={initiateSign.isPending}>
                {initiateSign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Begin — Download PDF
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 2: Download ─────────────────────────────── */}
        {step === "download" && (
          <>
            <DialogHeader>
              <DialogTitle>Step 1 of 3 — Download Your Invoice PDF</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Your invoice PDF has been prepared and is ready to download.
              </p>

              <Button className="w-full" variant="outline" onClick={handleDownloadPdf}>
                <Download className="mr-2 h-4 w-4" /> Download Invoice PDF
              </Button>

              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">Next: Sign via DigiLocker</p>
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 pl-1">
                  <li>Open <strong>digilocker.gov.in</strong> or the DigiLocker mobile app</li>
                  <li>Go to "eSign Document" or use the NeSL eSign portal</li>
                  <li>Upload the PDF you just downloaded</li>
                  <li>Complete Aadhaar OTP authentication</li>
                  <li>Download the signed PDF from DigiLocker</li>
                </ol>
              </div>

              <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                DigiLocker eSign is free for Indian citizens. Your Aadhaar OTP is used
                only by UIDAI — it is never transmitted to or stored in this application.
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("initiate")}>Back</Button>
              <Button onClick={handleIveSigned} disabled={markPendingUpload.isPending}>
                {markPendingUpload.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                I've signed it — Upload Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 3: Upload ───────────────────────────────── */}
        {step === "upload" && (
          <>
            <DialogHeader>
              <DialogTitle>Step 2 of 3 — Upload the Signed PDF</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Upload the signed PDF you received from DigiLocker.
              </p>

              {/* Drop zone */}
              <div
                className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
                  isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleFileSelect(f);
                }}
              >
                <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Drop your signed PDF here, or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Only PDF files accepted · Maximum 10 MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
              </div>

              {/* Selected file chip */}
              {selectedFile && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1 truncate">
                    {selectedFile.name}
                    <span className="text-muted-foreground ml-2">
                      ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  </span>
                  <button onClick={() => setSelectedFile(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Same-size warning */}
              {fileLooksLikeOriginal && (
                <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  This file appears identical to the original. Please ensure you upload
                  the signed version from DigiLocker, not the original download.
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("download")}>Back</Button>
              <Button onClick={handleVerifySubmit} disabled={!selectedFile}>
                Verify & Submit
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 4: Verifying ────────────────────────────── */}
        {step === "verifying" && (
          <>
            <DialogHeader>
              <DialogTitle>Verifying Digital Signature...</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground text-center">
                Checking the uploaded PDF for a valid digital signature.
                <br />
                This usually takes less than a second.
              </p>
            </div>
          </>
        )}

        {/* ── Step 5a: Done (verified) ─────────────────────── */}
        {step === "done" && (
          <>
            <DialogHeader>
              <DialogTitle>Invoice Successfully Signed</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col items-center py-6 space-y-4">
              <CheckCircle2 className="h-14 w-14 text-emerald-500" />

              <div className="rounded-md border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 w-full">
                The Aadhaar eSign has been recorded for{" "}
                <strong>{invoice.invoice_number}</strong>. The signed PDF is securely
                stored and can be downloaded at any time.
              </div>

              {invoice.signing_completed_at && (
                <p className="text-sm text-muted-foreground">
                  Signed on:{" "}
                  <strong>
                    {format(new Date(invoice.signing_completed_at), "d MMM yyyy, h:mm a")}
                  </strong>
                </p>
              )}

              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
                <ShieldCheck className="mr-1 h-3 w-3" /> eSigned
              </Badge>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleDownloadSignedPdf}>
                <Download className="mr-2 h-4 w-4" /> Download Signed PDF
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 5b: Failed ──────────────────────────────── */}
        {step === "failed" && (
          <>
            <DialogHeader>
              <DialogTitle>Signature Verification Failed</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col items-center py-4 space-y-4">
              <XCircle className="h-14 w-14 text-destructive" />

              <p className="text-sm text-center text-muted-foreground">
                We could not confirm a valid digital signature in the uploaded PDF.
              </p>

              {(verificationResult?.reason || invoice.signing_failure_reason) && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive w-full">
                  <strong>Reason:</strong>{" "}
                  {verificationResult?.reason ?? invoice.signing_failure_reason}
                </div>
              )}

              <div className="w-full rounded-md border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-medium mb-1">Common causes:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>You uploaded the original unsigned PDF by mistake</li>
                  <li>The signing process was not completed in DigiLocker</li>
                  <li>The PDF was re-saved or modified after signing</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedFile(null);
                  setVerificationResult(null);
                  setStep("upload");
                }}
              >
                Try Again — Re-upload
              </Button>
              <Button variant="destructive" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
