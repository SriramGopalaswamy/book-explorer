import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScanLine, Plus, Search, Upload, Loader2, Sparkles, MoreHorizontal, Trash2,
  Eye, ExternalLink, CheckCircle2, Clock, AlertCircle, FileText, X,
  AlertTriangle, Building2, Calendar, ChevronDown, FileCheck, Receipt,
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  hsn_sac?: string;
  unit?: string;
}

interface TaxBreakdown {
  label: string;
  rate?: number;
  amount: number;
}

interface AIExtracted {
  vendor_name?: string;
  vendor_address?: string;
  vendor_tax_number?: string;
  bill_number?: string;
  bill_date?: string;
  due_date?: string;
  payment_terms?: string;
  currency?: string;
  subtotal?: number;
  tax_amount?: number;
  tax_breakdown?: TaxBreakdown[];
  total_amount?: number;
  ap_category?: string;
  line_items?: LineItem[];
  notes?: string;
  confidence?: "high" | "medium" | "low";
  extraction_warnings?: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  draft:    { label: "Draft",    className: "bg-muted text-muted-foreground border-border",           icon: FileText },
  received: { label: "Received", className: "bg-primary/10 text-primary border-primary/30",           icon: Receipt },
  approved: { label: "Approved", className: "bg-secondary/30 text-secondary-foreground border-border", icon: CheckCircle2 },
  paid:     { label: "Paid",     className: "bg-accent/40 text-accent-foreground border-accent/50",   icon: CheckCircle2 },
  overdue:  { label: "Overdue",  className: "bg-destructive/15 text-destructive border-destructive/30", icon: AlertCircle },
};

const CONFIDENCE_CONFIG = {
  high:   { className: "bg-secondary/20 text-secondary-foreground border-border", label: "High confidence" },
  medium: { className: "bg-accent/20 text-accent-foreground border-accent/40",   label: "Medium confidence" },
  low:    { className: "bg-destructive/15 text-destructive border-destructive/30", label: "Low confidence — review carefully" },
};

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const AP_CATEGORIES = [
  "Rent & Facilities", "Utilities", "Software & Subscriptions", "Marketing & Advertising",
  "Professional Services", "Office Supplies & Stationery", "Travel & Transport",
  "Meals & Entertainment", "Equipment & Hardware", "Inventory & Raw Materials",
  "Insurance", "Maintenance & Repairs", "Logistics & Shipping", "Telecommunications",
  "Training & Education", "Salaries & Payroll", "Tax & Compliance",
  "Banking & Finance Charges", "Other",
];

