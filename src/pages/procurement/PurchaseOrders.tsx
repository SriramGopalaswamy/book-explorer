import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, Column } from "@/components/ui/data-table";
import { Plus, ShoppingCart, Clock, CheckCircle, Package, Search, Trash2 } from "lucide-react";
import { usePurchaseOrders, useCreatePurchaseOrder, useUpdatePOStatus, PurchaseOrder } from "@/hooks/usePurchaseOrders";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-blue-500/20 text-blue-400",
  ordered: "bg-yellow-500/20 text-yellow-400",
  partially_received: "bg-orange-500/20 text-orange-400",
  received: "bg-green-500/20 text-green-400",
  invoiced: "bg-purple-500/20 text-purple-400",
  cancelled: "bg-destructive/20 text-destructive",
};

export default function PurchaseOrders() {
  const { data: orders = [], isLoading } = usePurchaseOrders();
  const createPO = useCreatePurchaseOrder();
  const updateStatus = useUpdatePOStatus();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ vendor_name: "", order_date: format(new Date(), "yyyy-MM-dd"), expected_delivery: "", notes: "" });
  const [items, setItems] = useState([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);

  const filtered = orders.filter((o) =>
    o.po_number.toLowerCase().includes(search.toLowerCase()) ||
    o.vendor_name.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: orders.length,
    draft: orders.filter((o) => o.status === "draft").length,
    pending: orders.filter((o) => ["approved", "ordered"].includes(o.status)).length,
    received: orders.filter((o) => o.status === "received").length,
  };

  const addItem = () => setItems([...items, { description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => {
    const updated = [...items];
    (updated[i] as any)[field] = value;
    setItems(updated);
  };

  const handleCreate = () => {
    if (!form.vendor_name || items.some((i) => !i.description)) return;
    createPO.mutate({ ...form, items }, {
      onSuccess: () => {
        setDialogOpen(false);
        setForm({ vendor_name: "", order_date: format(new Date(), "yyyy-MM-dd"), expected_delivery: "", notes: "" });
        setItems([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);
      },
    });
  };

  const columns: Column<PurchaseOrder>[] = [
    { key: "po_number", header: "PO #", render: (r) => <span className="font-mono font-semibold text-foreground">{r.po_number}</span> },
    { key: "vendor_name", header: "Vendor" },
    { key: "order_date", header: "Date", render: (r) => format(new Date(r.order_date), "dd MMM yyyy") },
    { key: "total_amount", header: "Total", render: (r) => <span className="font-semibold">₹{Number(r.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span> },
    {
      key: "status", header: "Status",
      render: (r) => (
        <Select value={r.status} onValueChange={(v) => updateStatus.mutate({ id: r.id, status: v })}>
          <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.keys(statusColors).map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
      ),
    },
  ];

  return (
    <MainLayout title="Purchase Orders" subtitle="Manage procurement lifecycle">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New PO</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Vendor Name *</Label><Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} /></div>
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
                <Button onClick={handleCreate} disabled={createPO.isPending} className="w-full">{createPO.isPending ? "Creating..." : "Create Purchase Order"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ShoppingCart className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total POs</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Clock className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.draft}</p><p className="text-xs text-muted-foreground">Drafts</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Package className="h-8 w-8 text-blue-500" /><div><p className="text-2xl font-bold text-foreground">{stats.pending}</p><p className="text-xs text-muted-foreground">In Progress</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.received}</p><p className="text-xs text-muted-foreground">Received</p></div></div></CardContent></Card>
        </div>

        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search POs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>

        <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No purchase orders yet" />
      </div>
    </MainLayout>
  );
}
