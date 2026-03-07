import { useState } from "react";
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
import { Plus, Search, FileText, Truck, XCircle, Clock, RefreshCw } from "lucide-react";
import { useEwayBills, EwayBillInsert } from "@/hooks/useEwayBills";
import { format, isPast, differenceInHours } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  generated: "bg-primary/10 text-primary",
  active: "bg-green-500/10 text-green-600",
  expired: "bg-destructive/10 text-destructive",
  cancelled: "bg-destructive/10 text-destructive",
  extended: "bg-accent/80 text-accent-foreground",
};

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

export default function EwayBills() {
  const { ewayBills, isLoading, create, update, cancel, isCreating } = useEwayBills();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showCancel, setShowCancel] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [form, setForm] = useState<EwayBillInsert>(INITIAL_FORM);
  const [activeTab, setActiveTab] = useState("partA");

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

  const handleCreate = async () => {
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

  const setField = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <MainLayout title="GST E-Way Bills" subtitle="Generate, manage and track e-way bills for goods movement">
      <AnimatedPage>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-end">
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
                            <Badge className={STATUS_COLORS[bill.status] ?? ""}>{bill.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {bill.status !== "cancelled" && (
                                <Button size="sm" variant="ghost" onClick={() => setShowCancel(bill.id)}>
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {bill.status === "active" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    update({
                                      id: bill.id,
                                      status: "extended",
                                      extended_count: (bill.extended_count || 0) + 1,
                                      valid_until: new Date(
                                        new Date(bill.valid_until!).getTime() + 24 * 60 * 60 * 1000
                                      ).toISOString(),
                                    })
                                  }
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
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
                    <Input placeholder="GSTIN" value={form.from_gstin ?? ""} onChange={(e) => setField("from_gstin", e.target.value)} />
                    <Input placeholder="Name" value={form.from_name ?? ""} onChange={(e) => setField("from_name", e.target.value)} />
                    <Input placeholder="Place" value={form.from_place ?? ""} onChange={(e) => setField("from_place", e.target.value)} />
                    <Input placeholder="Pincode" value={form.from_pincode ?? ""} onChange={(e) => setField("from_pincode", e.target.value)} />
                    <Input placeholder="State Code" value={form.from_state_code ?? ""} onChange={(e) => setField("from_state_code", e.target.value)} />
                  </div>
                  <div className="space-y-3 p-3 rounded-lg border border-border/50">
                    <p className="text-sm font-medium text-muted-foreground">TO (Consignee)</p>
                    <Input placeholder="GSTIN" value={form.to_gstin ?? ""} onChange={(e) => setField("to_gstin", e.target.value)} />
                    <Input placeholder="Name" value={form.to_name ?? ""} onChange={(e) => setField("to_name", e.target.value)} />
                    <Input placeholder="Place" value={form.to_place ?? ""} onChange={(e) => setField("to_place", e.target.value)} />
                    <Input placeholder="Pincode" value={form.to_pincode ?? ""} onChange={(e) => setField("to_pincode", e.target.value)} />
                    <Input placeholder="State Code" value={form.to_state_code ?? ""} onChange={(e) => setField("to_state_code", e.target.value)} />
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
                    <Label>HSN Code</Label>
                    <Input value={form.hsn_code ?? ""} onChange={(e) => setField("hsn_code", e.target.value)} />
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
                        <SelectItem value="NOS">NOS</SelectItem>
                        <SelectItem value="KGS">KGS</SelectItem>
                        <SelectItem value="MTR">MTR</SelectItem>
                        <SelectItem value="LTR">LTR</SelectItem>
                        <SelectItem value="PCS">PCS</SelectItem>
                        <SelectItem value="BOX">BOX</SelectItem>
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
                  <div>
                    <Label>CGST Rate (%)</Label>
                    <Input type="number" value={form.cgst_rate ?? 0} onChange={(e) => setField("cgst_rate", +e.target.value)} />
                  </div>
                  <div>
                    <Label>SGST Rate (%)</Label>
                    <Input type="number" value={form.sgst_rate ?? 0} onChange={(e) => setField("sgst_rate", +e.target.value)} />
                  </div>
                  <div>
                    <Label>IGST Rate (%)</Label>
                    <Input type="number" value={form.igst_rate ?? 0} onChange={(e) => setField("igst_rate", +e.target.value)} />
                  </div>
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
                        <SelectItem value="ship">Ship</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Vehicle Type</Label>
                    <Select value={form.vehicle_type ?? "regular"} onValueChange={(v) => setField("vehicle_type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular</SelectItem>
                        <SelectItem value="over_dimensional">Over Dimensional Cargo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Vehicle Number</Label>
                    <Input placeholder="e.g. KA01AB1234" value={form.vehicle_number ?? ""} onChange={(e) => setField("vehicle_number", e.target.value.toUpperCase())} />
                  </div>
                  <div>
                    <Label>Transporter Name</Label>
                    <Input value={form.transporter_name ?? ""} onChange={(e) => setField("transporter_name", e.target.value)} />
                  </div>
                  <div>
                    <Label>Transporter ID</Label>
                    <Input value={form.transporter_id ?? ""} onChange={(e) => setField("transporter_id", e.target.value)} />
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
                    <Label>Distance (km)</Label>
                    <Input type="number" value={form.distance_km ?? 0} onChange={(e) => setField("distance_km", +e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} />
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter className="pt-4">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? "Creating..." : "Generate E-Way Bill"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Dialog */}
        <Dialog open={!!showCancel} onOpenChange={() => setShowCancel(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel E-Way Bill</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Cancellation Reason</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="duplicate">Duplicate</SelectItem>
                  <SelectItem value="data_entry_mistake">Data Entry Mistake</SelectItem>
                  <SelectItem value="order_cancelled">Order Cancelled</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancel(null)}>Back</Button>
              <Button variant="destructive" onClick={handleCancel} disabled={!cancelReason}>Confirm Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AnimatedPage>
    </MainLayout>
  );
}
