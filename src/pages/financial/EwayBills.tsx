import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { AnimatedPage } from "@/components/layout/AnimatedPage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Search, FileText, Truck, XCircle, Clock, RefreshCw, AlertTriangle, Info, MoreHorizontal, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useEwayBills, EwayBill, EwayBillInsert } from "@/hooks/useEwayBills";
import { format, isPast, differenceInHours } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  generated: "bg-primary/10 text-primary",
  active: "bg-green-500/10 text-green-600",
  expired: "bg-destructive/10 text-destructive",
  cancelled: "bg-destructive/10 text-destructive",
  extended: "bg-accent/80 text-accent-foreground",
};

const INDIAN_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu & Kashmir" }, { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" }, { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" }, { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" }, { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" }, { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" }, { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" }, { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" }, { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" }, { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" }, { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" }, { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" }, { code: "24", name: "Gujarat" },
  { code: "25", name: "Daman & Diu" }, { code: "26", name: "Dadra & Nagar Haveli" },
  { code: "27", name: "Maharashtra" }, { code: "28", name: "Andhra Pradesh (Old)" },
  { code: "29", name: "Karnataka" }, { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" }, { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" }, { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman & Nicobar" }, { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" }, { code: "38", name: "Ladakh" },
];

const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/;
const PINCODE_REGEX = /^\d{6}$/;
const VEHICLE_REGEX = /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/;
const HSN_REGEX = /^\d{4}$|^\d{6}$|^\d{8}$/;
const EWAY_BILL_THRESHOLD = 50000; // ₹50,000 threshold per GST rules

const INITIAL_FORM: EwayBillInsert = {
  supply_type: "outward",
  sub_supply_type: "supply",
  document_type: "invoice",
  transport_mode: "road",
  vehicle_type: "regular",
  taxable_value: 0,
  total_value: 0,
  quantity: 0,
  distance_km: 0,
};

function validateForm(form: EwayBillInsert): string[] {
  const errors: string[] = [];
  if (form.from_gstin && !GSTIN_REGEX.test(form.from_gstin)) errors.push("From GSTIN format is invalid (e.g. 22AAAAA0000A1Z5)");
  if (form.to_gstin && !GSTIN_REGEX.test(form.to_gstin)) errors.push("To GSTIN format is invalid (e.g. 22AAAAA0000A1Z5)");
  if (form.from_pincode && !PINCODE_REGEX.test(form.from_pincode)) errors.push("From Pincode must be 6 digits");
  if (form.to_pincode && !PINCODE_REGEX.test(form.to_pincode)) errors.push("To Pincode must be 6 digits");
  if (form.vehicle_number && !VEHICLE_REGEX.test(form.vehicle_number)) errors.push("Vehicle Number format invalid (e.g. KA01AB1234)");
  if (form.hsn_code && !HSN_REGEX.test(form.hsn_code)) errors.push("HSN Code must be 4, 6, or 8 digits");
  if (!form.taxable_value || form.taxable_value <= 0) errors.push("Taxable value is required");
  if (!form.total_value || form.total_value <= 0) errors.push("Total value is required");
  return errors;
}

