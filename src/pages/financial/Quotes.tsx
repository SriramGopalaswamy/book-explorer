import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/StatCard";
import { TablePagination } from "@/components/ui/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileText, MoreHorizontal, Trash2, ArrowRight, Search, Eye, Pencil, Download, Send, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";

// ─── Types ───────────────────────────────────────────────────
interface Customer { id: string; name: string; email: string | null; }

interface QuoteItem {
  id?: string;
  description: string;
  hsn_sac?: string;
  quantity: number;
  rate: number;
  amount: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
}

interface Quote {
  id: string; quote_number: string; client_name: string; client_email: string | null;
  customer_id: string | null; amount: number; due_date: string; status: string;
  notes: string | null; converted_invoice_id: string | null; created_at: string;
  place_of_supply?: string | null; payment_terms?: string | null; customer_gstin?: string | null;
  subtotal?: number; cgst_total?: number; sgst_total?: number; igst_total?: number; total_amount?: number;
  quote_items?: QuoteItem[];
}

// ─── Helpers ─────────────────────────────────────────────────
interface LineItem {
  description: string;
  hsn_sac: string;
  quantity: string;
  rate: string;
  cgst_rate: string;
  sgst_rate: string;
}

const emptyLineItem: LineItem = { description: "", hsn_sac: "", quantity: "1", rate: "", cgst_rate: "0", sgst_rate: "0" };

