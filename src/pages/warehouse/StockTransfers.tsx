import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTable, Column } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, ArrowRightLeft, Clock, Truck, CheckCircle, Search, Trash2, Pencil, MoreHorizontal, Eye } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStockTransfers, useCreateStockTransfer, useUpdateTransferStatus, StockTransfer } from "@/hooks/useWarehouse";
import { useWarehouses, useItems } from "@/hooks/useInventory";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_transit: "bg-yellow-500/20 text-yellow-400",
  received: "bg-green-500/20 text-green-400",
  cancelled: "bg-destructive/20 text-destructive",
};

export default function StockTransfers() {
  const { data: transfers = [], isLoading } = useStockTransfers();
  const { data: warehouses = [] } = useWarehouses();
  const { data: itemMaster = [] } = useItems();
  const createTransfer = useCreateStockTransfer();
  const updateStatus = useUpdateTransferStatus();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ from_warehouse_id: "", to_warehouse_id: "", transfer_date: format(new Date(), "yyyy-MM-dd"), notes: "" });
  const [items, setItems] = useState<{ item_id?: string; item_name: string; quantity: number }[]>([{ item_name: "", quantity: 1 }]);

  // View detail state
  const [viewTransfer, setViewTransfer] = useState<StockTransfer | null>(null);
  const [viewItems, setViewItems] = useState<any[]>([]);

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<StockTransfer | null>(null);
  const [editForm, setEditForm] = useState({ from_warehouse_id: "", to_warehouse_id: "", transfer_date: "", notes: "" });

  const filtered = transfers.filter((t) => t.transfer_number.toLowerCase().includes(search.toLowerCase()));

  const stats = {
    total: transfers.length,
    draft: transfers.filter((t) => t.status === "draft").length,
    in_transit: transfers.filter((t) => t.status === "in_transit").length,
    received: transfers.filter((t) => t.status === "received").length,
  };

  const addItem = () => setItems([...items, { item_name: "", quantity: 1 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => { const u = [...items]; (u[i] as any)[field] = value; setItems(u); };

  const handleCreate = () => {
    if (!form.from_warehouse_id || !form.to_warehouse_id || items.some((i) => !i.item_name)) return;
    createTransfer.mutate({ ...form, items }, {
      onSuccess: () => {
        setDialogOpen(false);
        setForm({ from_warehouse_id: "", to_warehouse_id: "", transfer_date: format(new Date(), "yyyy-MM-dd"), notes: "" });
        setItems([{ item_name: "", quantity: 1 }]);
      },
    });
  };

  const warehouseName = (id: string) => {
    const w = warehouses.find((wh: any) => wh.id === id);
    return (w as any)?.name || id;
  };

  const openView = async (t: StockTransfer) => {
    setViewTransfer(t);
    const { data } = await supabase.from("stock_transfer_items" as any).select("*").eq("transfer_id", t.id);
    setViewItems((data as any[]) || []);
  };

  const openEdit = (t: StockTransfer) => {
    setEditingTransfer(t);
    setEditForm({ from_warehouse_id: t.from_warehouse_id || "", to_warehouse_id: t.to_warehouse_id || "", transfer_date: t.transfer_date, notes: t.notes || "" });
    setEditDialogOpen(true);
  };

  const qc = useQueryClient();
  const handleSaveEdit = async () => {
    if (!editingTransfer) return;
    try {
      const { error } = await (supabase as any).from("stock_transfers").update({ notes: editForm.notes, transfer_date: editForm.transfer_date }).eq("id", editingTransfer.id);
      if (error) throw error;
      toast.success("Transfer updated");
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      setEditDialogOpen(false);
      setEditingTransfer(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const columns: Column<StockTransfer>[] = [
    { key: "transfer_number", header: "Transfer #", render: (r) => <span className="font-mono font-semibold text-foreground">{r.transfer_number}</span> },
    { key: "transfer_date", header: "Date", render: (r) => format(new Date(r.transfer_date), "dd MMM yyyy") },
    {
      key: "from_warehouse_id" as any, header: "From → To",
      render: (r) => <span className="text-foreground text-sm">{warehouseName(r.from_warehouse_id)} → {warehouseName(r.to_warehouse_id)}</span>,
    },
    {
      key: "status", header: "Status",
      render: (r) => <Badge className={statusColors[r.status] || ""}>{r.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>,
    },
    { key: "notes", header: "Notes", render: (r) => <span className="text-muted-foreground truncate max-w-[200px] block">{r.notes || "—"}</span> },
    {
      key: "actions" as any, header: "Actions",
      render: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openView(r)}><Eye className="h-4 w-4 mr-2" /> View Details</DropdownMenuItem>
            {r.status === "draft" && <DropdownMenuItem onClick={() => openEdit(r)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>}
            {r.status === "draft" && <DropdownMenuItem onClick={() => updateStatus.mutate({ id: r.id, status: "in_transit" })}><Truck className="h-4 w-4 mr-2" /> Mark In Transit</DropdownMenuItem>}
            {r.status === "in_transit" && <DropdownMenuItem onClick={() => updateStatus.mutate({ id: r.id, status: "received" })}><CheckCircle className="h-4 w-4 mr-2" /> Mark Received</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <MainLayout title="Stock Transfers" subtitle="Move inventory between warehouses">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div></div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Transfer</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Stock Transfer</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>From Warehouse *</Label>
                    <Select value={form.from_warehouse_id} onValueChange={(v) => setForm({ ...form, from_warehouse_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>To Warehouse *</Label>
                    <Select value={form.to_warehouse_id} onValueChange={(v) => setForm({ ...form, to_warehouse_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Transfer Date</Label><Input type="date" value={form.transfer_date} onChange={(e) => setForm({ ...form, transfer_date: e.target.value })} /></div>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><Label className="text-base font-semibold">Items</Label><Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
                  {items.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_80px_32px] gap-2 items-end">
                      <div>
                        <Label className="text-xs">Item</Label>
                        <Select value={item.item_id || ""} onValueChange={(v) => {
                          const found = itemMaster.find((it: any) => it.id === v);
                          const u = [...items];
                          u[i] = { ...u[i], item_id: v, item_name: (found as any)?.name || (found as any)?.item_name || u[i].item_name };
                          setItems(u);
                        }}>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>{itemMaster.map((it: any) => <SelectItem key={it.id} value={it.id}>{it.name || it.item_name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-xs">Or custom name</Label><Input value={item.item_name} onChange={(e) => updateItem(i, "item_name", e.target.value)} placeholder="Item name" /></div>
                      <div><Label className="text-xs">Qty</Label><Input type="number" value={item.quantity} onChange={(e) => updateItem(i, "quantity", Number(e.target.value))} /></div>
                      <Button variant="ghost" size="icon" onClick={() => removeItem(i)} disabled={items.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  ))}
                </div>
                <Button onClick={handleCreate} disabled={createTransfer.isPending} className="w-full">{createTransfer.isPending ? "Creating..." : "Create Transfer"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ArrowRightLeft className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Clock className="h-8 w-8 text-muted-foreground" /><div><p className="text-2xl font-bold text-foreground">{stats.draft}</p><p className="text-xs text-muted-foreground">Draft</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Truck className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.in_transit}</p><p className="text-xs text-muted-foreground">In Transit</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.received}</p><p className="text-xs text-muted-foreground">Received</p></div></div></CardContent></Card>
        </div>

        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search transfers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>
        <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No transfers yet" />

        {/* View Transfer Detail Dialog */}
        <Dialog open={!!viewTransfer} onOpenChange={(v) => { if (!v) setViewTransfer(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Stock Transfer — {viewTransfer?.transfer_number}</DialogTitle></DialogHeader>
            {viewTransfer && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted-foreground">From Warehouse</p><p className="font-medium text-foreground">{warehouseName(viewTransfer.from_warehouse_id)}</p></div>
                  <div><p className="text-xs text-muted-foreground">To Warehouse</p><p className="font-medium text-foreground">{warehouseName(viewTransfer.to_warehouse_id)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Transfer Date</p><p className="font-medium text-foreground">{format(new Date(viewTransfer.transfer_date), "dd MMM yyyy")}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status</p><Badge className={statusColors[viewTransfer.status] || ""}>{viewTransfer.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge></div>
                </div>
                {viewTransfer.notes && <div><p className="text-xs text-muted-foreground">Notes</p><p className="text-sm text-foreground">{viewTransfer.notes}</p></div>}
                {viewItems.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">Transfer Items</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Item</TableHead>
                          <TableHead className="text-xs text-right">Quantity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewItems.map((it: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm text-foreground">{it.item_name}</TableCell>
                            <TableCell className="text-sm text-right text-foreground">{it.quantity}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
            <DialogFooter><Button variant="outline" onClick={() => setViewTransfer(null)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Draft Transfer */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit Stock Transfer</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Transfer Date</Label><Input type="date" value={editForm.transfer_date} onChange={(e) => setEditForm({ ...editForm, transfer_date: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
