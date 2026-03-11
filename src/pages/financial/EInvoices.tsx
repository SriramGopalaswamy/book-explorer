import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Plus, QrCode, Search, Shield, Loader2, CheckCircle2, XCircle, Clock, Ban } from "lucide-react";
import { useEInvoices, EInvoiceItem } from "@/hooks/useEInvoices";
import { format } from "date-fns";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

const INDIAN_STATES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
  "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
  "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra & Nagar Haveli", "27": "Maharashtra", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman & Nicobar", "36": "Telangana",
  "37": "Andhra Pradesh", "38": "Ladakh",
};

const SUPPLY_TYPES = [
  { value: "B2B", label: "B2B — Business to Business" },
  { value: "B2C", label: "B2C — Business to Consumer" },
  { value: "SEZWP", label: "SEZ with Payment" },
  { value: "SEZWOP", label: "SEZ without Payment" },
  { value: "EXPWP", label: "Export with Payment" },
  { value: "EXPWOP", label: "Export without Payment" },
  { value: "DEXP", label: "Deemed Export" },
];

const DOC_TYPES = [
  { value: "INV", label: "Invoice" },
  { value: "CRN", label: "Credit Note" },
  { value: "DBN", label: "Debit Note" },
];

const CANCEL_REASONS = [
  { value: "1", label: "Duplicate" },
  { value: "2", label: "Data Entry Mistake" },
  { value: "3", label: "Order Cancelled" },
  { value: "4", label: "Others" },
];

const defaultItem: EInvoiceItem = {
  sl_no: 1, product_description: "", is_service: false, hsn_code: "",
  quantity: 1, unit: "NOS", unit_price: 0, total_amount: 0, discount: 0,
  assessable_value: 0, gst_rate: 18, cgst_amount: 0, sgst_amount: 0,
  igst_amount: 0, cess_amount: 0, total_item_value: 0,
};

