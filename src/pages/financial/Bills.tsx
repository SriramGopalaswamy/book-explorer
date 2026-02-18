import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ScanLine, Plus, Search, Upload, Loader2, Sparkles, MoreHorizontal, Trash2,
  Calendar, DollarSign, Building2, Tag, Eye, ExternalLink, CheckCircle2, Clock, AlertCircle,
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  received: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  approved: "bg-green-500/15 text-green-400 border-green-500/30",
  paid: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  overdue: "bg-red-500/15 text-red-400 border-red-500/30",
};

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function formatCurrency(v: number) {
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

interface LineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

const emptyForm = {
  vendor_name: "",
  bill_number: "",
  bill_date: new Date().toISOString().split("T")[0],
  due_date: "",
  amount: "",
  tax_amount: "0",
  notes: "",
  status: "draft",
};

export default function Bills() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: isFinance, isLoading: roleLoading } = useIsFinance();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ path: string; name: string; type: string } | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, rate: 0, amount: 0 }]);
  const [aiExtracted, setAiExtracted] = useState(false);

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["bills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bills").select("*, bill_items(*)").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("id,name").order("name");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.vendor_name || !form.amount) throw new Error("Vendor and amount are required");
      const total = parseFloat(form.amount) + parseFloat(form.tax_amount || "0");
      const billNum = form.bill_number || `BILL-${Date.now().toString().slice(-6)}`;

      const { data: bill, error } = await supabase.from("bills").insert({
        vendor_name: form.vendor_name,
        bill_number: billNum,
        bill_date: form.bill_date,
        due_date: form.due_date || null,
        amount: parseFloat(form.amount),
        tax_amount: parseFloat(form.tax_amount || "0"),
        total_amount: total,
        notes: form.notes || null,
        status: form.status,
        attachment_url: uploadedFile?.path || null,
        ai_extracted: aiExtracted,
        user_id: user!.id,
      }).select().single();

      if (error) throw error;

      const validItems = lineItems.filter((i) => i.description.trim());
      if (validItems.length > 0) {
        await supabase.from("bill_items").insert(validItems.map((i) => ({ ...i, bill_id: bill.id })));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      toast.success("Bill saved");
      setDialogOpen(false);
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("bill_items").delete().eq("bill_id", id);
      const { error } = await supabase.from("bills").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bills"] }); toast.success("Bill deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("bills").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bills"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm({ ...emptyForm });
    setLineItems([{ description: "", quantity: 1, rate: 0, amount: 0 }]);
    setUploadedFile(null);
    setAiExtracted(false);
  };

  // Upload + AI extract
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!ACCEPTED_TYPES.includes(file.type)) { toast.error("Upload JPG, PNG, WEBP or PDF"); return; }
    if (file.size > MAX_FILE_SIZE) { toast.error("File must be under 20MB"); return; }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `bills/${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("bill-attachments").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      setUploadedFile({ path, name: file.name, type: file.type });
      setUploading(false);
      setExtracting(true);
      toast.info("File uploaded. AI reading your bill…");

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = (ev.target?.result as string)?.split(",")[1];
        if (!base64) { setExtracting(false); return; }
        try {
          const { data: session } = await supabase.auth.getSession();
          const token = session?.session?.access_token;
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-reimbursement`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ base64Data: base64, mimeType: file.type, fileName: file.name }),
            }
          );
          const result = await res.json();
          if (result.success && result.extracted) {
            const ex = result.extracted;
            setAiExtracted(true);
            setForm((p) => ({
              ...p,
              vendor_name: ex.vendor_name || p.vendor_name,
              amount: ex.amount ? String(ex.amount) : p.amount,
              bill_date: ex.expense_date || p.bill_date,
              tax_amount: ex.tax_amount ? String(ex.tax_amount) : p.tax_amount,
              notes: ex.description || p.notes,
            }));
            if (ex.line_items?.length) {
              setLineItems(ex.line_items.map((i: any) => ({
                description: i.description || "",
                quantity: i.quantity || 1,
                rate: i.rate || i.amount || 0,
                amount: i.amount || 0,
              })));
            }
            toast.success(`AI extracted bill details (${ex.confidence} confidence). Review before saving.`);
          } else {
            toast.warning("AI could not extract details. Fill in manually.");
          }
        } catch {
          toast.warning("AI extraction failed. Fill in manually.");
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

  const updateLineItem = (idx: number, field: string, val: any) => {
    setLineItems(lineItems.map((item, i) => {
      if (i !== idx) return item;
      const next = { ...item, [field]: val };
      if (field === "quantity" || field === "rate") next.amount = next.quantity * next.rate;
      return next;
    }));
  };

  const openPreview = async (item: any) => {
    setPreviewItem(item);
    setPreviewUrl(null);
    if (item.attachment_url) {
      const { data } = await supabase.storage.from("bill-attachments").createSignedUrl(item.attachment_url, 3600);
      setPreviewUrl(data?.signedUrl ?? null);
    }
  };

  if (roleLoading) return null;
  if (!isFinance) return <AccessDenied />;

  const filtered = bills.filter((b: any) =>
    b.vendor_name?.toLowerCase().includes(search.toLowerCase()) ||
    b.bill_number?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPending = bills.filter((b: any) => b.status === "received" || b.status === "draft").reduce((s: number, b: any) => s + Number(b.total_amount), 0);
  const totalPaid = bills.filter((b: any) => b.status === "paid").reduce((s: number, b: any) => s + Number(b.total_amount), 0);

  return (
    <MainLayout title="Bills" subtitle="Manage vendor bills with AI-powered scanning">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Bills", value: bills.length },
            { label: "Pending Payment", value: formatCurrency(totalPending) },
            { label: "Total Paid", value: formatCurrency(totalPaid) },
            { label: "AI Scanned", value: bills.filter((b: any) => b.ai_extracted).length },
          ].map((s) => (
            <Card key={s.label} className="border-border/50 bg-card/60">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold mt-1">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search bills…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-2">
            <ScanLine className="h-4 w-4" /> Scan / Add Bill
          </Button>
        </div>

        <Card className="border-border/50 bg-card/60">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <ScanLine className="h-10 w-10 opacity-40" />
                <p className="text-sm">No bills yet. Scan a bill document to get started.</p>
                <Button size="sm" variant="outline" onClick={() => { resetForm(); setDialogOpen(true); }}>Add Bill</Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Bill Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm">{b.bill_number}</span>
                          {b.ai_extracted && (
                            <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/10 text-xs px-1 py-0">
                              <Sparkles className="h-2.5 w-2.5" />
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-sm">{b.vendor_name}</TableCell>
                      <TableCell className="font-semibold">{formatCurrency(Number(b.total_amount))}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{b.bill_date}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{b.due_date || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_COLORS[b.status] || "bg-muted"}>{b.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openPreview(b)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {b.status !== "paid" && (
                                <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: b.id, status: "paid" })}>
                                  <CheckCircle2 className="h-4 w-4 mr-2 text-green-400" /> Mark as Paid
                                </DropdownMenuItem>
                              )}
                              {b.status === "draft" && (
                                <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: b.id, status: "received" })}>
                                  <Clock className="h-4 w-4 mr-2" /> Mark as Received
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(b.id)}>
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

      {/* ── Add/Scan Bill Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              {aiExtracted ? "AI-Extracted Bill — Review & Save" : "Add Bill"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Upload area */}
            <div
              className="border-2 border-dashed border-border/60 rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={handleFileChange} />
              {uploading ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm">Uploading…</p>
                </div>
              ) : extracting ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Sparkles className="h-8 w-8 animate-pulse text-purple-400" />
                  <p className="text-sm font-medium">AI reading your bill…</p>
                  <p className="text-xs">Extracting vendor, amount, date & line items</p>
                </div>
              ) : uploadedFile ? (
                <div className="flex flex-col items-center gap-2">
                  {aiExtracted && <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/10 mb-1"><Sparkles className="h-3 w-3 mr-1" /> AI Extracted</Badge>}
                  <p className="text-sm font-medium text-foreground">{uploadedFile.name}</p>
                  <p className="text-xs text-muted-foreground">Click to replace file</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-8 w-8 opacity-60" />
                  <p className="text-sm font-medium">Upload bill document for AI extraction</p>
                  <p className="text-xs">JPG, PNG, WEBP, PDF · Max 20MB</p>
                  <p className="text-xs text-primary">Or fill in manually below ↓</p>
                </div>
              )}
            </div>

            {/* Form fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Vendor Name *</Label>
                <Input list="vendor-list-bills" value={form.vendor_name} onChange={(e) => setForm((p) => ({ ...p, vendor_name: e.target.value }))} placeholder="Vendor name" />
                <datalist id="vendor-list-bills">{vendors.map((v: any) => <option key={v.id} value={v.name} />)}</datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Bill Number</Label>
                <Input value={form.bill_number} onChange={(e) => setForm((p) => ({ ...p, bill_number: e.target.value }))} placeholder="Auto-generated if blank" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["draft", "received", "approved", "paid"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bill Date</Label>
                <Input type="date" value={form.bill_date} onChange={(e) => setForm((p) => ({ ...p, bill_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Sub-total Amount *</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Tax Amount (GST/VAT)</Label>
                <Input type="number" value={form.tax_amount} onChange={(e) => setForm((p) => ({ ...p, tax_amount: e.target.value }))} placeholder="0.00" />
              </div>
              {form.amount && (
                <div className="col-span-2 text-right text-sm font-semibold text-foreground">
                  Total: {formatCurrency((parseFloat(form.amount) || 0) + (parseFloat(form.tax_amount) || 0))}
                </div>
              )}
            </div>

            {/* Line items */}
            <div>
              <Label className="mb-2 block">Line Items</Label>
              <div className="space-y-2">
                {lineItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <Input placeholder="Description" value={item.description} onChange={(e) => updateLineItem(idx, "description", e.target.value)} className="text-sm h-8" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateLineItem(idx, "quantity", Number(e.target.value))} className="text-sm h-8" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" placeholder="Rate" value={item.rate} onChange={(e) => updateLineItem(idx, "rate", Number(e.target.value))} className="text-sm h-8" />
                    </div>
                    <div className="col-span-2 text-sm font-medium text-right text-muted-foreground">{formatCurrency(item.amount)}</div>
                    <div className="col-span-1">
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))} disabled={lineItems.length === 1}>✕</Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => setLineItems([...lineItems, { description: "", quantity: 1, rate: 0, amount: 0 }])}>+ Add Line</Button>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Internal notes…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploading || extracting}>
              {saveMutation.isPending ? "Saving…" : "Save Bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Preview Dialog ── */}
      {previewItem && (
        <Dialog open={!!previewItem} onOpenChange={(v) => { if (!v) { setPreviewItem(null); setPreviewUrl(null); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{previewItem.bill_number} — {previewItem.vendor_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: "Amount", value: formatCurrency(Number(previewItem.total_amount)) },
                  { label: "Status", value: previewItem.status },
                  { label: "Bill Date", value: previewItem.bill_date },
                  { label: "Due Date", value: previewItem.due_date || "—" },
                ].map((r) => (
                  <div key={r.label}>
                    <p className="text-xs text-muted-foreground">{r.label}</p>
                    <p className="font-medium">{r.value}</p>
                  </div>
                ))}
              </div>
              {previewItem.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{previewItem.notes}</p>
                </div>
              )}
              {previewItem.bill_items?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Line Items</p>
                  <div className="border border-border/50 rounded-lg overflow-hidden">
                    {previewItem.bill_items.map((i: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm border-b border-border/30 last:border-0">
                        <span className="flex-1">{i.description}</span>
                        <span className="text-muted-foreground text-xs mx-3">{i.quantity} × {formatCurrency(i.rate)}</span>
                        <span className="font-medium">{formatCurrency(i.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {previewItem.attachment_url && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Attachment</p>
                  {previewUrl ? (
                    previewItem.attachment_url.endsWith(".pdf") ? (
                      <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                        <ExternalLink className="h-4 w-4" /> Open PDF
                      </a>
                    ) : (
                      <img src={previewUrl} alt="Bill" className="rounded-lg max-h-60 object-contain border border-border" />
                    )
                  ) : (
                    <p className="text-xs text-muted-foreground">Loading attachment…</p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              {previewItem.status !== "paid" && (
                <Button variant="outline" className="border-green-500/40 text-green-400" onClick={() => { updateStatusMutation.mutate({ id: previewItem.id, status: "paid" }); setPreviewItem(null); }}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Mark as Paid
                </Button>
              )}
              <Button variant="outline" onClick={() => { setPreviewItem(null); setPreviewUrl(null); }}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </MainLayout>
  );
}