const formatCurrency = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${n.toLocaleString("en-IN")}`;

function calculateLineItemTotals(items: LineItem[]) {
  let subtotal = 0, cgstTotal = 0, sgstTotal = 0;
  const computed = items.map(item => {
    const qty = parseInt(item.quantity) || 1;
    const rate = parseFloat(item.rate) || 0;
    const amount = qty * rate;
    const cgstRate = parseFloat(item.cgst_rate) || 0;
    const sgstRate = parseFloat(item.sgst_rate) || 0;
    const cgstAmt = amount * cgstRate / 100;
    const sgstAmt = amount * sgstRate / 100;
    subtotal += amount;
    cgstTotal += cgstAmt;
    sgstTotal += sgstAmt;
    return { ...item, amount, cgstAmt, sgstAmt };
  });
  return { computed, subtotal, cgstTotal, sgstTotal, total: subtotal + cgstTotal + sgstTotal };
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case "accepted": return { label: "Accepted", icon: CheckCircle2, className: "bg-success/20 text-success border-success/30" };
    case "sent": return { label: "Sent", icon: Send, className: "bg-primary/10 text-primary" };
    case "rejected": return { label: "Rejected", icon: XCircle, className: "bg-destructive/10 text-destructive" };
    case "converted": return { label: "Converted", icon: ArrowRight, className: "bg-muted text-muted-foreground" };
    case "draft": default: return { label: "Draft", icon: Clock, className: "" };
  }
};

async function downloadQuotePdf(quoteId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const response = await supabase.functions.invoke("generate-quote-pdf", { body: { quoteId } });
  if (response.error) throw new Error(response.error.message || "Failed to generate PDF");
  const blob = response.data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quote-${quoteId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Component ───────────────────────────────────────────────
export default function Quotes() {
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [viewingQuote, setViewingQuote] = useState<Quote | null>(null);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);

  // Create form
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [createStatus, setCreateStatus] = useState<"draft" | "sent">("draft");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ ...emptyLineItem }]);
  const [formMeta, setFormMeta] = useState({ dueDate: "", notes: "", placeOfSupply: "", paymentTerms: "Due on Receipt", customerGstin: "" });

  // Edit form
  const [editSelectedCustomerId, setEditSelectedCustomerId] = useState("");
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([{ ...emptyLineItem }]);
  const [editFormMeta, setEditFormMeta] = useState({ dueDate: "", notes: "", placeOfSupply: "", paymentTerms: "Due on Receipt", customerGstin: "" });

  // ── Data queries ──
  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["quotes", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("quotes").select("*, quote_items(*)").eq("user_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Quote[];
    },
    enabled: !!user,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("customers").select("id,name,email").eq("user_id", user.id).eq("status", "active").order("name");
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!user,
  });

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const customer = customers.find((c) => c.id === selectedCustomerId);
      if (!customer) throw new Error("Please select a customer.");
      if (!formMeta.dueDate) throw new Error("Valid Until date is required.");
      if (lineItems.some(i => !i.rate)) throw new Error("Please fill in all line item rates.");

      const { computed, subtotal, cgstTotal, sgstTotal, total } = calculateLineItemTotals(lineItems);
      const quoteNum = `QT-${Date.now().toString().slice(-6)}`;

      const { data: quote, error } = await supabase.from("quotes").insert({
        user_id: user.id, quote_number: quoteNum, client_name: customer.name,
        client_email: customer.email ?? null, customer_id: customer.id,
        amount: total, due_date: formMeta.dueDate, notes: formMeta.notes || null,
        status: createStatus,
        place_of_supply: formMeta.placeOfSupply || null,
        payment_terms: formMeta.paymentTerms || "Due on Receipt",
        customer_gstin: formMeta.customerGstin || null,
        subtotal, cgst_total: cgstTotal, sgst_total: sgstTotal, igst_total: 0, total_amount: total,
      }).select().single();
      if (error) throw error;

      const validItems = computed.filter(i => i.description);
      if (validItems.length > 0) {
        const { error: itemsError } = await supabase.from("quote_items").insert(
          validItems.map(c => ({
            quote_id: quote.id, description: c.description || "Services",
            quantity: parseInt(c.quantity) || 1, rate: parseFloat(c.rate) || 0, amount: c.amount,
            hsn_sac: c.hsn_sac || null,
            cgst_rate: parseFloat(c.cgst_rate) || 0, sgst_rate: parseFloat(c.sgst_rate) || 0, igst_rate: 0,
            cgst_amount: c.cgstAmt, sgst_amount: c.sgstAmt, igst_amount: 0,
          }))
        );
        if (itemsError) throw itemsError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({ title: "Quote Created" });
      setIsDialogOpen(false);
      resetCreateForm();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!user || !editingQuote) throw new Error("Not authenticated");
      const customer = customers.find((c) => c.id === editSelectedCustomerId);
      if (!customer) throw new Error("Please select a customer.");
      if (!editFormMeta.dueDate || editLineItems.some(i => !i.rate)) throw new Error("Please fill in all required fields.");

      const { computed, subtotal, cgstTotal, sgstTotal, total } = calculateLineItemTotals(editLineItems);

      const { error: updateError } = await supabase.from("quotes").update({
        client_name: customer.name, client_email: customer.email ?? null, customer_id: customer.id,
        amount: total, due_date: editFormMeta.dueDate, notes: editFormMeta.notes || null,
        place_of_supply: editFormMeta.placeOfSupply || null,
        payment_terms: editFormMeta.paymentTerms || "Due on Receipt",
        customer_gstin: editFormMeta.customerGstin || null,
        subtotal, cgst_total: cgstTotal, sgst_total: sgstTotal, igst_total: 0, total_amount: total,
      }).eq("id", editingQuote.id);
      if (updateError) throw updateError;

      // Delete-reinsert items
      await supabase.from("quote_items").delete().eq("quote_id", editingQuote.id);
      const validItems = computed.filter(i => i.description);
      if (validItems.length > 0) {
        const { error: itemsError } = await supabase.from("quote_items").insert(
          validItems.map(c => ({
            quote_id: editingQuote.id, description: c.description || "Services",
            quantity: parseInt(c.quantity) || 1, rate: parseFloat(c.rate) || 0, amount: c.amount,
            hsn_sac: c.hsn_sac || null,
            cgst_rate: parseFloat(c.cgst_rate) || 0, sgst_rate: parseFloat(c.sgst_rate) || 0, igst_rate: 0,
            cgst_amount: c.cgstAmt, sgst_amount: c.sgstAmt, igst_amount: 0,
          }))
        );
        if (itemsError) throw itemsError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({ title: "Quote Updated" });
      setIsEditDialogOpen(false);
      setEditingQuote(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("quotes").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["quotes"] }); toast({ title: "Status Updated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const convertToInvoice = useMutation({
    mutationFn: async (quote: Quote) => {
      if (!user) throw new Error("Not authenticated");
      const invoiceNum = `INV-${Date.now().toString().slice(-8)}`;
      const { data: inv, error } = await supabase.from("invoices").insert({
        user_id: user.id, invoice_number: invoiceNum, client_name: quote.client_name,
        client_email: quote.client_email ?? "", amount: quote.amount, due_date: quote.due_date,
        customer_id: quote.customer_id,
        place_of_supply: quote.place_of_supply || null,
        payment_terms: quote.payment_terms || "Due on Receipt",
        customer_gstin: quote.customer_gstin || null,
        subtotal: quote.subtotal || quote.amount,
        cgst_total: quote.cgst_total || 0,
        sgst_total: quote.sgst_total || 0,
        igst_total: quote.igst_total || 0,
        total_amount: quote.total_amount || quote.amount,
        notes: quote.notes || null,
      }).select().single();
      if (error) throw error;

      const qItems = quote.quote_items || [];
      if (qItems.length > 0) {
        await supabase.from("invoice_items").insert(qItems.map(i => ({
          invoice_id: inv.id, description: i.description, quantity: i.quantity, rate: i.rate, amount: i.amount,
          hsn_sac: i.hsn_sac || null,
          cgst_rate: i.cgst_rate || 0, sgst_rate: i.sgst_rate || 0, igst_rate: i.igst_rate || 0,
          cgst_amount: i.cgst_amount || 0, sgst_amount: i.sgst_amount || 0, igst_amount: i.igst_amount || 0,
        })));
      }
      await supabase.from("quotes").update({ status: "converted", converted_invoice_id: inv.id }).eq("id", quote.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Converted to Invoice" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("quotes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["quotes"] }); toast({ title: "Quote Deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Form helpers ──
  const resetCreateForm = () => {
    setFormMeta({ dueDate: "", notes: "", placeOfSupply: "", paymentTerms: "Due on Receipt", customerGstin: "" });
    setLineItems([{ ...emptyLineItem }]);
    setSelectedCustomerId("");
    setCreateStatus("draft");
  };

  const openEditDialog = (quote: Quote) => {
    setEditingQuote(quote);
    setEditSelectedCustomerId(quote.customer_id || "");
    const items = quote.quote_items || [];
    setEditLineItems(
      items.length > 0
        ? items.map(it => ({
            description: it.description || "", hsn_sac: it.hsn_sac || "",
            quantity: String(it.quantity || 1), rate: String(it.rate || 0),
            cgst_rate: String(it.cgst_rate || 0), sgst_rate: String(it.sgst_rate || 0),
          }))
        : [{ ...emptyLineItem, rate: String(quote.amount) }]
    );
    setEditFormMeta({
      dueDate: quote.due_date, notes: quote.notes || "",
      placeOfSupply: quote.place_of_supply || "", paymentTerms: quote.payment_terms || "Due on Receipt",
      customerGstin: quote.customer_gstin || "",
    });
    setIsEditDialogOpen(true);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string) => {
    setLineItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };
  const updateEditLineItem = (index: number, field: keyof LineItem, value: string) => {
    setEditLineItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  // ── Computed ──
  const { subtotal: createSubtotal, cgstTotal: createCgst, sgstTotal: createSgst, total: createTotal } = calculateLineItemTotals(lineItems);
  const { subtotal: editSubtotal, cgstTotal: editCgst, sgstTotal: editSgst, total: editTotal } = calculateLineItemTotals(editLineItems);
  const filtered = quotes.filter((q) => q.client_name.toLowerCase().includes(search.toLowerCase()) || q.quote_number.toLowerCase().includes(search.toLowerCase()));
  const pagination = usePagination(filtered, 10);

  if (isCheckingRole) return null;
  if (!hasFinanceAccess) return <AccessDenied />;

  // ── Shared line items form renderer ──
  const renderLineItemsForm = (
    items: LineItem[],
    updateFn: (i: number, f: keyof LineItem, v: string) => void,
    addFn: () => void,
    removeFn: (i: number) => void,
    subtotal: number, cgst: number, sgst: number, total: number
  ) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Line Items</Label>
        <Button type="button" variant="outline" size="sm" onClick={addFn}><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="grid gap-2 p-3 rounded-lg border bg-secondary/20">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Description</Label><Input placeholder="Service" value={item.description} onChange={e => updateFn(idx, "description", e.target.value)} /></div>
            <div><Label className="text-xs">HSN/SAC Code</Label><Input placeholder="998331" value={item.hsn_sac} onChange={e => updateFn(idx, "hsn_sac", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div><Label className="text-xs">Qty</Label><Input type="number" min="1" value={item.quantity} onChange={e => updateFn(idx, "quantity", e.target.value)} /></div>
            <div><Label className="text-xs">Rate (₹) *</Label><Input type="number" min="0" value={item.rate} onChange={e => updateFn(idx, "rate", e.target.value)} /></div>
            <div><Label className="text-xs">CGST %</Label><Input type="number" min="0" value={item.cgst_rate} onChange={e => updateFn(idx, "cgst_rate", e.target.value)} /></div>
            <div><Label className="text-xs">SGST %</Label><Input type="number" min="0" value={item.sgst_rate} onChange={e => updateFn(idx, "sgst_rate", e.target.value)} /></div>
          </div>
          {items.length > 1 && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive self-end" onClick={() => removeFn(idx)}>
              <Trash2 className="h-3 w-3 mr-1" /> Remove
            </Button>
          )}
        </div>
      ))}
      <div className="rounded-lg bg-secondary/50 p-4 space-y-1.5">
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
        {cgst > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">CGST</span><span>{formatCurrency(cgst)}</span></div>}
        {sgst > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">SGST</span><span>{formatCurrency(sgst)}</span></div>}
        <div className="flex justify-between text-base font-semibold border-t pt-1.5"><span>Total</span><span>{formatCurrency(total)}</span></div>
      </div>
    </div>
  );

  // ── Render form fields (shared between create/edit) ──
  const renderFormFields = (
    meta: typeof formMeta,
    setMeta: typeof setFormMeta,
    customerId: string,
    setCustomerId: (v: string) => void,
  ) => (
    <>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Customer *</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger>
            <SelectContent>
              {customers.length === 0
                ? <SelectItem value="__none__" disabled>No customers found — add one first</SelectItem>
                : customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Valid Until *</Label>
          <Input type="date" value={meta.dueDate} onChange={e => setMeta(prev => ({ ...prev, dueDate: e.target.value }))} />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Place of Supply</Label>
          <Input placeholder="e.g. Karnataka (29)" value={meta.placeOfSupply} onChange={e => setMeta(prev => ({ ...prev, placeOfSupply: e.target.value }))} />
        </div>
        <div className="grid gap-2">
          <Label>Customer GSTIN</Label>
          <Input placeholder="Customer's GST number" value={meta.customerGstin} onChange={e => setMeta(prev => ({ ...prev, customerGstin: e.target.value }))} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Payment Terms</Label>
        <Input value={meta.paymentTerms} onChange={e => setMeta(prev => ({ ...prev, paymentTerms: e.target.value }))} />
      </div>
    </>
  );

  return (
    <MainLayout title="Quotes" subtitle="Create and manage quotes with GST against registered customers">
      <div className="space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Quotes" value={String(quotes.length)} icon={<FileText className="h-4 w-4" />} />
          <StatCard title="Accepted" value={String(quotes.filter((q) => q.status === "accepted").length)} icon={<CheckCircle2 className="h-4 w-4" />} />
          <StatCard title="Converted" value={String(quotes.filter((q) => q.status === "converted").length)} icon={<ArrowRight className="h-4 w-4" />} />
          <StatCard title="Draft" value={String(quotes.filter((q) => q.status === "draft").length)} icon={<Clock className="h-4 w-4" />} />
        </div>

        {/* Table card */}
        <div className="rounded-xl border bg-card shadow-card">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b p-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">All Quotes</h3>
              <p className="text-sm text-muted-foreground">Manage, convert and download quotes</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search quotes..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) resetCreateForm(); }}>
                <DialogTrigger asChild><Button className="bg-gradient-financial text-white hover:opacity-90"><Plus className="h-4 w-4 mr-2" />New Quote</Button></DialogTrigger>
                <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Quote</DialogTitle>
                    <DialogDescription>Fill in the details to create a new quotation.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    {renderFormFields(formMeta, setFormMeta, selectedCustomerId, setSelectedCustomerId)}
                    <div className="grid gap-2">
                      <Label>Save As</Label>
                      <Select value={createStatus} onValueChange={(v) => setCreateStatus(v as "draft" | "sent")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {renderLineItemsForm(lineItems, updateLineItem, () => setLineItems(p => [...p, { ...emptyLineItem }]), (i) => { if (lineItems.length > 1) setLineItems(p => p.filter((_, idx) => idx !== i)); }, createSubtotal, createCgst, createSgst, createTotal)}
                    <div className="grid gap-2">
                      <Label>Notes (Optional)</Label>
                      <Textarea placeholder="Additional notes" value={formMeta.notes} onChange={e => setFormMeta(prev => ({ ...prev, notes: e.target.value }))} rows={2} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="bg-gradient-financial text-white hover:opacity-90">
                      {createMutation.isPending ? "Creating..." : `Create as ${createStatus === "draft" ? "Draft" : "Sent"}`}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Edit Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Edit Quote</DialogTitle><DialogDescription>Update the quote details.</DialogDescription></DialogHeader>
              <div className="grid gap-4 py-4">
                {renderFormFields(editFormMeta, setEditFormMeta, editSelectedCustomerId, setEditSelectedCustomerId)}
                {renderLineItemsForm(editLineItems, updateEditLineItem, () => setEditLineItems(p => [...p, { ...emptyLineItem }]), (i) => { if (editLineItems.length > 1) setEditLineItems(p => p.filter((_, idx) => idx !== i)); }, editSubtotal, editCgst, editSgst, editTotal)}
                <div className="grid gap-2">
                  <Label>Notes (Optional)</Label>
                  <Textarea placeholder="Additional notes" value={editFormMeta.notes} onChange={e => setEditFormMeta(prev => ({ ...prev, notes: e.target.value }))} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-gradient-financial text-white hover:opacity-90">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Table */}
          {isLoading ? (
            <div className="p-6 space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : quotes.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">No quotes yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">Create your first quote to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quote #</TableHead><TableHead>Client</TableHead><TableHead>Amount</TableHead>
                    <TableHead>Valid Until</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((q) => {
                    const sc = getStatusConfig(q.status);
                    const StatusIcon = sc.icon;
                    return (
                      <TableRow key={q.id} className="hover:bg-secondary/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-mono text-sm font-medium">{q.quote_number}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{q.client_name}</div>
                          <div className="text-xs text-muted-foreground">{q.client_email}</div>
                        </TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(q.total_amount || q.amount))}</TableCell>
                        <TableCell className="text-sm">{new Date(q.due_date).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={sc.className}>
                            <StatusIcon className="mr-1 h-3 w-3" />{sc.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setViewingQuote(q)}><Eye className="h-4 w-4 mr-2" /> View Quote</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(q)}><Pencil className="h-4 w-4 mr-2" /> Edit Quote</DropdownMenuItem>
                              <DropdownMenuItem onClick={async () => {
                                try { toast({ title: "Generating PDF", description: "Please wait..." }); await downloadQuotePdf(q.id); toast({ title: "Download Complete" }); }
                                catch (error) { toast({ title: "Download Failed", description: error instanceof Error ? error.message : "Failed", variant: "destructive" }); }
                              }}><Download className="h-4 w-4 mr-2" /> Download PDF</DropdownMenuItem>
                              {q.status === "draft" && <DropdownMenuItem onClick={() => statusMutation.mutate({ id: q.id, status: "sent" })}><Send className="h-4 w-4 mr-2" /> Mark as Sent</DropdownMenuItem>}
                              {q.status === "sent" && <DropdownMenuItem onClick={() => statusMutation.mutate({ id: q.id, status: "accepted" })}><CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Accepted</DropdownMenuItem>}
                              {q.status === "sent" && <DropdownMenuItem onClick={() => statusMutation.mutate({ id: q.id, status: "rejected" })}><XCircle className="h-4 w-4 mr-2" /> Mark as Rejected</DropdownMenuItem>}
                              {q.status !== "converted" && <DropdownMenuItem onClick={() => convertToInvoice.mutate(q)}><ArrowRight className="h-4 w-4 mr-2" /> Convert to Invoice</DropdownMenuItem>}
                              <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(q.id)}><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="px-6 pb-4">
                <TablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
              </div>
            </div>
          )}
        </div>

        {/* View Quote Dialog */}
        <Dialog open={!!viewingQuote} onOpenChange={(o) => { if (!o) setViewingQuote(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Quote {viewingQuote?.quote_number}</DialogTitle>
              <DialogDescription>
                {viewingQuote && <Badge variant="outline" className={getStatusConfig(viewingQuote.status).className}>{getStatusConfig(viewingQuote.status).label}</Badge>}
              </DialogDescription>
            </DialogHeader>
            {viewingQuote && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Client</p>
                    <p className="font-medium">{viewingQuote.client_name}</p>
                    <p className="text-sm text-muted-foreground">{viewingQuote.client_email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valid Until</p>
                    <p className="font-medium">{viewingQuote.due_date}</p>
                  </div>
                  {viewingQuote.customer_gstin && (
                    <div>
                      <p className="text-xs text-muted-foreground">Customer GSTIN</p>
                      <p className="font-medium font-mono text-sm">{viewingQuote.customer_gstin}</p>
                    </div>
                  )}
                  {viewingQuote.place_of_supply && (
                    <div>
                      <p className="text-xs text-muted-foreground">Place of Supply</p>
                      <p className="font-medium">{viewingQuote.place_of_supply}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Line Items</p>
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Description</TableHead>
                          <TableHead className="text-xs text-right">Qty</TableHead>
                          <TableHead className="text-xs text-right">Rate</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(viewingQuote.quote_items || []).map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-sm">
                              {item.description}
                              {item.hsn_sac && <span className="block text-xs text-muted-foreground">HSN: {item.hsn_sac}</span>}
                            </TableCell>
                            <TableCell className="text-sm text-right">{item.quantity}</TableCell>
                            <TableCell className="text-sm text-right">{formatCurrency(Number(item.rate))}</TableCell>
                            <TableCell className="text-sm text-right">{formatCurrency(Number(item.amount))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="rounded-lg bg-secondary/50 p-4 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(Number(viewingQuote.subtotal || viewingQuote.amount))}</span>
                  </div>
                  {Number(viewingQuote.cgst_total) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">CGST</span>
                      <span>{formatCurrency(Number(viewingQuote.cgst_total))}</span>
                    </div>
                  )}
                  {Number(viewingQuote.sgst_total) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">SGST</span>
                      <span>{formatCurrency(Number(viewingQuote.sgst_total))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-semibold border-t pt-1.5">
                    <span>Total</span>
                    <span>{formatCurrency(Number(viewingQuote.total_amount || viewingQuote.amount))}</span>
                  </div>
                </div>

                {viewingQuote.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm">{viewingQuote.notes}</p>
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    try { toast({ title: "Generating PDF..." }); await downloadQuotePdf(viewingQuote.id); toast({ title: "Downloaded!" }); }
                    catch (error) { toast({ title: "Failed", description: error instanceof Error ? error.message : "Error", variant: "destructive" }); }
                  }}
                >
                  <Download className="mr-2 h-4 w-4" /> Download PDF
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