export default function EInvoices() {
  const { eInvoices, isLoading, create, generateIRN, cancel, isCreating, isGenerating } = useEInvoices();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("1");
  const [cancelRemark, setCancelRemark] = useState("");

  // Create form state
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState({
    doc_type: "INV", doc_number: "", doc_date: new Date().toISOString().split("T")[0],
    supply_type: "B2B",
    seller_gstin: "", seller_legal_name: "", seller_trade_name: "",
    seller_address: "", seller_location: "", seller_pincode: "", seller_state_code: "",
    buyer_gstin: "", buyer_legal_name: "", buyer_trade_name: "",
    buyer_address: "", buyer_location: "", buyer_pincode: "", buyer_state_code: "", buyer_pos: "",
  });
  const [items, setItems] = useState<EInvoiceItem[]>([{ ...defaultItem }]);

  const isInterState = form.seller_state_code && form.buyer_state_code && form.seller_state_code !== form.buyer_state_code;

  function recalcItem(item: EInvoiceItem): EInvoiceItem {
    const totalAmount = item.quantity * item.unit_price;
    const assessable = totalAmount - item.discount;
    const gstAmount = assessable * (item.gst_rate / 100);
    return {
      ...item,
      total_amount: totalAmount,
      assessable_value: assessable,
      cgst_amount: isInterState ? 0 : gstAmount / 2,
      sgst_amount: isInterState ? 0 : gstAmount / 2,
      igst_amount: isInterState ? gstAmount : 0,
      total_item_value: assessable + gstAmount + item.cess_amount,
    };
  }

  function updateItem(index: number, updates: Partial<EInvoiceItem>) {
    setItems((prev) => prev.map((item, i) => i === index ? recalcItem({ ...item, ...updates }) : item));
  }

  function addItem() {
    setItems((prev) => [...prev, { ...defaultItem, sl_no: prev.length + 1 }]);
  }

  const totals = items.reduce((acc, item) => ({
    assessable: acc.assessable + item.assessable_value,
    cgst: acc.cgst + item.cgst_amount,
    sgst: acc.sgst + item.sgst_amount,
    igst: acc.igst + item.igst_amount,
    cess: acc.cess + item.cess_amount,
    total: acc.total + item.total_item_value,
  }), { assessable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 });

  async function handleCreate() {
    if (!form.doc_number || !form.seller_gstin || !form.buyer_legal_name) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await create({
        ...form,
        items: items as any,
        total_assessable_value: totals.assessable,
        total_cgst: totals.cgst,
        total_sgst: totals.sgst,
        total_igst: totals.igst,
        total_cess: totals.cess,
        total_invoice_value: totals.total,
      });
      setShowCreate(false);
      setWizardStep(0);
    } catch {}
  }

  async function handleCancel() {
    if (!cancelId) return;
    await cancel({ id: cancelId, reason: CANCEL_REASONS.find(r => r.value === cancelReason)?.label || cancelReason, remark: cancelRemark });
    setCancelId(null);
    setCancelRemark("");
  }

  const filtered = eInvoices.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (e.doc_number?.toLowerCase().includes(s) || e.irn?.toLowerCase().includes(s) || e.buyer_legal_name?.toLowerCase().includes(s));
    }
    return true;
  });

  const statusCounts = {
    pending: eInvoices.filter(e => e.status === "pending").length,
    generated: eInvoices.filter(e => e.status === "generated").length,
    cancelled: eInvoices.filter(e => e.status === "cancelled").length,
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case "generated": return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "cancelled": return <XCircle className="h-4 w-4 text-destructive" />;
      case "failed": return <Ban className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  return (
    <MainLayout title="E-Invoices" subtitle="GST E-Invoice Generation & IRN Management (NIC/IRP)">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold">{statusCounts.pending}</p>
            </div>
            <Clock className="h-8 w-8 text-yellow-500 opacity-50" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">IRN Generated</p>
              <p className="text-2xl font-bold">{statusCounts.generated}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-green-500 opacity-50" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Cancelled</p>
              <p className="text-2xl font-bold">{statusCounts.cancelled}</p>
            </div>
            <XCircle className="h-8 w-8 text-destructive opacity-50" />
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <Card className="mb-6">
        <CardContent className="pt-4 pb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by doc number, IRN, or buyer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="generated">Generated</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> New E-Invoice</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create E-Invoice</DialogTitle>
                <DialogDescription>NIC/IRP compliant e-invoice as per GST Rule 48(4)</DialogDescription>
              </DialogHeader>

              <Tabs value={String(wizardStep)} onValueChange={(v) => setWizardStep(Number(v))}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="0">Document & Parties</TabsTrigger>
                  <TabsTrigger value="1">Line Items</TabsTrigger>
                  <TabsTrigger value="2">Review & Submit</TabsTrigger>
                </TabsList>

                <TabsContent value="0" className="space-y-4 mt-4">
                  {/* Document Details */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label>Doc Type *</Label>
                      <Select value={form.doc_type} onValueChange={(v) => setForm(p => ({ ...p, doc_type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{DOC_TYPES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Doc Number *</Label>
                      <Input value={form.doc_number} onChange={(e) => setForm(p => ({ ...p, doc_number: e.target.value }))} placeholder="INV-001" />
                    </div>
                    <div className="space-y-1">
                      <Label>Doc Date *</Label>
                      <Input type="date" value={form.doc_date} onChange={(e) => setForm(p => ({ ...p, doc_date: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Supply Type *</Label>
                      <Select value={form.supply_type} onValueChange={(v) => setForm(p => ({ ...p, supply_type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{SUPPLY_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Seller */}
                  <div className="space-y-2 p-4 rounded-lg border border-border">
                    <h4 className="font-medium text-sm">Seller Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1"><Label>GSTIN *</Label><Input value={form.seller_gstin} onChange={(e) => setForm(p => ({ ...p, seller_gstin: e.target.value.toUpperCase() }))} placeholder="22AAAAA0000A1Z5" maxLength={15} /></div>
                      <div className="space-y-1"><Label>Legal Name *</Label><Input value={form.seller_legal_name} onChange={(e) => setForm(p => ({ ...p, seller_legal_name: e.target.value }))} /></div>
                      <div className="space-y-1"><Label>Address</Label><Input value={form.seller_address} onChange={(e) => setForm(p => ({ ...p, seller_address: e.target.value }))} /></div>
                      <div className="space-y-1"><Label>Location</Label><Input value={form.seller_location} onChange={(e) => setForm(p => ({ ...p, seller_location: e.target.value }))} /></div>
                      <div className="space-y-1"><Label>Pincode *</Label><Input value={form.seller_pincode} onChange={(e) => setForm(p => ({ ...p, seller_pincode: e.target.value.replace(/\D/g, "") }))} maxLength={6} placeholder="6-digit pincode" /></div>
                      <div className="space-y-1">
                        <Label>State</Label>
                        <Select value={form.seller_state_code} onValueChange={(v) => setForm(p => ({ ...p, seller_state_code: v }))}>
                          <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                          <SelectContent>{Object.entries(INDIAN_STATES).sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => <SelectItem key={code} value={code}>{name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Buyer */}
                  <div className="space-y-2 p-4 rounded-lg border border-border">
                    <h4 className="font-medium text-sm">Buyer Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {form.supply_type === "B2B" && (
                        <div className="space-y-1"><Label>GSTIN *</Label><Input value={form.buyer_gstin} onChange={(e) => setForm(p => ({ ...p, buyer_gstin: e.target.value.toUpperCase() }))} placeholder="22AAAAA0000A1Z5" maxLength={15} /></div>
                      )}
                      <div className="space-y-1"><Label>Legal Name *</Label><Input value={form.buyer_legal_name} onChange={(e) => setForm(p => ({ ...p, buyer_legal_name: e.target.value }))} /></div>
                      <div className="space-y-1"><Label>Address</Label><Input value={form.buyer_address} onChange={(e) => setForm(p => ({ ...p, buyer_address: e.target.value }))} /></div>
                      <div className="space-y-1"><Label>Location</Label><Input value={form.buyer_location} onChange={(e) => setForm(p => ({ ...p, buyer_location: e.target.value }))} /></div>
                      <div className="space-y-1"><Label>Pincode *</Label><Input value={form.buyer_pincode} onChange={(e) => setForm(p => ({ ...p, buyer_pincode: e.target.value.replace(/\D/g, "") }))} maxLength={6} placeholder="6-digit pincode" /></div>
                      <div className="space-y-1">
                        <Label>State / Place of Supply</Label>
                        <Select value={form.buyer_state_code} onValueChange={(v) => setForm(p => ({ ...p, buyer_state_code: v, buyer_pos: v }))}>
                          <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                          <SelectContent>{Object.entries(INDIAN_STATES).map(([code, name]) => <SelectItem key={code} value={code}>{code} - {name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    {isInterState && (
                      <Badge variant="outline" className="mt-2 bg-blue-500/10 text-blue-700 border-blue-500/20">
                        Inter-State Supply — IGST applicable
                      </Badge>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => setWizardStep(1)}>Next: Items →</Button>
                  </div>
                </TabsContent>

                <TabsContent value="1" className="space-y-4 mt-4">
                  {items.map((item, i) => (
                    <div key={i} className="p-3 rounded-lg border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Item #{item.sl_no}</span>
                        {items.length > 1 && (
                          <Button size="sm" variant="ghost" className="text-destructive h-7" onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}>Remove</Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="col-span-2 space-y-1"><Label>Description *</Label><Input value={item.product_description} onChange={(e) => updateItem(i, { product_description: e.target.value })} /></div>
                        <div className="space-y-1"><Label>HSN Code *</Label><Input value={item.hsn_code} onChange={(e) => updateItem(i, { hsn_code: e.target.value })} maxLength={8} /></div>
                        <div className="space-y-1"><Label>Unit</Label><Input value={item.unit} onChange={(e) => updateItem(i, { unit: e.target.value })} /></div>
                        <div className="space-y-1"><Label>Qty</Label><Input type="number" value={item.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} /></div>
                        <div className="space-y-1"><Label>Unit Price (₹)</Label><Input type="number" value={item.unit_price} onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })} /></div>
                        <div className="space-y-1"><Label>Discount (₹)</Label><Input type="number" value={item.discount} onChange={(e) => updateItem(i, { discount: Number(e.target.value) })} /></div>
                        <div className="space-y-1"><Label>GST Rate (%)</Label><Input type="number" value={item.gst_rate} onChange={(e) => updateItem(i, { gst_rate: Number(e.target.value) })} /></div>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Assessable: ₹{item.assessable_value.toFixed(2)}</span>
                        {isInterState ? <span>IGST: ₹{item.igst_amount.toFixed(2)}</span> : <><span>CGST: ₹{item.cgst_amount.toFixed(2)}</span><span>SGST: ₹{item.sgst_amount.toFixed(2)}</span></>}
                        <span className="font-medium">Total: ₹{item.total_item_value.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-4 w-4 mr-1" /> Add Item</Button>
                  <div className="flex justify-between">
                    <Button variant="ghost" onClick={() => setWizardStep(0)}>← Back</Button>
                    <Button onClick={() => setWizardStep(2)}>Next: Review →</Button>
                  </div>
                </TabsContent>

                <TabsContent value="2" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-lg border border-border bg-muted/30">
                    <div>
                      <p className="text-xs text-muted-foreground">Document</p>
                      <p className="font-medium">{form.doc_type} — {form.doc_number}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Supply Type</p>
                      <p className="font-medium">{form.supply_type}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Seller</p>
                      <p className="font-medium">{form.seller_legal_name}</p>
                      <p className="text-xs text-muted-foreground">{form.seller_gstin}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Buyer</p>
                      <p className="font-medium">{form.buyer_legal_name}</p>
                      <p className="text-xs text-muted-foreground">{form.buyer_gstin}</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-border">
                    <h4 className="font-medium text-sm mb-2">Value Summary</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Assessable Value:</span> <span className="font-medium">₹{totals.assessable.toFixed(2)}</span></div>
                      {isInterState ? (
                        <div><span className="text-muted-foreground">IGST:</span> <span className="font-medium">₹{totals.igst.toFixed(2)}</span></div>
                      ) : (
                        <><div><span className="text-muted-foreground">CGST:</span> <span className="font-medium">₹{totals.cgst.toFixed(2)}</span></div>
                        <div><span className="text-muted-foreground">SGST:</span> <span className="font-medium">₹{totals.sgst.toFixed(2)}</span></div></>
                      )}
                      <div><span className="text-muted-foreground">Cess:</span> <span className="font-medium">₹{totals.cess.toFixed(2)}</span></div>
                      <div className="col-span-2 sm:col-span-3 pt-2 border-t border-border">
                        <span className="text-muted-foreground">Total Invoice Value:</span>{" "}
                        <span className="text-lg font-bold">₹{totals.total.toFixed(2)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{items.length} item(s)</p>
                  </div>

                  <div className="flex justify-between">
                    <Button variant="ghost" onClick={() => setWizardStep(1)}>← Back</Button>
                    <Button onClick={handleCreate} disabled={isCreating}>
                      {isCreating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
                      Create E-Invoice
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* E-Invoice Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            E-Invoice Register
          </CardTitle>
          <CardDescription>
            Manage GST e-invoices with IRN generation as per Rule 48(4). E-invoicing is mandatory for businesses with turnover exceeding ₹5 Crore.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doc #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead className="text-right">Value (₹)</TableHead>
                <TableHead>IRN</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No e-invoices found</TableCell></TableRow>
              ) : filtered.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.doc_number}</TableCell>
                  <TableCell><Badge variant="outline">{inv.doc_type}</Badge></TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{inv.buyer_legal_name}</p>
                      {inv.buyer_gstin && <p className="text-xs text-muted-foreground">{inv.buyer_gstin}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">₹{Number(inv.total_invoice_value).toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    {inv.irn ? (
                      <div className="max-w-[150px]">
                        <p className="text-xs font-mono truncate" title={inv.irn}>{inv.irn}</p>
                        {inv.ack_number && <p className="text-xs text-muted-foreground">Ack: {inv.ack_number}</p>}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {statusIcon(inv.status)}
                      <span className="text-sm capitalize">{inv.status}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(inv.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {inv.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => generateIRN(inv.id)} disabled={isGenerating}>
                          <QrCode className="h-3.5 w-3.5 mr-1" /> Generate IRN
                        </Button>
                      )}
                      {(inv.status === "pending" || inv.status === "generated") && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelId(inv.id)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      <AlertDialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel E-Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              As per GST rules, e-invoices can only be cancelled within 24 hours of IRN generation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Reason</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CANCEL_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Remarks</Label>
              <Textarea value={cancelRemark} onChange={(e) => setCancelRemark(e.target.value)} placeholder="Additional remarks..." />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel}>Cancel E-Invoice</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
