import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  Loader2,
  Sparkles,
  Receipt,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Calendar,
  Building2,
  Tag,
  FileText,
  Eye,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const EXPENSE_CATEGORIES = [
  "Travel & Transport",
  "Meals & Entertainment",
  "Office Supplies",
  "Accommodation",
  "Medical",
  "Training & Development",
  "Communications",
  "Software & Subscriptions",
  "Equipment",
  "Other",
];

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf", "image/heic"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function statusConfig(status: string) {
  const map: Record<string, { label: string; icon: React.ElementType; className: string }> = {
    pending_manager:    { label: "Pending Manager",   icon: Clock,         className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    manager_approved:   { label: "Manager Approved",  icon: CheckCircle2,  className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    manager_rejected:   { label: "Manager Rejected",  icon: XCircle,       className: "bg-red-500/15 text-red-400 border-red-500/30" },
    pending_finance:    { label: "Pending Finance",   icon: Clock,         className: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
    paid:               { label: "Paid / Approved",   icon: CheckCircle2,  className: "bg-green-500/15 text-green-400 border-green-500/30" },
    finance_rejected:   { label: "Finance Rejected",  icon: XCircle,       className: "bg-red-500/15 text-red-400 border-red-500/30" },
  };
  return map[status] ?? { label: status, icon: AlertCircle, className: "bg-muted text-muted-foreground" };
}

export default function Reimbursements() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<any>(null);

  // New submission state
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [form, setForm] = useState({
    vendor_name: "",
    amount: "",
    expense_date: "",
    category: "",
    description: "",
  });
  const [aiExtracted, setAiExtracted] = useState(false);
  const [aiRawData, setAiRawData] = useState<any>(null);

  // Fetch own reimbursements
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["my-reimbursements", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("reimbursement_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const resetForm = () => {
    setUploadedFile(null);
    setForm({ vendor_name: "", amount: "", expense_date: "", category: "", description: "" });
    setAiExtracted(false);
    setAiRawData(null);
  };

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  // Step 1: Upload file to storage + call AI extraction
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Please upload a JPG, PNG, WEBP, or PDF file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size must be under 20MB.");
      return;
    }

    setUploading(true);
    try {
      // Upload to storage
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("reimbursement-attachments")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage
        .from("reimbursement-attachments")
        .getPublicUrl(path);

      // Get signed URL for viewing
      const { data: signedData } = await supabase.storage
        .from("reimbursement-attachments")
        .createSignedUrl(path, 3600);

      setUploadedFile({ url: path, name: file.name, type: file.type });
      setUploading(false);
      setExtracting(true);
      toast.info("File uploaded. AI is reading your document…");

      // Convert file to base64 for AI
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = (ev.target?.result as string)?.split(",")[1];
        if (!base64) {
          setExtracting(false);
          toast.error("Could not read file. Please fill in details manually.");
          return;
        }

        try {
          const { data: session } = await supabase.auth.getSession();
          const token = session?.session?.access_token;

          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-reimbursement`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ base64Data: base64, mimeType: file.type, fileName: file.name }),
            }
          );

          if (res.status === 429) {
            toast.warning("AI rate limit reached. Please fill in the details manually.");
            setExtracting(false);
            return;
          }
          if (res.status === 402) {
            toast.warning("AI credits exhausted. Please fill in the details manually.");
            setExtracting(false);
            return;
          }

          const result = await res.json();
          if (result.success && result.extracted) {
            const ex = result.extracted;
            setAiRawData(ex);
            setAiExtracted(true);
            setForm({
              vendor_name: ex.vendor_name || "",
              amount: ex.amount ? String(ex.amount) : "",
              expense_date: ex.expense_date || "",
              category: ex.category || "",
              description: ex.description || "",
            });
            toast.success(`AI extracted details (${ex.confidence} confidence). Please review before submitting.`);
          } else {
            toast.warning(result.error || "AI could not extract details. Please fill in manually.");
          }
        } catch (err) {
          console.warn("AI extraction failed:", err);
          toast.warning("AI extraction failed. Please fill in the details manually.");
        } finally {
          setExtracting(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploading(false);
      setExtracting(false);
      toast.error(`Upload failed: ${err.message}`);
    }
  }, [user]);

  // Step 2: Submit reimbursement request
  const handleSubmit = async () => {
    if (!user || !uploadedFile) {
      toast.error("Please upload a bill document first.");
      return;
    }
    if (!form.vendor_name || !form.amount || !form.category || !form.description) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      // Get user's profile for profile_id and manager lookup
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, manager_id")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: inserted, error } = await supabase
        .from("reimbursement_requests")
        .insert({
          user_id: user.id,
          profile_id: profile?.id ?? null,
          attachment_url: uploadedFile.url,
          file_name: uploadedFile.name,
          file_type: uploadedFile.type,
          vendor_name: form.vendor_name,
          amount: parseFloat(form.amount),
          expense_date: form.expense_date || null,
          category: form.category,
          description: form.description,
          ai_extracted: aiExtracted,
          ai_raw_data: aiRawData,
          status: "pending_manager",
          submitted_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw error;

      // Fire notification to manager
      const insertedId = (inserted as any)?.id;
      supabase.functions.invoke("send-notification-email", {
        body: {
          type: "reimbursement_submitted",
          payload: { reimbursement_id: insertedId },
        },
      }).catch((e) => console.warn("Notification failed:", e));

      toast.success("Reimbursement submitted for manager approval!");
      queryClient.invalidateQueries({ queryKey: ["my-reimbursements"] });
      setDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(`Submission failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const openPreview = async (item: any) => {
    setPreviewItem(item);
    setPreviewOpen(true);
    if (item.attachment_url) {
      const { data } = await supabase.storage
        .from("reimbursement-attachments")
        .createSignedUrl(item.attachment_url, 3600);
      setPreviewUrl(data?.signedUrl ?? null);
    }
  };

  const pendingCount = requests.filter((r: any) => ["pending_manager", "manager_approved", "pending_finance"].includes(r.status)).length;
  const paidCount = requests.filter((r: any) => r.status === "paid").length;
  const totalPaid = requests
    .filter((r: any) => r.status === "paid")
    .reduce((sum: number, r: any) => sum + Number(r.amount), 0);

  return (
    <MainLayout title="My Reimbursements" subtitle="Submit expense bills for reimbursement">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Reimbursements</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Submit expense bills for reimbursement — AI reads your document automatically
            </p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Upload className="h-4 w-4" />
            Submit Expense
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total Submitted", value: requests.length, icon: Receipt, color: "text-blue-400" },
            { label: "Pending Approval", value: pendingCount, icon: Clock, color: "text-yellow-400" },
            { label: "Total Reimbursed", value: `₹${totalPaid.toLocaleString()}`, icon: DollarSign, color: "text-green-400" },
          ].map((s) => (
            <Card key={s.label} className="border-border/50 bg-card/60">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-2 rounded-lg bg-muted/50">
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Requests list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : requests.length === 0 ? (
          <Card className="border-border/50 bg-card/60">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Receipt className="h-10 w-10 opacity-40" />
              <p className="text-sm">No reimbursement requests yet.</p>
              <Button size="sm" variant="outline" onClick={openNew}>Submit your first expense</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((item: any, i: number) => {
              const sc = statusConfig(item.status);
              const Icon = sc.icon;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Card className="border-border/50 bg-card/60 hover:bg-card/80 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground">
                              {item.vendor_name || "Unknown Vendor"}
                            </span>
                            <Badge variant="outline" className={sc.className}>
                              <Icon className="h-3 w-3 mr-1" />
                              {sc.label}
                            </Badge>
                            {item.ai_extracted && (
                              <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs">
                                <Sparkles className="h-3 w-3 mr-1" /> AI Read
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              ₹{Number(item.amount).toLocaleString()}
                            </span>
                            {item.category && (
                              <span className="flex items-center gap-1">
                                <Tag className="h-3 w-3" /> {item.category}
                              </span>
                            )}
                            {item.expense_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {item.expense_date}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Submitted {format(new Date(item.created_at), "dd MMM yyyy")}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-1 italic truncate max-w-xl">
                              {item.description}
                            </p>
                          )}
                          {(item.manager_notes || item.finance_notes) && (
                            <div className="mt-2 space-y-1">
                              {item.manager_notes && (
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-medium">Manager note:</span> {item.manager_notes}
                                </p>
                              )}
                              {item.finance_notes && (
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-medium">Finance note:</span> {item.finance_notes}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0"
                          onClick={() => openPreview(item)}
                        >
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Submit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetForm(); setDialogOpen(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Submit Expense for Reimbursement
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* File Upload */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Bill / Receipt Document <span className="text-red-400">*</span>
              </Label>
              {!uploadedFile ? (
                <div
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm">Uploading file…</p>
                    </div>
                  ) : extracting ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Sparkles className="h-8 w-8 text-purple-400 animate-pulse" />
                      <p className="text-sm font-medium text-purple-400">AI is reading your document…</p>
                      <p className="text-xs">Extracting vendor, amount, and category</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Upload className="h-8 w-8 opacity-60" />
                      <p className="text-sm font-medium">Click to upload bill or receipt</p>
                      <p className="text-xs">JPG, PNG, WEBP or PDF · Max 20MB</p>
                      <p className="text-xs text-purple-400 flex items-center gap-1 mt-1">
                        <Sparkles className="h-3 w-3" /> AI will automatically extract details
                      </p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={uploading || extracting}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                  <FileText className="h-8 w-8 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{uploadedFile.name}</p>
                    {aiExtracted && (
                      <p className="text-xs text-purple-400 flex items-center gap-1 mt-0.5">
                        <Sparkles className="h-3 w-3" /> Details extracted by AI — please review below
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setUploadedFile(null); setAiExtracted(false); setAiRawData(null); }}
                  >
                    Change
                  </Button>
                </div>
              )}
            </div>

            {/* Form fields (shown after upload) */}
            {(uploadedFile || true) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Vendor / Merchant <span className="text-red-400">*</span></Label>
                  <Input
                    placeholder="e.g. Amazon, Air India"
                    value={form.vendor_name}
                    onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount (₹) <span className="text-red-400">*</span></Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Expense Date</Label>
                  <Input
                    type="date"
                    value={form.expense_date}
                    onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Category <span className="text-red-400">*</span></Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>Description / Purpose <span className="text-red-400">*</span></Label>
                  <Textarea
                    placeholder="Brief description of the expense and its business purpose"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
            )}

            {aiExtracted && aiRawData?.confidence && (
              <div className={`flex items-start gap-2 p-3 rounded-lg text-xs border ${
                aiRawData.confidence === "high" 
                  ? "bg-green-500/10 border-green-500/20 text-green-400"
                  : aiRawData.confidence === "medium"
                  ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}>
                <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  AI extraction confidence: <strong className="uppercase">{aiRawData.confidence}</strong>
                  {aiRawData.confidence !== "high" && " — Please verify all extracted fields carefully before submitting."}
                  {aiRawData.notes && ` · ${aiRawData.notes}`}
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || uploading || extracting || !uploadedFile}
            >
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting…</> : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Preview Dialog ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reimbursement Details</DialogTitle>
          </DialogHeader>
          {previewItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: "Vendor", value: previewItem.vendor_name },
                  { label: "Amount", value: `₹${Number(previewItem.amount).toLocaleString()}` },
                  { label: "Category", value: previewItem.category },
                  { label: "Date", value: previewItem.expense_date },
                  { label: "Status", value: statusConfig(previewItem.status).label },
                  { label: "Submitted", value: format(new Date(previewItem.created_at), "dd MMM yyyy") },
                ].map((row) => row.value ? (
                  <div key={row.label}>
                    <p className="text-xs text-muted-foreground">{row.label}</p>
                    <p className="font-medium">{row.value}</p>
                  </div>
                ) : null)}
              </div>
              {previewItem.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">{previewItem.description}</p>
                </div>
              )}
              {previewItem.manager_notes && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-xs text-yellow-400 font-semibold mb-1">Manager Notes</p>
                  <p className="text-sm">{previewItem.manager_notes}</p>
                </div>
              )}
              {previewItem.finance_notes && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs text-blue-400 font-semibold mb-1">Finance Notes</p>
                  <p className="text-sm">{previewItem.finance_notes}</p>
                </div>
              )}
              {previewUrl && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Attached Document</p>
                  {previewItem.file_type?.startsWith("image/") ? (
                    <img src={previewUrl} alt="Receipt" className="rounded-lg max-h-64 object-contain border border-border" />
                  ) : (
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" /> Open PDF in new tab
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
