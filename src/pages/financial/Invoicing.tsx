import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { ModuleInsightBar } from "@/components/ai/ModuleInsightBar";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Plus,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Download,
  Settings2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  useInvoices,
  useCreateInvoice,
  useUpdateInvoice,
  useUpdateInvoiceStatus,
  useDeleteInvoice,
  downloadInvoicePdf,
  Invoice,
} from "@/hooks/useInvoices";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { useNavigate } from "react-router-dom";

const formatCurrency = (amount: number) => {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)}L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
};

const getStatusConfig = (status: Invoice["status"]) => {
  switch (status) {
    case "paid":
      return { label: "Paid", variant: "default" as const, icon: CheckCircle2, className: "bg-success text-success-foreground" };
    case "sent":
      return { label: "Sent", variant: "secondary" as const, icon: Send, className: "bg-primary/10 text-primary" };
    case "overdue":
      return { label: "Overdue", variant: "destructive" as const, icon: XCircle, className: "" };
    case "draft":
      return { label: "Draft", variant: "outline" as const, icon: Clock, className: "" };
    case "cancelled":
      return { label: "Cancelled", variant: "outline" as const, icon: XCircle, className: "text-muted-foreground" };
    default:
      return { label: status, variant: "outline" as const, icon: Clock, className: "" };
  }
};

interface LineItem {
  description: string;
  hsn_sac: string;
  quantity: string;
  rate: string;
  cgst_rate: string;
  sgst_rate: string;
}

const emptyLineItem: LineItem = {
  description: "",
  hsn_sac: "",
  quantity: "1",
  rate: "",
  cgst_rate: "0",
  sgst_rate: "0",
};