export default function EwayBills() {
  const { ewayBills, isLoading, create, update, cancel, remove, isCreating } = useEwayBills();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showCancel, setShowCancel] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [form, setForm] = useState<EwayBillInsert>(INITIAL_FORM);
  const [activeTab, setActiveTab] = useState("partA");
  const [editingBill, setEditingBill] = useState<EwayBill | null>(null);
  const [editForm, setEditForm] = useState<EwayBillInsert>(INITIAL_FORM);
  const [editTab, setEditTab] = useState("partA");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const filtered = ewayBills.filter(
    (b) =>
      (b.eway_bill_number ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (b.document_number ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (b.to_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (b.vehicle_number ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const counts = {
    all: ewayBills.length,
    active: ewayBills.filter((b) => b.status === "active" || b.status === "generated").length,
    expiring: ewayBills.filter(
      (b) => b.valid_until && !isPast(new Date(b.valid_until)) && differenceInHours(new Date(b.valid_until), new Date()) < 24
    ).length,
    expired: ewayBills.filter((b) => b.status === "expired" || (b.valid_until && isPast(new Date(b.valid_until)) && b.status !== "cancelled")).length,
    cancelled: ewayBills.filter((b) => b.status === "cancelled").length,
  };

  const formErrors = useMemo(() => validateForm(form), [form]);
  const belowThreshold = (form.total_value ?? 0) > 0 && (form.total_value ?? 0) < EWAY_BILL_THRESHOLD;
  const isInterState = form.from_state_code && form.to_state_code && form.from_state_code !== form.to_state_code;

  const handleCreate = async () => {
    if (formErrors.length > 0) return;
    await create(form);
    setShowCreate(false);
    setForm(INITIAL_FORM);
  };

  const handleCancel = async () => {
    if (showCancel && cancelReason) {
      await cancel({ id: showCancel, reason: cancelReason });
      setShowCancel(null);
      setCancelReason("");
    }
  };

  const handleUpdate = async () => {
    if (!editingBill) return;
    await update({ id: editingBill.id, ...editForm });
    setEditingBill(null);
    setEditForm(INITIAL_FORM);
  };

  const setField = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));
  const setEditField = (key: string, value: any) => setEditForm((prev) => ({ ...prev, [key]: value }));

  return (
    <MainLayout title="GST E-Way Bills" subtitle="Generate, manage and track e-way bills for goods movement as per GST Rule 138">
      <AnimatedPage>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              <span>E-Way Bill mandatory for goods movement exceeding ₹{EWAY_BILL_THRESHOLD.toLocaleString("en-IN")} (GST Rule 138)</span>
            </div>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New E-Way Bill
            </Button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Total", value: counts.all, icon: FileText, color: "text-foreground" },
              { label: "Active", value: counts.active, icon: Truck, color: "text-green-500" },
              { label: "Expiring Soon", value: counts.expiring, icon: Clock, color: "text-yellow-500" },
              { label: "Expired", value: counts.expired, icon: XCircle, color: "text-destructive" },
              { label: "Cancelled", value: counts.cancelled, icon: XCircle, color: "text-muted-foreground" },
            ].map((c) => (
              <Card key={c.label} className="border-border/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <c.icon className={`h-5 w-5 ${c.color}`} />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{c.value}</p>
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Table */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search bills..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>E-Way Bill #</TableHead>
                    <TableHead>Document #</TableHead>
                    <TableHead>To Party</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="text-right">Value (₹)</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No e-way bills found</TableCell></TableRow>
                  ) : (
                    filtered.map((bill) => {
                      const isExpiringSoon = bill.valid_until && !isPast(new Date(bill.valid_until)) && differenceInHours(new Date(bill.valid_until), new Date()) < 24;
                      return (
                        <TableRow key={bill.id}>
                          <TableCell className="font-mono text-sm">{bill.eway_bill_number || "—"}</TableCell>
                          <TableCell>{bill.document_number || "—"}</TableCell>
                          <TableCell>{bill.to_name || "—"}</TableCell>
                          <TableCell className="font-mono">{bill.vehicle_number || "—"}</TableCell>
                          <TableCell className="text-right font-medium">₹{bill.total_value.toLocaleString("en-IN")}</TableCell>
                          <TableCell>
                            {bill.valid_until ? (
                              <span className={isExpiringSoon ? "text-yellow-500 font-medium" : ""}>
                                {format(new Date(bill.valid_until), "dd MMM yyyy HH:mm")}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge className={STATUS_COLORS[bill.status] ?? ""}>{bill.status}</Badge>
                              {bill.status === "cancelled" && ((bill as any).cancellation_reason || (bill as any).cancel_reason) && (
                                <p className="text-xs text-destructive max-w-[160px] truncate" title={(bill as any).cancellation_reason || (bill as any).cancel_reason}>
                                  Reason: {(bill as any).cancellation_reason || (bill as any).cancel_reason}
                                </p>
                              )}
                              {bill.status === "cancelled" && (bill as any).cancelled_at && (
                                <p className="text-xs text-muted-foreground">
                                  {(() => { try { return format(new Date((bill as any).cancelled_at), "dd MMM yyyy"); } catch { return ""; } })()}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {bill.status === "draft" && (
                                  <DropdownMenuItem onClick={() => { setEditingBill(bill); setEditForm(bill); setEditTab("partA"); }}>
                                    <Pencil className="h-4 w-4 mr-2" /> Edit
                                  </DropdownMenuItem>
                                )}
                                {bill.status === "draft" && (
                                  <DropdownMenuItem onClick={() => update({ id: bill.id, status: "generated" })}>
                                    <CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Generated
                                  </DropdownMenuItem>
                                )}
                                {bill.status === "generated" && (
                                  <DropdownMenuItem onClick={() => update({ id: bill.id, status: "active" })}>
                                    <CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Active
                                  </DropdownMenuItem>
                                )}
                                {bill.status === "active" && (
                                  <DropdownMenuItem onClick={() => update({ id: bill.id, status: "extended", extended_count: (bill.extended_count || 0) + 1, valid_until: new Date(new Date(bill.valid_until!).getTime() + 24 * 60 * 60 * 1000).toISOString() })}>
                                    <RefreshCw className="h-4 w-4 mr-2" /> Extend Validity (+1 day)
                                  </DropdownMenuItem>
                                )}
                                {bill.status !== "cancelled" && bill.status !== "expired" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setShowCancel(bill.id)} className="text-destructive">
                                      <XCircle className="h-4 w-4 mr-2" /> Cancel Bill
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {(bill.status === "draft" || bill.status === "cancelled") && (
                                  <DropdownMenuItem onClick={() => setDeleteTarget(bill.id)} className="text-destructive">
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Create Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Generate E-Way Bill</DialogTitle>
            </DialogHeader>

            {/* Threshold Warning */}
            {belowThreshold && (
              <Alert variant="destructive" className="border-yellow-500/50 bg-yellow-500/10">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <AlertDescription className="text-yellow-600 text-sm">
                  Total value is below ₹{EWAY_BILL_THRESHOLD.toLocaleString("en-IN")}. E-Way Bill is generally mandatory only for consignments exceeding this threshold as per GST Rule 138.
                </AlertDescription>
              </Alert>
            )}

            {/* Inter-state indicator */}
            {isInterState && (
              <Alert className="border-primary/30 bg-primary/5">
                <Info className="h-4 w-4 text-primary" />
                <AlertDescription className="text-sm">
                  Inter-state supply detected. IGST will apply. Ensure IGST rate is correctly set instead of CGST+SGST.
                </AlertDescription>
              </Alert>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="partA">Part A – Supply</TabsTrigger>
                <TabsTrigger value="goods">Goods Details</TabsTrigger>
                <TabsTrigger value="partB">Part B – Transport</TabsTrigger>
              </TabsList>

              <TabsContent value="partA" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Supply Type</Label>
                    <Select value={form.supply_type} onValueChange={(v) => setField("supply_type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outward">Outward</SelectItem>
                        <SelectItem value="inward">Inward</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Document Type</Label>
                    <Select value={form.document_type ?? "invoice"} onValueChange={(v) => setField("document_type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invoice">Tax Invoice</SelectItem>
                        <SelectItem value="bill_of_supply">Bill of Supply</SelectItem>
                        <SelectItem value="delivery_challan">Delivery Challan</SelectItem>
                        <SelectItem value="credit_note">Credit Note</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Document Number</Label>
                    <Input value={form.document_number ?? ""} onChange={(e) => setField("document_number", e.target.value)} />
                  </div>
                  <div>
                    <Label>Document Date</Label>
                    <Input type="date" value={form.document_date ?? ""} onChange={(e) => setField("document_date", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-3 p-3 rounded-lg border border-border/50">
                    <p className="text-sm font-medium text-muted-foreground">FROM (Consignor)</p>
                    <div>
                      <Input placeholder="GSTIN (e.g. 22AAAAA0000A1Z5)" value={form.from_gstin ?? ""} onChange={(e) => setField("from_gstin", e.target.value.toUpperCase())} maxLength={15} />
                      {form.from_gstin && !GSTIN_REGEX.test(form.from_gstin) && (
                        <p className="text-xs text-destructive mt-1">Invalid GSTIN format</p>
                      )}
                    </div>
                    <Input placeholder="Name" value={form.from_name ?? ""} onChange={(e) => setField("from_name", e.target.value)} />
                    <Input placeholder="Place" value={form.from_place ?? ""} onChange={(e) => setField("from_place", e.target.value)} />
                    <div>
                      <Input placeholder="Pincode (6 digits)" value={form.from_pincode ?? ""} onChange={(e) => setField("from_pincode", e.target.value.replace(/\D/g, ""))} maxLength={6} />
                      {form.from_pincode && !PINCODE_REGEX.test(form.from_pincode) && (
                        <p className="text-xs text-destructive mt-1">Must be 6 digits</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">State</Label>
                      <Select value={form.from_state_code ?? ""} onValueChange={(v) => setField("from_state_code", v)}>
                        <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                        <SelectContent>
                          {[...INDIAN_STATES].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                            <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-3 p-3 rounded-lg border border-border/50">
                    <p className="text-sm font-medium text-muted-foreground">TO (Consignee)</p>
                    <div>
                      <Input placeholder="GSTIN (e.g. 22AAAAA0000A1Z5)" value={form.to_gstin ?? ""} onChange={(e) => setField("to_gstin", e.target.value.toUpperCase())} maxLength={15} />
                      {form.to_gstin && !GSTIN_REGEX.test(form.to_gstin) && (
                        <p className="text-xs text-destructive mt-1">Invalid GSTIN format</p>
                      )}
                    </div>
                    <Input placeholder="Name" value={form.to_name ?? ""} onChange={(e) => setField("to_name", e.target.value)} />
                    <Input placeholder="Place" value={form.to_place ?? ""} onChange={(e) => setField("to_place", e.target.value)} />
                    <div>
                      <Input placeholder="Pincode (6 digits)" value={form.to_pincode ?? ""} onChange={(e) => setField("to_pincode", e.target.value.replace(/\D/g, ""))} maxLength={6} />
                      {form.to_pincode && !PINCODE_REGEX.test(form.to_pincode) && (
                        <p className="text-xs text-destructive mt-1">Must be 6 digits</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">State</Label>
                      <Select value={form.to_state_code ?? ""} onValueChange={(v) => setField("to_state_code", v)}>
                        <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                        <SelectContent>
                          {[...INDIAN_STATES].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                            <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="goods" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Product Name</Label>
                    <Input value={form.product_name ?? ""} onChange={(e) => setField("product_name", e.target.value)} />
                  </div>
                  <div>
                    <Label>HSN Code (4/6/8 digits)</Label>
                    <Input value={form.hsn_code ?? ""} onChange={(e) => setField("hsn_code", e.target.value.replace(/\D/g, ""))} maxLength={8} placeholder="e.g. 84713010" />
                    {form.hsn_code && !HSN_REGEX.test(form.hsn_code) && (
                      <p className="text-xs text-destructive mt-1">HSN must be 4, 6, or 8 digits</p>
                    )}
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input type="number" value={form.quantity ?? 0} onChange={(e) => setField("quantity", +e.target.value)} />
                  </div>
                  <div>
                    <Label>Unit</Label>
                    <Select value={form.unit ?? "NOS"} onValueChange={(v) => setField("unit", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NOS">NOS – Numbers</SelectItem>
                        <SelectItem value="KGS">KGS – Kilograms</SelectItem>
                        <SelectItem value="MTR">MTR – Meters</SelectItem>
                        <SelectItem value="LTR">LTR – Litres</SelectItem>
                        <SelectItem value="PCS">PCS – Pieces</SelectItem>
                        <SelectItem value="BOX">BOX – Boxes</SelectItem>
                        <SelectItem value="QTL">QTL – Quintals</SelectItem>
                        <SelectItem value="TON">TON – Tonnes</SelectItem>
                        <SelectItem value="SQF">SQF – Sq. Feet</SelectItem>
                        <SelectItem value="SQM">SQM – Sq. Meters</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Taxable Value (₹)</Label>
                    <Input type="number" value={form.taxable_value} onChange={(e) => setField("taxable_value", +e.target.value)} />
                  </div>
                  <div>
                    <Label>Total Value (₹)</Label>
                    <Input type="number" value={form.total_value} onChange={(e) => setField("total_value", +e.target.value)} />
                  </div>
                  {!isInterState && (
                    <>
                      <div>
                        <Label>CGST Rate (%)</Label>
                        <Input type="number" value={form.cgst_rate ?? 0} onChange={(e) => setField("cgst_rate", +e.target.value)} />
                      </div>
                      <div>
                        <Label>SGST Rate (%)</Label>
                        <Input type="number" value={form.sgst_rate ?? 0} onChange={(e) => setField("sgst_rate", +e.target.value)} />
                      </div>
                    </>
                  )}
                  {isInterState && (
                    <div>
                      <Label>IGST Rate (%)</Label>
                      <Input type="number" value={form.igst_rate ?? 0} onChange={(e) => setField("igst_rate", +e.target.value)} />
                    </div>
                  )}
                  {!isInterState && (
                    <div>
                      <Label>IGST Rate (%) <span className="text-muted-foreground text-xs">— if applicable</span></Label>
                      <Input type="number" value={form.igst_rate ?? 0} onChange={(e) => setField("igst_rate", +e.target.value)} />
                    </div>
                  )}
                  <div>
                    <Label>Cess Rate (%)</Label>
                    <Input type="number" value={form.cess_rate ?? 0} onChange={(e) => setField("cess_rate", +e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Product Description</Label>
                  <Textarea value={form.product_description ?? ""} onChange={(e) => setField("product_description", e.target.value)} />
                </div>
              </TabsContent>

              <TabsContent value="partB" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Transport Mode</Label>
                    <Select value={form.transport_mode ?? "road"} onValueChange={(v) => setField("transport_mode", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="road">Road</SelectItem>
                        <SelectItem value="rail">Rail</SelectItem>
                        <SelectItem value="air">Air</SelectItem>
                        <SelectItem value="ship">Ship/Inland Waterways</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Vehicle Type</Label>
                    <Select value={form.vehicle_type ?? "regular"} onValueChange={(v) => setField("vehicle_type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular</SelectItem>
                        <SelectItem value="over_dimensional">Over Dimensional Cargo (ODC)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Vehicle Number</Label>
                    <Input placeholder="e.g. KA01AB1234" value={form.vehicle_number ?? ""} onChange={(e) => setField("vehicle_number", e.target.value.toUpperCase().replace(/\s/g, ""))} />
                    {form.vehicle_number && !VEHICLE_REGEX.test(form.vehicle_number) && (
                      <p className="text-xs text-destructive mt-1">Invalid format (e.g. KA01AB1234)</p>
                    )}
                  </div>
                  <div>
                    <Label>Transporter Name</Label>
                    <Input value={form.transporter_name ?? ""} onChange={(e) => setField("transporter_name", e.target.value)} />
                  </div>
                  <div>
                    <Label>Transporter ID (GSTIN)</Label>
                    <Input placeholder="Transporter GSTIN" value={form.transporter_id ?? ""} onChange={(e) => setField("transporter_id", e.target.value.toUpperCase())} maxLength={15} />
                  </div>
                  <div>
                    <Label>Transport Doc #</Label>
                    <Input value={form.transport_doc_number ?? ""} onChange={(e) => setField("transport_doc_number", e.target.value)} />
                  </div>
                  <div>
                    <Label>Transport Doc Date</Label>
                    <Input type="date" value={form.transport_doc_date ?? ""} onChange={(e) => setField("transport_doc_date", e.target.value)} />
                  </div>
                  <div>
                    <Label>Approx. Distance (km)</Label>
                    <Input type="number" value={form.distance_km ?? 0} onChange={(e) => setField("distance_km", +e.target.value)} />
                    <p className="text-xs text-muted-foreground mt-1">
                      Validity: {(form.distance_km ?? 0) <= 100 ? "1 day" : (form.distance_km ?? 0) <= 300 ? "3 days" : (form.distance_km ?? 0) <= 500 ? "5 days" : "Based on distance"} (per Rule 138(10))
                    </p>
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} />
                </div>
              </TabsContent>
            </Tabs>

            {/* Validation errors */}
            {formErrors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                {formErrors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" /> {e}
                  </p>
                ))}
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isCreating || formErrors.length > 0}>
                {isCreating ? "Creating..." : "Generate E-Way Bill"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editingBill} onOpenChange={(open) => { if (!open) { setEditingBill(null); setEditForm(INITIAL_FORM); } }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit E-Way Bill</DialogTitle>
            </DialogHeader>

            <Tabs value={editTab} onValueChange={setEditTab}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="partA">Part A – Supply</TabsTrigger>
                <TabsTrigger value="goods">Goods Details</TabsTrigger>
                <TabsTrigger value="partB">Part B – Transport</TabsTrigger>
              </TabsList>

              <TabsContent value="partA" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Supply Type</Label>
                    <Select value={editForm.supply_type} onValueChange={(v) => setEditField("supply_type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outward">Outward</SelectItem>
                        <SelectItem value="inward">Inward</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Document Type</Label>
                    <Select value={editForm.document_type ?? "invoice"} onValueChange={(v) => setEditField("document_type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invoice">Tax Invoice</SelectItem>
                        <SelectItem value="bill_of_supply">Bill of Supply</SelectItem>
                        <SelectItem value="delivery_challan">Delivery Challan</SelectItem>
                        <SelectItem value="credit_note">Credit Note</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Document Number</Label>
                    <Input value={editForm.document_number ?? ""} onChange={(e) => setEditField("document_number", e.target.value)} />
                  </div>
                  <div>
                    <Label>Document Date</Label>
                    <Input type="date" value={editForm.document_date ?? ""} onChange={(e) => setEditField("document_date", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-3 p-3 rounded-lg border border-border/50">
                    <p className="text-sm font-medium text-muted-foreground">FROM (Consignor)</p>
                    <Input placeholder="GSTIN" value={editForm.from_gstin ?? ""} onChange={(e) => setEditField("from_gstin", e.target.value.toUpperCase())} maxLength={15} />
                    <Input placeholder="Name" value={editForm.from_name ?? ""} onChange={(e) => setEditField("from_name", e.target.value)} />
                    <Input placeholder="Place" value={editForm.from_place ?? ""} onChange={(e) => setEditField("from_place", e.target.value)} />
                    <Input placeholder="Pincode (6 digits)" value={editForm.from_pincode ?? ""} onChange={(e) => setEditField("from_pincode", e.target.value.replace(/\D/g, ""))} maxLength={6} />
                    <div>
                      <Label className="text-xs text-muted-foreground">State</Label>
                      <Select value={editForm.from_state_code ?? ""} onValueChange={(v) => setEditField("from_state_code", v)}>
                        <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                        <SelectContent>
                          {[...INDIAN_STATES].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                            <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-3 p-3 rounded-lg border border-border/50">
                    <p className="text-sm font-medium text-muted-foreground">TO (Consignee)</p>
                    <Input placeholder="GSTIN" value={editForm.to_gstin ?? ""} onChange={(e) => setEditField("to_gstin", e.target.value.toUpperCase())} maxLength={15} />
                    <Input placeholder="Name" value={editForm.to_name ?? ""} onChange={(e) => setEditField("to_name", e.target.value)} />
                    <Input placeholder="Place" value={editForm.to_place ?? ""} onChange={(e) => setEditField("to_place", e.target.value)} />
                    <Input placeholder="Pincode (6 digits)" value={editForm.to_pincode ?? ""} onChange={(e) => setEditField("to_pincode", e.target.value.replace(/\D/g, ""))} maxLength={6} />
                    <div>
                      <Label className="text-xs text-muted-foreground">State</Label>
                      <Select value={editForm.to_state_code ?? ""} onValueChange={(v) => setEditField("to_state_code", v)}>
                        <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                        <SelectContent>
                          {[...INDIAN_STATES].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                            <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="goods" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Product Name</Label>
                    <Input value={editForm.product_name ?? ""} onChange={(e) => setEditField("product_name", e.target.value)} />
                  </div>
                  <div>
                    <Label>HSN Code (4/6/8 digits)</Label>
                    <Input value={editForm.hsn_code ?? ""} onChange={(e) => setEditField("hsn_code", e.target.value.replace(/\D/g, ""))} maxLength={8} placeholder="e.g. 84713010" />
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input type="number" value={editForm.quantity ?? 0} onChange={(e) => setEditField("quantity", +e.target.value)} />
                  </div>
                  <div>
                    <Label>Unit</Label>
                    <Select value={editForm.unit ?? "NOS"} onValueChange={(v) => setEditField("unit", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NOS">NOS – Numbers</SelectItem>
                        <SelectItem value="KGS">KGS – Kilograms</SelectItem>
                        <SelectItem value="MTR">MTR – Meters</SelectItem>
                        <SelectItem value="LTR">LTR – Litres</SelectItem>
                        <SelectItem value="PCS">PCS – Pieces</SelectItem>
                        <SelectItem value="BOX">BOX – Boxes</SelectItem>
                        <SelectItem value="QTL">QTL – Quintals</SelectItem>
                        <SelectItem value="TON">TON – Tonnes</SelectItem>
                        <SelectItem value="SQF">SQF – Sq. Feet</SelectItem>
                        <SelectItem value="SQM">SQM – Sq. Meters</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Taxable Value (₹)</Label>
                    <Input type="number" value={editForm.taxable_value} onChange={(e) => setEditField("taxable_value", +e.target.value)} />
                  </div>
                  <div>
                    <Label>Total Value (₹)</Label>
                    <Input type="number" value={editForm.total_value} onChange={(e) => setEditField("total_value", +e.target.value)} />
                  </div>
                  <div>
                    <Label>CGST Rate (%)</Label>
                    <Input type="number" value={editForm.cgst_rate ?? 0} onChange={(e) => setEditField("cgst_rate", +e.target.value)} />
                  </div>
                  <div>
                    <Label>SGST Rate (%)</Label>
                    <Input type="number" value={editForm.sgst_rate ?? 0} onChange={(e) => setEditField("sgst_rate", +e.target.value)} />
                  </div>
                  <div>
                    <Label>IGST Rate (%)</Label>
                    <Input type="number" value={editForm.igst_rate ?? 0} onChange={(e) => setEditField("igst_rate", +e.target.value)} />
                  </div>
                  <div>
                    <Label>Cess Rate (%)</Label>
                    <Input type="number" value={editForm.cess_rate ?? 0} onChange={(e) => setEditField("cess_rate", +e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Product Description</Label>
                  <Textarea value={editForm.product_description ?? ""} onChange={(e) => setEditField("product_description", e.target.value)} />
                </div>
              </TabsContent>

              <TabsContent value="partB" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Transport Mode</Label>
                    <Select value={editForm.transport_mode ?? "road"} onValueChange={(v) => setEditField("transport_mode", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="road">Road</SelectItem>
                        <SelectItem value="rail">Rail</SelectItem>
                        <SelectItem value="air">Air</SelectItem>
                        <SelectItem value="ship">Ship/Inland Waterways</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Vehicle Type</Label>
                    <Select value={editForm.vehicle_type ?? "regular"} onValueChange={(v) => setEditField("vehicle_type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular</SelectItem>
                        <SelectItem value="over_dimensional">Over Dimensional Cargo (ODC)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Vehicle Number</Label>
                    <Input placeholder="e.g. KA01AB1234" value={editForm.vehicle_number ?? ""} onChange={(e) => setEditField("vehicle_number", e.target.value.toUpperCase().replace(/\s/g, ""))} />
                  </div>
                  <div>
                    <Label>Transporter Name</Label>
                    <Input value={editForm.transporter_name ?? ""} onChange={(e) => setEditField("transporter_name", e.target.value)} />
                  </div>
                  <div>
                    <Label>Transporter ID (GSTIN)</Label>
                    <Input placeholder="Transporter GSTIN" value={editForm.transporter_id ?? ""} onChange={(e) => setEditField("transporter_id", e.target.value.toUpperCase())} maxLength={15} />
                  </div>
                  <div>
                    <Label>Transport Doc #</Label>
                    <Input value={editForm.transport_doc_number ?? ""} onChange={(e) => setEditField("transport_doc_number", e.target.value)} />
                  </div>
                  <div>
                    <Label>Transport Doc Date</Label>
                    <Input type="date" value={editForm.transport_doc_date ?? ""} onChange={(e) => setEditField("transport_doc_date", e.target.value)} />
                  </div>
                  <div>
                    <Label>Approx. Distance (km)</Label>
                    <Input type="number" value={editForm.distance_km ?? 0} onChange={(e) => setEditField("distance_km", +e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={editForm.notes ?? ""} onChange={(e) => setEditField("notes", e.target.value)} />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="pt-4">
              <Button variant="outline" onClick={() => { setEditingBill(null); setEditForm(INITIAL_FORM); }}>Cancel</Button>
              <Button onClick={handleUpdate}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete E-Way Bill</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete this E-Way Bill? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { if (deleteTarget) { remove(deleteTarget); setDeleteTarget(null); } }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Cancel Dialog */}
        <Dialog open={!!showCancel} onOpenChange={() => setShowCancel(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel E-Way Bill</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">As per GST Rule 138(14), an E-Way Bill can be cancelled within 24 hours of generation.</p>
            <div className="space-y-3">
              <Label>Cancellation Reason</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="duplicate">Duplicate</SelectItem>
                  <SelectItem value="data_entry_mistake">Data Entry Mistake</SelectItem>
                  <SelectItem value="order_cancelled">Order Cancelled</SelectItem>
                  <SelectItem value="goods_not_transported">Goods Not Transported</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancel(null)}>Close</Button>
              <Button variant="destructive" onClick={handleCancel} disabled={!cancelReason}>Confirm Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AnimatedPage>
    </MainLayout>
  );
}
