import { useState } from "react";
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
import { Plus, ShoppingBag, Clock, Truck, CheckCircle, Search, Trash2, FileText, ArrowRight, PackageCheck } from "lucide-react";
import { useSalesOrders, useCreateSalesOrder, useUpdateSOStatus, useDeleteSalesOrder, SalesOrder } from "@/hooks/useSalesOrders";
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
};

export default function SalesOrders() {
  const { data: orders = [], isLoading } = useSalesOrders();
  const createSO = useCreateSalesOrder();
  const updateStatus = useUpdateSOStatus();
  const deleteSO = useDeleteSalesOrder();
  const convertToInvoice = useConvertSOToInvoice();
  const createDN = useCreateDeliveryNote();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ customer_name: "", order_date: format(new Date(), "yyyy-MM-dd"), expected_delivery: "", notes: "" });
  const [items, setItems] = useState([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);

  const filtered = orders.filter((o) =>
    o.so_number.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: orders.length,
    draft: orders.filter((o) => o.status === "draft").length,
    active: orders.filter((o) => ["confirmed", "processing", "shipped"].includes(o.status)).length,
    delivered: orders.filter((o) => o.status === "delivered").length,
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {r.status === "draft" && <DropdownMenuItem onClick={() => updateStatus.mutate({ id: r.id, status: "confirmed" })}><CheckCircle className="h-4 w-4 mr-2" /> Confirm</DropdownMenuItem>}
            {["confirmed", "processing"].includes(r.status) && (
              <DropdownMenuItem onClick={() => createDN.mutate({ sales_order_id: r.id, delivery_date: new Date().toISOString().split("T")[0] })}>
                <PackageCheck className="h-4 w-4 mr-2" /> Create Delivery Note
              </DropdownMenuItem>
            )}
            {["delivered", "shipped"].includes(r.status) && (
              <DropdownMenuItem onClick={() => convertToInvoice.mutate(r)}>
                <FileText className="h-4 w-4 mr-2" /> Convert to Invoice
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
                  <div><Label>Customer Name *</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
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
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.delivered}</p><p className="text-xs text-muted-foreground">Delivered</p></div></div></CardContent></Card>
        </div>

        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search SOs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>

        <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No sales orders yet" />
      </div>
    </MainLayout>
  );
}