function calculateLineItemTotals(items: LineItem[]) {
  let subtotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;

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

export default function Invoicing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  const { data: invoices = [], isLoading } = useInvoices();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const updateStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();
  const pagination = usePagination(invoices, 10);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [editSelectedCustomerId, setEditSelectedCustomerId] = useState("");

  // Create form state
  const [createStatus, setCreateStatus] = useState<"draft" | "sent">("draft");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ ...emptyLineItem }]);
  const [formMeta, setFormMeta] = useState({ dueDate: "", notes: "", placeOfSupply: "", paymentTerms: "Due on Receipt", customerGstin: "" });

  // Edit form state
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([{ ...emptyLineItem }]);
  const [editFormMeta, setEditFormMeta] = useState({ dueDate: "", notes: "", placeOfSupply: "", paymentTerms: "Due on Receipt", customerGstin: "" });

  if (isCheckingRole) {
    return (
      <MainLayout title="Invoicing">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Checking permissions...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!hasFinanceAccess) {
    return (
      <AccessDenied
        message="Finance Access Required"
        description="You need finance or admin role to access the Invoicing module."
      />
    );
  }

  const totalOutstanding = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);
  const totalPaid = invoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);
  const overdueCount = invoices.filter((inv) => inv.status === "overdue").length;
  const draftCount = invoices.filter((inv) => inv.status === "draft").length;

  const updateLineItem = (index: number, field: keyof LineItem, value: string) => {
    setLineItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const addLineItem = () => setLineItems(prev => [...prev, { ...emptyLineItem }]);
  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateEditLineItem = (index: number, field: keyof LineItem, value: string) => {
    setEditLineItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const addEditLineItem = () => setEditLineItems(prev => [...prev, { ...emptyLineItem }]);
  const removeEditLineItem = (index: number) => {
    if (editLineItems.length <= 1) return;
    setEditLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreateInvoice = () => {
    const customer = customers.find((c) => c.id === selectedCustomerId);
    if (!customer) {
      toast({ title: "Validation Error", description: "Please select a customer", variant: "destructive" });
      return;
    }
    if (!formMeta.dueDate || lineItems.some(item => !item.rate)) {
      toast({ title: "Validation Error", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    const { computed, subtotal, cgstTotal, sgstTotal, total } = calculateLineItemTotals(lineItems);

    createInvoice.mutate(
      {
        client_name: customer.name,
        client_email: customer.email || "",
        customer_id: customer.id,
        amount: total,
        due_date: formMeta.dueDate,
        status: createStatus,
        place_of_supply: formMeta.placeOfSupply,
        payment_terms: formMeta.paymentTerms,
        subtotal,
        cgst_total: cgstTotal,
        sgst_total: sgstTotal,
        total_amount: total,
        notes: formMeta.notes,
        customer_gstin: formMeta.customerGstin,
        items: computed.map(c => ({
          description: c.description || "Services",
          quantity: parseInt(c.quantity) || 1,
          rate: parseFloat(c.rate) || 0,
          amount: c.amount,
          hsn_sac: c.hsn_sac,
          cgst_rate: parseFloat(c.cgst_rate) || 0,
          sgst_rate: parseFloat(c.sgst_rate) || 0,
          igst_rate: 0,
          cgst_amount: c.cgstAmt,
          sgst_amount: c.sgstAmt,
          igst_amount: 0,
        })),
      },
      {
        onSuccess: () => {
          setSelectedCustomerId("");
          setLineItems([{ ...emptyLineItem }]);
          setFormMeta({ dueDate: "", notes: "", placeOfSupply: "", paymentTerms: "Due on Receipt", customerGstin: "" });
          setCreateStatus("draft");
          setIsDialogOpen(false);
        },
      }
    );
  };

  const handleEditInvoice = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setEditSelectedCustomerId(invoice.customer_id || "");
    const items = invoice.invoice_items || [];
    setEditLineItems(
      items.length > 0
        ? items.map(it => ({
            description: it.description || "",
            hsn_sac: (it as any).hsn_sac || "",
            quantity: String(it.quantity || 1),
            rate: String(it.rate || 0),
            cgst_rate: String((it as any).cgst_rate || 0),
            sgst_rate: String((it as any).sgst_rate || 0),
          }))
        : [{ ...emptyLineItem, rate: String(invoice.amount) }]
    );
    setEditFormMeta({
      dueDate: invoice.due_date,
      notes: (invoice as any).notes || "",
      placeOfSupply: (invoice as any).place_of_supply || "",
      paymentTerms: (invoice as any).payment_terms || "Due on Receipt",
      customerGstin: (invoice as any).customer_gstin || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateInvoice = () => {
    if (!editingInvoice) return;
    const customer = customers.find((c) => c.id === editSelectedCustomerId);
    if (!customer) {
      toast({ title: "Validation Error", description: "Please select a customer", variant: "destructive" });
      return;
    }
    if (!editFormMeta.dueDate || editLineItems.some(item => !item.rate)) {
      toast({ title: "Validation Error", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    const { computed, subtotal, cgstTotal, sgstTotal, total } = calculateLineItemTotals(editLineItems);

    updateInvoice.mutate(
      {
        id: editingInvoice.id,
        client_name: customer.name,
        client_email: customer.email || "",
        customer_id: customer.id,
        amount: total,
        due_date: editFormMeta.dueDate,
        place_of_supply: editFormMeta.placeOfSupply,
        payment_terms: editFormMeta.paymentTerms,
        subtotal,
        cgst_total: cgstTotal,
        sgst_total: sgstTotal,
        total_amount: total,
        notes: editFormMeta.notes,
        customer_gstin: editFormMeta.customerGstin,
        items: computed.map(c => ({
          description: c.description || "Services",
          quantity: parseInt(c.quantity) || 1,
          rate: parseFloat(c.rate) || 0,
          amount: c.amount,
          hsn_sac: c.hsn_sac,
          cgst_rate: parseFloat(c.cgst_rate) || 0,
          sgst_rate: parseFloat(c.sgst_rate) || 0,
          igst_rate: 0,
          cgst_amount: c.cgstAmt,
          sgst_amount: c.sgstAmt,
          igst_amount: 0,
        })),
      },
      {
        onSuccess: () => {
          setEditingInvoice(null);
          setIsEditDialogOpen(false);
        },
      }
    );
  };

  const handleStatusChange = (invoiceId: string, newStatus: Invoice["status"]) => {
    updateStatus.mutate({ id: invoiceId, status: newStatus });
  };

  const handleDelete = (invoiceId: string) => {
    deleteInvoice.mutate(invoiceId);
  };

  const { subtotal: createSubtotal, cgstTotal: createCgst, sgstTotal: createSgst, total: createTotal } = calculateLineItemTotals(lineItems);
  const { subtotal: editSubtotal, cgstTotal: editCgst, sgstTotal: editSgst, total: editTotal } = calculateLineItemTotals(editLineItems);

  const renderLineItemsForm = (
    items: LineItem[],
    updateFn: (i: number, f: keyof LineItem, v: string) => void,
    addFn: () => void,
    removeFn: (i: number) => void,
    subtotal: number,
    cgst: number,
    sgst: number,
    total: number
  ) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Line Items</Label>
        <Button type="button" variant="outline" size="sm" onClick={addFn}>
          <Plus className="h-3 w-3 mr-1" /> Add Item
        </Button>
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
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {cgst > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">CGST</span>
            <span>{formatCurrency(cgst)}</span>
          </div>
        )}
        {sgst > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">SGST</span>
            <span>{formatCurrency(sgst)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-semibold border-t pt-1.5">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <MainLayout
      title="Invoicing"
      subtitle="Create, send, and track invoices for your clients"
    >
      <div className="space-y-6 animate-fade-in">
        <ModuleInsightBar module="invoicing" />
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Outstanding" value={formatCurrency(totalOutstanding)} icon={<Send className="h-4 w-4" />} />
          <StatCard title="Total Paid" value={formatCurrency(totalPaid)} change={totalPaid > 0 ? { value: "8.2%", type: "increase" } : undefined} icon={<CheckCircle2 className="h-4 w-4" />} />
          <StatCard title="Overdue Invoices" value={overdueCount.toString()} change={overdueCount > 0 ? { value: "Needs attention", type: "decrease" } : undefined} icon={<XCircle className="h-4 w-4" />} />
          <StatCard title="Draft Invoices" value={draftCount.toString()} icon={<Clock className="h-4 w-4" />} />
        </div>

        {/* Invoices Table */}
        <div className="rounded-xl border bg-card shadow-card">
          <div className="flex items-center justify-between border-b p-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">All Invoices</h3>
              <p className="text-sm text-muted-foreground">Manage and track all your invoices</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/financial/invoice-settings")}>
                <Settings2 className="mr-2 h-4 w-4" /> Settings
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-financial text-white hover:opacity-90">
                    <Plus className="mr-2 h-4 w-4" /> Create Invoice
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New Invoice</DialogTitle>
                    <DialogDescription>Fill in the details to create a new invoice.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Customer *</Label>
                        <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                          <SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger>
                          <SelectContent>
                            {customers.length === 0 ? (
                              <SelectItem value="__none__" disabled>No customers found</SelectItem>
                            ) : (
                              customers.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
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
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Due Date *</Label>
                        <Input type="date" value={formMeta.dueDate} onChange={e => setFormMeta(prev => ({ ...prev, dueDate: e.target.value }))} />
                      </div>
                      <div className="grid gap-2">
                        <Label>Payment Terms</Label>
                        <Input value={formMeta.paymentTerms} onChange={e => setFormMeta(prev => ({ ...prev, paymentTerms: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Place of Supply</Label>
                        <Input placeholder="e.g. Karnataka (29)" value={formMeta.placeOfSupply} onChange={e => setFormMeta(prev => ({ ...prev, placeOfSupply: e.target.value }))} />
                      </div>
                      <div className="grid gap-2">
                        <Label>Customer GSTIN</Label>
                        <Input placeholder="Customer's GST number" value={formMeta.customerGstin} onChange={e => setFormMeta(prev => ({ ...prev, customerGstin: e.target.value }))} />
                      </div>
                    </div>

                    {renderLineItemsForm(lineItems, updateLineItem, addLineItem, removeLineItem, createSubtotal, createCgst, createSgst, createTotal)}

                    <div className="grid gap-2">
                      <Label>Notes (Optional)</Label>
                      <Textarea placeholder="Additional notes" value={formMeta.notes} onChange={e => setFormMeta(prev => ({ ...prev, notes: e.target.value }))} rows={2} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateInvoice} disabled={createInvoice.isPending} className="bg-gradient-financial text-white hover:opacity-90">
                      {createInvoice.isPending ? "Creating..." : `Create as ${createStatus === "draft" ? "Draft" : "Sent"}`}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Edit Invoice Dialog */}
              <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Edit Invoice</DialogTitle>
                    <DialogDescription>Update the invoice details.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label>Customer *</Label>
                      <Select value={editSelectedCustomerId} onValueChange={setEditSelectedCustomerId}>
                        <SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger>
                        <SelectContent>
                          {customers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Due Date *</Label>
                        <Input type="date" value={editFormMeta.dueDate} onChange={e => setEditFormMeta(prev => ({ ...prev, dueDate: e.target.value }))} />
                      </div>
                      <div className="grid gap-2">
                        <Label>Payment Terms</Label>
                        <Input value={editFormMeta.paymentTerms} onChange={e => setEditFormMeta(prev => ({ ...prev, paymentTerms: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Place of Supply</Label>
                        <Input placeholder="e.g. Karnataka (29)" value={editFormMeta.placeOfSupply} onChange={e => setEditFormMeta(prev => ({ ...prev, placeOfSupply: e.target.value }))} />
                      </div>
                      <div className="grid gap-2">
                        <Label>Customer GSTIN</Label>
                        <Input value={editFormMeta.customerGstin} onChange={e => setEditFormMeta(prev => ({ ...prev, customerGstin: e.target.value }))} />
                      </div>
                    </div>

                    {renderLineItemsForm(editLineItems, updateEditLineItem, addEditLineItem, removeEditLineItem, editSubtotal, editCgst, editSgst, editTotal)}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleUpdateInvoice} disabled={updateInvoice.isPending} className="bg-gradient-financial text-white hover:opacity-90">
                      {updateInvoice.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">No invoices yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">Create your first invoice to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((invoice) => {
                    const statusConfig = getStatusConfig(invoice.status);
                    const StatusIcon = statusConfig.icon;
                    return (
                      <TableRow key={invoice.id} className="cursor-pointer hover:bg-secondary/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{invoice.invoice_number}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{invoice.client_name}</p>
                            <p className="text-sm text-muted-foreground">{invoice.client_email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(invoice.amount))}</TableCell>
                        <TableCell>{invoice.due_date}</TableCell>
                        <TableCell>
                          <Badge variant={statusConfig.variant} className={statusConfig.className}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setViewingInvoice(invoice)}>
                                <Eye className="mr-2 h-4 w-4" /> View Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditInvoice(invoice)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    toast({ title: "Generating PDF", description: "Please wait..." });
                                    await downloadInvoicePdf(invoice.id);
                                    toast({ title: "Download Complete", description: `Invoice ${invoice.invoice_number} downloaded.` });
                                  } catch (error) {
                                    toast({ title: "Download Failed", description: error instanceof Error ? error.message : "Failed to download PDF", variant: "destructive" });
                                  }
                                }}
                              >
                                <Download className="mr-2 h-4 w-4" /> Download PDF
                              </DropdownMenuItem>
                              {invoice.status === "draft" && (
                                <DropdownMenuItem onClick={() => handleStatusChange(invoice.id, "sent")}>
                                  <Send className="mr-2 h-4 w-4" /> Send Invoice
                                </DropdownMenuItem>
                              )}
                              {(invoice.status === "sent" || invoice.status === "overdue") && (
                                <DropdownMenuItem onClick={() => handleStatusChange(invoice.id, "paid")}>
                                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark as Paid
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(invoice.id)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="px-6 pb-4">
                <TablePagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.totalItems}
                  from={pagination.from}
                  to={pagination.to}
                  pageSize={pagination.pageSize}
                  onPageChange={pagination.setPage}
                  onPageSizeChange={pagination.setPageSize}
                />
              </div>
            </div>
          )}
        </div>

        {/* View Invoice Dialog */}
        <Dialog open={!!viewingInvoice} onOpenChange={(o) => { if (!o) setViewingInvoice(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invoice {viewingInvoice?.invoice_number}</DialogTitle>
              <DialogDescription>
                {viewingInvoice && (
                  <Badge variant={getStatusConfig(viewingInvoice.status).variant} className={getStatusConfig(viewingInvoice.status).className}>
                    {getStatusConfig(viewingInvoice.status).label}
                  </Badge>
                )}
              </DialogDescription>
            </DialogHeader>
            {viewingInvoice && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Client</p>
                    <p className="font-medium">{viewingInvoice.client_name}</p>
                    <p className="text-sm text-muted-foreground">{viewingInvoice.client_email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p className="font-medium">{viewingInvoice.due_date}</p>
                  </div>
                  {(viewingInvoice as any).customer_gstin && (
                    <div>
                      <p className="text-xs text-muted-foreground">Customer GSTIN</p>
                      <p className="font-medium font-mono text-sm">{(viewingInvoice as any).customer_gstin}</p>
                    </div>
                  )}
                  {(viewingInvoice as any).place_of_supply && (
                    <div>
                      <p className="text-xs text-muted-foreground">Place of Supply</p>
                      <p className="font-medium">{(viewingInvoice as any).place_of_supply}</p>
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
                        {(viewingInvoice.invoice_items || []).map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-sm">
                              {item.description}
                              {(item as any).hsn_sac && <span className="block text-xs text-muted-foreground">HSN: {(item as any).hsn_sac}</span>}
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
                    <span>{formatCurrency(Number((viewingInvoice as any).subtotal || viewingInvoice.amount))}</span>
                  </div>
                  {Number((viewingInvoice as any).cgst_total) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">CGST</span>
                      <span>{formatCurrency(Number((viewingInvoice as any).cgst_total))}</span>
                    </div>
                  )}
                  {Number((viewingInvoice as any).sgst_total) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">SGST</span>
                      <span>{formatCurrency(Number((viewingInvoice as any).sgst_total))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-semibold border-t pt-1.5">
                    <span>Total</span>
                    <span>{formatCurrency(Number((viewingInvoice as any).total_amount || viewingInvoice.amount))}</span>
                  </div>
                </div>

                {(viewingInvoice as any).notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm">{(viewingInvoice as any).notes}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewingInvoice(null)}>Close</Button>
              <Button
                onClick={async () => {
                  if (!viewingInvoice) return;
                  try {
                    toast({ title: "Generating PDF", description: "Please wait..." });
                    await downloadInvoicePdf(viewingInvoice.id);
                    toast({ title: "Download Complete" });
                  } catch (error) {
                    toast({ title: "Download Failed", description: error instanceof Error ? error.message : "Failed", variant: "destructive" });
                  }
                }}
                className="bg-gradient-financial text-white hover:opacity-90"
              >
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