const EMPTY_FORM = {
  vendor_name: "",
  bill_number: "",
  bill_date: new Date().toISOString().split("T")[0],
  due_date: "",
  amount: "",
  tax_amount: "0",
  notes: "",
  status: "received",
  ap_category: "",
  payment_terms: "",
  vendor_tax_number: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function isOverdue(bill: any) {
  return bill.due_date && bill.status !== "paid" && new Date(bill.due_date) < new Date();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-xl font-bold ${accent ?? ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.className} capitalize`}>
      <cfg.icon className="h-2.5 w-2.5" />
      {cfg.label}
    </Badge>
  );
}

// ─── Scan/Upload Drop Zone ─────────────────────────────────────────────────────

function DropZone({
  onFile,
  uploading,
  extracting,
  uploadedFile,
  aiExtracted,
  confidence,
  warnings,
}: {
  onFile: (f: File) => void;
  uploading: boolean;
  extracting: boolean;
  uploadedFile: { name: string } | null;
  aiExtracted: boolean;
  confidence?: "high" | "medium" | "low";
  warnings?: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  const busy = uploading || extracting;

  return (
    <div className="space-y-2">
      <div
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
          ${dragging ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40 hover:bg-muted/10"}
          ${busy ? "pointer-events-none" : ""}`}
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={handleChange} />

        <AnimatePresence mode="wait">
          {uploading && (
            <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Uploading document…</p>
            </motion.div>
          )}
          {extracting && (
            <motion.div key="extracting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2 text-muted-foreground">
              <Sparkles className="h-8 w-8 animate-pulse text-primary" />
              <p className="text-sm font-medium text-foreground">AI scanning your bill…</p>
              <p className="text-xs">Extracting vendor, amounts, dates & line items</p>
            </motion.div>
          )}
          {!busy && uploadedFile && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2">
              {aiExtracted && (
                <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10">
                  <Sparkles className="h-3 w-3 mr-1" /> AI Extracted
                </Badge>
              )}
              <FileCheck className="h-6 w-6 text-secondary-foreground" />
              <p className="text-sm font-medium text-foreground">{uploadedFile.name}</p>
              <p className="text-xs text-muted-foreground">Click or drag to replace</p>
            </motion.div>
          )}
          {!busy && !uploadedFile && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2 text-muted-foreground">
              <Upload className="h-8 w-8 opacity-50" />
              <p className="text-sm font-medium text-foreground">Drop bill or click to upload</p>
              <p className="text-xs">JPG, PNG, WEBP, PDF · Max 20 MB</p>
              <p className="text-xs text-primary/80">AI will auto-fill vendor, amounts & line items</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Confidence banner */}
      {aiExtracted && confidence && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${CONFIDENCE_CONFIG[confidence].className}`}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">{CONFIDENCE_CONFIG[confidence].label}</span>
          <span className="text-muted-foreground">— review all extracted fields before saving</span>
        </motion.div>
      )}

      {/* Extraction warnings */}
      {warnings && warnings.length > 0 && (
        <div className="px-3 py-2 rounded-lg border border-border bg-muted/60 space-y-1">
          <p className="text-xs font-medium text-foreground">Fields requiring review:</p>
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Line Items Editor ─────────────────────────────────────────────────────────

function LineItemsEditor({ items, onChange }: { items: LineItem[]; onChange: (items: LineItem[]) => void }) {
  const update = (idx: number, field: keyof LineItem, val: any) => {
    const next = items.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: val };
      if (field === "quantity" || field === "rate") updated.amount = updated.quantity * updated.rate;
      return updated;
    });
    onChange(next);
  };

  const add = () => onChange([...items, { description: "", quantity: 1, rate: 0, amount: 0 }]);
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-1 text-xs text-muted-foreground px-1">
        <span className="col-span-5">Description</span>
        <span className="col-span-2 text-center">Qty</span>
        <span className="col-span-2 text-center">Rate</span>
        <span className="col-span-2 text-right">Amount</span>
        <span className="col-span-1" />
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-1 items-center">
          <div className="col-span-5">
            <Input
              placeholder="Item description"
              value={item.description}
              onChange={(e) => update(idx, "description", e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="col-span-2">
            <Input
              type="number"
              placeholder="Qty"
              value={item.quantity}
              onChange={(e) => update(idx, "quantity", Number(e.target.value))}
              className="h-8 text-sm text-center"
            />
          </div>
          <div className="col-span-2">
            <Input
              type="number"
              placeholder="Rate"
              value={item.rate}
              onChange={(e) => update(idx, "rate", Number(e.target.value))}
              className="h-8 text-sm text-right"
            />
          </div>
          <div className="col-span-2 text-sm font-medium text-right text-muted-foreground pr-1">
            {fmt(item.amount)}
          </div>
          <div className="col-span-1 flex justify-center">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => remove(idx)}
              disabled={items.length === 1}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={add}>
        + Add line item
      </Button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Bills() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: isFinance, isLoading: roleLoading } = useIsFinance();

  // List state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewBill, setPreviewBill] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Upload / AI state
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ path: string; name: string; type: string } | null>(null);
  const [aiExtracted, setAiExtracted] = useState(false);
  const [aiConfidence, setAiConfidence] = useState<"high" | "medium" | "low" | undefined>();
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [taxBreakdown, setTaxBreakdown] = useState<TaxBreakdown[]>([]);

  // Form state
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, rate: 0, amount: 0 }]);

  // ─── Data ──────────────────────────────────────────────────────────────────

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["bills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("*, bill_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("id,name").order("name");
      return data ?? [];
    },
  });

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.vendor_name.trim()) throw new Error("Vendor name is required");
      if (!form.amount) throw new Error("Amount is required");

      const subtotal = parseFloat(form.amount) || 0;
      const tax = parseFloat(form.tax_amount) || 0;
      const total = subtotal + tax;
      const billNum = form.bill_number || `BILL-${Date.now().toString().slice(-6)}`;

      const { data: bill, error } = await supabase
        .from("bills")
        .insert({
          vendor_name: form.vendor_name.trim(),
          bill_number: billNum,
          bill_date: form.bill_date,
          due_date: form.due_date || null,
          amount: subtotal,
          tax_amount: tax,
          total_amount: total,
          notes: form.notes || null,
          status: form.status,
          attachment_url: uploadedFile?.path || null,
          ai_extracted: aiExtracted,
          user_id: user!.id,
        })
        .select()
        .single();

      if (error) throw error;

      const validItems = lineItems.filter((i) => i.description.trim());
      if (validItems.length > 0) {
        const { error: itemsError } = await supabase.from("bill_items").insert(
          validItems.map((i) => ({
            bill_id: bill.id,
            description: i.description,
            quantity: i.quantity,
            rate: i.rate,
            amount: i.amount,
          }))
        );
        if (itemsError) console.error("Failed to save line items:", itemsError);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      toast.success("Bill saved successfully");
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("bill_items").delete().eq("bill_id", id);
      const { error } = await supabase.from("bills").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      toast.success("Bill deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("bills").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const closeDialog = () => {
    setDialogOpen(false);
    setForm({ ...EMPTY_FORM });
    setLineItems([{ description: "", quantity: 1, rate: 0, amount: 0 }]);
    setUploadedFile(null);
    setAiExtracted(false);
    setAiConfidence(undefined);
    setAiWarnings([]);
    setTaxBreakdown([]);
  };

  const openPreview = async (bill: any) => {
    setPreviewBill(bill);
    setPreviewUrl(null);
    if (bill.attachment_url) {
      const { data } = await supabase.storage
        .from("bill-attachments")
        .createSignedUrl(bill.attachment_url, 3600);
      setPreviewUrl(data?.signedUrl ?? null);
    }
  };

  // ─── File handler ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    if (!user) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Please upload a JPG, PNG, WEBP or PDF file");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File must be under 20 MB");
      return;
    }

    setUploading(true);
    setAiExtracted(false);
    setAiConfidence(undefined);
    setAiWarnings([]);

    try {
      const ext = file.name.split(".").pop();
      const path = `bills/${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("bill-attachments")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;

      setUploadedFile({ path, name: file.name, type: file.type });
      setUploading(false);
      setExtracting(true);
      toast.info("Uploaded. AI is reading your bill…");

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = (ev.target?.result as string)?.split(",")[1];
        if (!base64) { setExtracting(false); return; }

        try {
          const { data: session } = await supabase.auth.getSession();
          const token = session?.session?.access_token;

          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-bill`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ base64Data: base64, mimeType: file.type, fileName: file.name }),
            }
          );

          if (res.status === 429) { toast.error("AI rate limit exceeded. Please try again shortly."); return; }
          if (res.status === 402) { toast.error("AI credits exhausted. Please add credits to your workspace."); return; }

          const result = await res.json();
          if (!result.success || !result.extracted) {
            toast.warning(result.error ?? "AI could not extract details. Please fill in manually.");
            return;
          }

          const ex: AIExtracted = result.extracted;
          setAiExtracted(true);
          setAiConfidence(ex.confidence);
          setAiWarnings(ex.extraction_warnings ?? []);
          if (ex.tax_breakdown?.length) setTaxBreakdown(ex.tax_breakdown);

          setForm((p) => ({
            ...p,
            vendor_name:       ex.vendor_name    ?? p.vendor_name,
            bill_number:       ex.bill_number    ?? p.bill_number,
            bill_date:         ex.bill_date      ?? p.bill_date,
            due_date:          ex.due_date       ?? p.due_date,
            amount:            ex.subtotal !== undefined ? String(ex.subtotal) : (ex.total_amount !== undefined ? String(ex.total_amount) : p.amount),
            tax_amount:        ex.tax_amount !== undefined ? String(ex.tax_amount) : p.tax_amount,
            notes:             ex.notes          ?? p.notes,
            ap_category:       ex.ap_category    ?? p.ap_category,
            payment_terms:     ex.payment_terms  ?? p.payment_terms,
            vendor_tax_number: ex.vendor_tax_number ?? p.vendor_tax_number,
          }));

          if (ex.line_items?.length) {
            setLineItems(
              ex.line_items.map((i) => ({
                description: i.description ?? "",
                quantity:    i.quantity    ?? 1,
                rate:        i.rate        ?? (i.amount ?? 0),
                amount:      i.amount      ?? 0,
                hsn_sac:     i.hsn_sac,
                unit:        i.unit,
              }))
            );
          }

          const confidenceLabel = ex.confidence === "high" ? "high accuracy" : ex.confidence === "medium" ? "medium accuracy — review highlighted fields" : "low accuracy — please verify all fields";
          toast.success(`AI extraction complete (${confidenceLabel})`);
        } catch {
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

  // ─── Derived data ──────────────────────────────────────────────────────────

  if (roleLoading) return null;
  if (!isFinance) return <AccessDenied />;

  const enriched = bills.map((b: any) => ({
    ...b,
    effectiveStatus: isOverdue(b) ? "overdue" : b.status,
  }));

  const filtered = enriched.filter((b: any) => {
    const matchSearch =
      b.vendor_name?.toLowerCase().includes(search.toLowerCase()) ||
      b.bill_number?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || b.effectiveStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPending  = bills.filter((b: any) => ["received", "approved"].includes(b.status)).reduce((s: number, b: any) => s + Number(b.total_amount), 0);
  const totalOverdue  = enriched.filter((b: any) => b.effectiveStatus === "overdue").reduce((s: number, b: any) => s + Number(b.total_amount), 0);
  const totalPaid     = bills.filter((b: any) => b.status === "paid").reduce((s: number, b: any) => s + Number(b.total_amount), 0);
  const aiScanned     = bills.filter((b: any) => b.ai_extracted).length;

  const subtotal  = parseFloat(form.amount) || 0;
  const tax       = parseFloat(form.tax_amount) || 0;
  const grandTotal = subtotal + tax;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <MainLayout title="Bills" subtitle="Accounts payable — vendor bill management with AI scanning">
      <div className="space-y-6">

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Bills"       value={bills.length}         sub={`${aiScanned} AI scanned`} />
          <StatCard label="Pending Payment"   value={fmt(totalPending)}    sub="received + approved" />
          <StatCard label="Overdue"           value={fmt(totalOverdue)}    accent="text-destructive" />
          <StatCard label="Paid (All Time)"   value={fmt(totalPaid)}       accent="text-emerald-400" />
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vendor or bill #…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => { closeDialog(); setDialogOpen(true); }} className="gap-2 shrink-0">
            <ScanLine className="h-4 w-4" />
            Scan / Add Bill
          </Button>
        </div>

        {/* ── Table ── */}
        <Card className="border-border/50 bg-card/60 overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground text-sm gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading bills…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                <Receipt className="h-12 w-12 opacity-30" />
                <p className="text-sm font-medium">No bills found</p>
                <p className="text-xs">Scan a vendor bill or invoice to get started</p>
                <Button size="sm" variant="outline" onClick={() => { closeDialog(); setDialogOpen(true); }} className="mt-1">
                  <ScanLine className="h-3.5 w-3.5 mr-1.5" /> Scan Bill
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs">Bill #</TableHead>
                    <TableHead className="text-xs">Vendor</TableHead>
                    <TableHead className="text-xs">Sub-total</TableHead>
                    <TableHead className="text-xs">Tax</TableHead>
                    <TableHead className="text-xs">Total</TableHead>
                    <TableHead className="text-xs">Bill Date</TableHead>
                    <TableHead className="text-xs">Due Date</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-right text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((b: any) => (
                    <TableRow key={b.id} className="border-border/30 hover:bg-muted/20">
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm text-foreground">{b.bill_number}</span>
                          {b.ai_extracted && (
                            <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 text-xs px-1 py-0">
                              <Sparkles className="h-2.5 w-2.5" />
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-sm max-w-[160px] truncate">{b.vendor_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmt(Number(b.amount))}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmt(Number(b.tax_amount))}</TableCell>
                      <TableCell className="font-semibold text-sm">{fmt(Number(b.total_amount))}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{b.bill_date}</TableCell>
                      <TableCell className={`text-xs ${b.effectiveStatus === "overdue" ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                        {b.due_date || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={b.effectiveStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openPreview(b)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {b.status === "draft" && (
                                <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: b.id, status: "received" })}>
                                  <Receipt className="h-4 w-4 mr-2 text-primary" /> Mark Received
                                </DropdownMenuItem>
                              )}
                              {b.status === "received" && (
                                <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: b.id, status: "approved" })}>
                                  <FileCheck className="h-4 w-4 mr-2 text-secondary-foreground" /> Approve
                                </DropdownMenuItem>
                              )}
                              {(b.status === "approved" || b.status === "overdue") && (
                                <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: b.id, status: "paid" })}>
                                  <CheckCircle2 className="h-4 w-4 mr-2 text-accent-foreground" /> Mark Paid
                                </DropdownMenuItem>
                              )}
                              {b.status !== "paid" && b.status !== "approved" && (
                                <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: b.id, status: "paid" })}>
                                  <CheckCircle2 className="h-4 w-4 mr-2 text-accent-foreground" /> Mark Paid
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => deleteMutation.mutate(b.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ════════════ Add / Scan Bill Dialog ════════════ */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              {aiExtracted ? "AI-Scanned Bill — Review & Save" : "Add Vendor Bill"}
            </DialogTitle>
            <DialogDescription>
              Upload a bill image or PDF for AI extraction, or enter details manually.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Drop zone */}
            <DropZone
              onFile={handleFile}
              uploading={uploading}
              extracting={extracting}
              uploadedFile={uploadedFile}
              aiExtracted={aiExtracted}
              confidence={aiConfidence}
              warnings={aiWarnings}
            />

            <Separator />

            {/* Core fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Vendor Name *</Label>
                <Input
                  list="vendor-list-bills"
                  value={form.vendor_name}
                  onChange={(e) => setForm((p) => ({ ...p, vendor_name: e.target.value }))}
                  placeholder="e.g. Acme Supplies Pvt. Ltd."
                />
                <datalist id="vendor-list-bills">
                  {vendors.map((v: any) => <option key={v.id} value={v.name} />)}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <Label>Bill / Invoice Number</Label>
                <Input
                  value={form.bill_number}
                  onChange={(e) => setForm((p) => ({ ...p, bill_number: e.target.value }))}
                  placeholder="Auto-generated if blank"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Vendor GST / Tax Number</Label>
                <Input
                  value={form.vendor_tax_number}
                  onChange={(e) => setForm((p) => ({ ...p, vendor_tax_number: e.target.value }))}
                  placeholder="e.g. 22ABCDE1234F1Z5"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Bill Date</Label>
                <Input
                  type="date"
                  value={form.bill_date}
                  onChange={(e) => setForm((p) => ({ ...p, bill_date: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>AP Category</Label>
                <Select value={form.ap_category} onValueChange={(v) => setForm((p) => ({ ...p, ap_category: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {AP_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).filter(([k]) => k !== "overdue").map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Payment Terms</Label>
                <Input
                  value={form.payment_terms}
                  onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))}
                  placeholder="e.g. Net 30, Due on Receipt"
                />
              </div>
            </div>

            <Separator />

            {/* Amounts */}
            <div>
              <p className="text-sm font-medium mb-3">Amounts</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Sub-total *</Label>
                  <Input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tax Amount (GST / VAT)</Label>
                  <Input
                    type="number"
                    value={form.tax_amount}
                    onChange={(e) => setForm((p) => ({ ...p, tax_amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* AI tax breakdown */}
              {taxBreakdown.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-muted/40 border border-border/50 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">AI-extracted tax breakdown</p>
                  {taxBreakdown.map((t, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{t.label}{t.rate ? ` (${t.rate}%)` : ""}</span>
                      <span className="font-medium">{fmt(t.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {(subtotal > 0 || tax > 0) && (
                <div className="mt-3 flex justify-end">
                  <div className="text-right space-y-0.5">
                    {subtotal > 0 && <p className="text-xs text-muted-foreground">Sub-total: {fmt(subtotal)}</p>}
                    {tax > 0 && <p className="text-xs text-muted-foreground">Tax: {fmt(tax)}</p>}
                    <p className="text-base font-bold">Total: {fmt(grandTotal)}</p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Line items */}
            <div>
              <p className="text-sm font-medium mb-3">Line Items</p>
              <LineItemsEditor items={lineItems} onChange={setLineItems} />
            </div>

            <Separator />

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Internal Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                placeholder="Purchase order reference, internal comments…"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || uploading || extracting}
              className="gap-2"
            >
              {saveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Save Bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════ Preview Dialog ════════════ */}
      {previewBill && (
        <Dialog open={!!previewBill} onOpenChange={(v) => { if (!v) { setPreviewBill(null); setPreviewUrl(null); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {previewBill.bill_number}
                {previewBill.ai_extracted && (
                  <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 ml-1">
                    <Sparkles className="h-3 w-3 mr-1" /> AI
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Header info */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">{previewBill.vendor_name}</p>
                  <p className="text-xs text-muted-foreground">Bill Date: {previewBill.bill_date}</p>
                </div>
                <StatusBadge status={isOverdue(previewBill) ? "overdue" : previewBill.status} />
              </div>

              <Separator />

              {/* Amount breakdown */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sub-total</span>
                  <span>{fmt(Number(previewBill.amount))}</span>
                </div>
                {Number(previewBill.tax_amount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span>{fmt(Number(previewBill.tax_amount))}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>{fmt(Number(previewBill.total_amount))}</span>
                </div>
              </div>

              {/* Due date */}
              {previewBill.due_date && (
                <div className={`flex items-center gap-2 text-sm ${isOverdue(previewBill) ? "text-destructive" : "text-muted-foreground"}`}>
                  <Calendar className="h-4 w-4" />
                  Due: {previewBill.due_date}
                  {isOverdue(previewBill) && <Badge variant="outline" className="border-destructive/30 text-destructive text-xs">Overdue</Badge>}
                </div>
              )}

              {/* Notes */}
              {previewBill.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm bg-muted/40 rounded p-2">{previewBill.notes}</p>
                </div>
              )}

              {/* Line items */}
              {previewBill.bill_items?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Line Items ({previewBill.bill_items.length})</p>
                  <div className="border border-border/50 rounded-lg overflow-hidden">
                    {previewBill.bill_items.map((i: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm border-b border-border/30 last:border-0 hover:bg-muted/20">
                        <span className="flex-1 text-foreground">{i.description}</span>
                        <span className="text-muted-foreground text-xs mx-3">{i.quantity} × {fmt(i.rate)}</span>
                        <span className="font-medium">{fmt(i.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attachment */}
              {previewBill.attachment_url && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Attachment</p>
                  {previewUrl ? (
                    previewBill.attachment_url.endsWith(".pdf") ? (
                      <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                        <ExternalLink className="h-4 w-4" /> Open PDF
                      </a>
                    ) : (
                      <img src={previewUrl} alt="Bill attachment" className="rounded-lg max-h-64 object-contain border border-border w-full" />
                    )
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading attachment…
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 flex-wrap">
              {previewBill.status === "received" && (
                <Button variant="outline" className="border-secondary/40 text-secondary-foreground hover:bg-secondary/10"
                  onClick={() => { updateStatusMutation.mutate({ id: previewBill.id, status: "approved" }); setPreviewBill(null); }}>
                  <FileCheck className="h-4 w-4 mr-1" /> Approve
                </Button>
              )}
              {previewBill.status !== "paid" && (
                <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => { updateStatusMutation.mutate({ id: previewBill.id, status: "paid" }); setPreviewBill(null); }}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Paid
                </Button>
              )}
              <Button variant="outline" onClick={() => { setPreviewBill(null); setPreviewUrl(null); }}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </MainLayout>
  );
}
