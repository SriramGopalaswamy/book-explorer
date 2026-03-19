import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, Column } from "@/components/ui/data-table";
import { Plus, ShoppingBag, Clock, Truck, CheckCircle, Search, Trash2, FileText, PackageCheck, Pencil, Eye, RotateCcw } from "lucide-react";
import { useSalesOrders, useCreateSalesOrder, useUpdateSOStatus, useDeleteSalesOrder, useUpdateSalesOrder, SalesOrder } from "@/hooks/useSalesOrders";
import { useSalesOrderItems } from "@/hooks/useSalesOrders";
import { useConvertSOToInvoice, useCreateDeliveryNote } from "@/hooks/useDocumentChains";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  confirmed: "bg-blue-500/20 text-blue-400",
  processing: "bg-yellow-500/20 text-yellow-400",
  partially_shipped: "bg-orange-500/20 text-orange-400",
  shipped: "bg-cyan-500/20 text-cyan-400",
  delivered: "bg-green-500/20 text-green-400",
  invoiced: "bg-purple-500/20 text-purple-400",
  cancelled: "bg-destructive/20 text-destructive",
  returned: "bg-orange-500/20 text-orange-400",
};

export default function SalesOrders() {
  const { data: orders = [], isLoading } = useSalesOrders();
  const createSO = useCreateSalesOrder();
  const updateSO = useUpdateSalesOrder();
  const updateStatus = useUpdateSOStatus();
  const deleteSO = useDeleteSalesOrder();
  const convertToInvoice = useConvertSOToInvoice();
  const createDN = useCreateDeliveryNote();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ customer_name: "", order_date: format(new Date(), "yyyy-MM-dd"), expected_delivery: "", notes: "" });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSO, setEditingSO] = useState<SalesOrder | null>(null);
  const [editForm, setEditForm] = useState({ customer_name: "", order_date: "", expected_delivery: "", notes: "" });
  const [editItems, setEditItems] = useState<{ description: string; quantity: number; unit_price: number; tax_rate: number }[]>([]);
  const { data: editSOItems = [] } = useSalesOrderItems(editingSO?.id);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingSO, setViewingSO] = useState<SalesOrder | null>(null);
  const { data: viewSOItems = [] } = useSalesOrderItems(viewingSO?.id);
  // Fetch customers for dropdown
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-so-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name").eq("status", "active").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch existing delivery notes to know which SOs already have one
  const { data: existingDNs = [] } = useQuery({
    queryKey: ["delivery-notes-so-ids"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_notes" as any).select("sales_order_id");
      if (error) throw error;
      return (data || []).map((d: any) => d.sales_order_id).filter(Boolean) as string[];
    },
  });

  const [items, setItems] = useState([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);

  const filtered = orders.filter((o) => {
    const matchSearch = o.so_number.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: orders.length,
    draft: orders.filter((o) => o.status === "draft").length,
    confirmed: orders.filter((o) => o.status === "confirmed").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  };

  const addItem = () => setItems([...items, { description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => {
    const updated = [...items];
    (updated[i] as any)[field] = value;
    setItems(updated);
  };

  const handleCreate = () => {
    if (!form.customer_name || items.some((i) => !i.description)) return;
    createSO.mutate({ ...form, items }, {
      onSuccess: () => {
        setDialogOpen(false);
        setForm({ customer_name: "", order_date: format(new Date(), "yyyy-MM-dd"), expected_delivery: "", notes: "" });
        setItems([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);
      },
    });
  };

  const openEditSO = (so: SalesOrder) => {
    setEditingSO(so);
    setEditForm({ customer_name: so.customer_name, order_date: so.order_date, expected_delivery: so.expected_delivery || "", notes: so.notes || "" });
    setEditItems([]);
    setEditDialogOpen(true);
  };

  // Populate edit items when SO items load
  const editItemsReady = editingSO && editSOItems.length > 0 && editItems.length === 0;
  if (editItemsReady) {
    setEditItems(editSOItems.map(i => ({ description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price), tax_rate: Number(i.tax_rate) })));
  }

  const handleEditSave = () => {
    if (!editingSO) return;
    updateSO.mutate({ id: editingSO.id, ...editForm, items: editItems }, {
      onSuccess: () => { setEditDialogOpen(false); setEditingSO(null); },
    });
  };

  const hasDN = (soId: string) => existingDNs.includes(soId);

  const columns: Column<SalesOrder>[] = [
    { key: "so_number", header: "SO #", render: (r) => <span className="font-mono font-semibold text-foreground">{r.so_number}</span> },
    { key: "customer_name", header: "Customer" },
    { key: "order_date", header: "Date", render: (r) => format(new Date(r.order_date), "dd MMM yyyy") },
    { key: "total_amount", header: "Total", render: (r) => <span className="font-semibold">₹{Number(r.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span> },
    {
      key: "status", header: "Status",
      render: (r) => <Badge className={statusColors[r.status] || ""}>{r.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>,
    },
    {
      key: "id" as any, header: "Actions",
      render: (r) => (
        <div className="flex items-center gap-1">
          {r.status === "draft" && (
            <Button variant="outline" size="sm" onClick={() => openEditSO(r)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
          {r.status !== "draft" && (
            <Button variant="outline" size="sm" onClick={() => { setViewingSO(r); setViewDialogOpen(true); }}>
              <Eye className="h-3.5 w-3.5 mr-1" /> View
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {r.status === "draft" && <DropdownMenuItem onClick={() => updateStatus.mutate({ id: r.id, status: "confirmed" })}><CheckCircle className="h-4 w-4 mr-2" /> Confirm</DropdownMenuItem>}
              {["confirmed", "processing"].includes(r.status) && !hasDN(r.id) && (
                <DropdownMenuItem onClick={() => createDN.mutate({ sales_order_id: r.id, delivery_date: new Date().toISOString().split("T")[0] })}>
                  <PackageCheck className="h-4 w-4 mr-2" /> Create Delivery Note
                </DropdownMenuItem>
              )}
              {["confirmed", "processing"].includes(r.status) && hasDN(r.id) && (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  <PackageCheck className="h-4 w-4 mr-2" /> DN Already Created
                </DropdownMenuItem>
              )}
              {["delivered", "shipped"].includes(r.status) && (
                <DropdownMenuItem onClick={() => convertToInvoice.mutate(r)}>
                  <FileText className="h-4 w-4 mr-2" /> Convert to Invoice
                </DropdownMenuItem>
              )}
              {r.status === "delivered" && (
                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: r.id, status: "returned" })}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Mark as Returned
                </DropdownMenuItem>
              )}
              {r.status === "draft" && (
                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: r.id, status: "cancelled" })} className="text-destructive">
                  Cancel Order
                </DropdownMenuItem>
              )}
              {r.status === "draft" && (
                <DropdownMenuItem onClick={() => deleteSO.mutate(r.id)} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <MainLayout title="Sales Orders" subtitle="Manage customer order lifecycle">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New SO</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Sales Order</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Customer *</Label>
                    <Select value={form.customer_name} onValueChange={(v) => setForm({ ...form, customer_name: v })}>
                      <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                      <SelectContent>
                        {customers.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Order Date</Label><Input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} /></div>
                  <div><Label>Expected Delivery</Label><Input type="date" value={form.expected_delivery} onChange={(e) => setForm({ ...form, expected_delivery: e.target.value })} /></div>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between"><Label className="text-base font-semibold">Line Items</Label><Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
                  {items.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_80px_100px_80px_32px] gap-2 items-end">
                      <div><Label className="text-xs">Description</Label><Input value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} /></div>
                      <div><Label className="text-xs">Qty</Label><Input type="number" value={item.quantity} onChange={(e) => updateItem(i, "quantity", Number(e.target.value))} /></div>
                      <div><Label className="text-xs">Unit Price</Label><Input type="number" value={item.unit_price} onChange={(e) => updateItem(i, "unit_price", Number(e.target.value))} /></div>
                      <div><Label className="text-xs">Tax %</Label><Input type="number" value={item.tax_rate} onChange={(e) => updateItem(i, "tax_rate", Number(e.target.value))} /></div>
                      <Button variant="ghost" size="icon" onClick={() => removeItem(i)} disabled={items.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  ))}
                </div>
                <Button onClick={handleCreate} disabled={createSO.isPending} className="w-full">{createSO.isPending ? "Creating..." : "Create Sales Order"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ShoppingBag className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total SOs</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Clock className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.draft}</p><p className="text-xs text-muted-foreground">Drafts</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Truck className="h-8 w-8 text-blue-500" /><div><p className="text-2xl font-bold text-foreground">{stats.active}</p><p className="text-xs text-muted-foreground">Active</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.confirmed}</p><p className="text-xs text-muted-foreground">Confirmed</p></div></div></CardContent></Card>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search SOs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {[...new Set(orders.map(o => o.status))].sort().map(s => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No sales orders yet" />

        {/* Edit Draft SO Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={(v) => { if (!v) { setEditDialogOpen(false); setEditingSO(null); setEditItems([]); } }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Sales Order — {editingSO?.so_number}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Customer *</Label>
                  <Select value={editForm.customer_name} onValueChange={(v) => setEditForm({ ...editForm, customer_name: v })}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>
                      {customers.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Order Date</Label><Input type="date" value={editForm.order_date} onChange={(e) => setEditForm({ ...editForm, order_date: e.target.value })} /></div>
                <div><Label>Expected Delivery</Label><Input type="date" value={editForm.expected_delivery} onChange={(e) => setEditForm({ ...editForm, expected_delivery: e.target.value })} /></div>
              </div>
              <div><Label>Notes</Label><Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Line Items</Label>
                  <Button variant="outline" size="sm" onClick={() => setEditItems([...editItems, { description: "", quantity: 1, unit_price: 0, tax_rate: 0 }])}><Plus className="h-3 w-3 mr-1" />Add</Button>
                </div>
                {editItems.map((item, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_100px_80px_32px] gap-2 items-end">
                    <div><Label className="text-xs">Description</Label><Input value={item.description} onChange={(e) => { const u = [...editItems]; u[i] = { ...u[i], description: e.target.value }; setEditItems(u); }} /></div>
                    <div><Label className="text-xs">Qty</Label><Input type="number" value={item.quantity} onChange={(e) => { const u = [...editItems]; u[i] = { ...u[i], quantity: Number(e.target.value) }; setEditItems(u); }} /></div>
                    <div><Label className="text-xs">Unit Price</Label><Input type="number" value={item.unit_price} onChange={(e) => { const u = [...editItems]; u[i] = { ...u[i], unit_price: Number(e.target.value) }; setEditItems(u); }} /></div>
                    <div><Label className="text-xs">Tax %</Label><Input type="number" value={item.tax_rate} onChange={(e) => { const u = [...editItems]; u[i] = { ...u[i], tax_rate: Number(e.target.value) }; setEditItems(u); }} /></div>
                    <Button variant="ghost" size="icon" onClick={() => setEditItems(editItems.filter((_, idx) => idx !== i))} disabled={editItems.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
              <Button onClick={handleEditSave} disabled={updateSO.isPending} className="w-full">{updateSO.isPending ? "Saving..." : "Save Changes"}</Button>
            </div>
          </DialogContent>
        </Dialog>
        {/* View SO Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={(v) => { if (!v) { setViewDialogOpen(false); setViewingSO(null); } }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Sales Order — {viewingSO?.so_number}</DialogTitle></DialogHeader>
            {viewingSO && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-muted-foreground text-xs">Customer</Label><p className="font-medium text-foreground">{viewingSO.customer_name}</p></div>
                  <div><Label className="text-muted-foreground text-xs">Status</Label><div><Badge className={statusColors[viewingSO.status] || ""}>{viewingSO.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</Badge></div></div>
                  <div><Label className="text-muted-foreground text-xs">Order Date</Label><p className="text-foreground">{format(new Date(viewingSO.order_date), "dd MMM yyyy")}</p></div>
                  <div><Label className="text-muted-foreground text-xs">Expected Delivery</Label><p className="text-foreground">{viewingSO.expected_delivery ? format(new Date(viewingSO.expected_delivery), "dd MMM yyyy") : "—"}</p></div>
                  <div><Label className="text-muted-foreground text-xs">Total Amount</Label><p className="font-semibold text-foreground">₹{Number(viewingSO.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p></div>
                </div>
                {viewingSO.notes && (
                  <div><Label className="text-muted-foreground text-xs">Notes</Label><p className="text-sm text-foreground whitespace-pre-wrap">{viewingSO.notes}</p></div>
                )}
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Line Items</Label>
                  {viewSOItems.length > 0 ? (
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-2 font-medium text-muted-foreground">Description</th>
                            <th className="text-right p-2 font-medium text-muted-foreground">Qty</th>
                            <th className="text-right p-2 font-medium text-muted-foreground">Unit Price</th>
                            <th className="text-right p-2 font-medium text-muted-foreground">Tax %</th>
                            <th className="text-right p-2 font-medium text-muted-foreground">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewSOItems.map((item: any) => (
                            <tr key={item.id} className="border-t border-border">
                              <td className="p-2 text-foreground">{item.description}</td>
                              <td className="p-2 text-right text-foreground">{item.quantity}</td>
                              <td className="p-2 text-right text-foreground">₹{Number(item.unit_price).toLocaleString("en-IN")}</td>
                              <td className="p-2 text-right text-foreground">{item.tax_rate}%</td>
                              <td className="p-2 text-right font-medium text-foreground">₹{Number(item.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No line items found.</p>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}