import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, Column } from "@/components/ui/data-table";
import { Plus, ShoppingCart, Clock, CheckCircle, Package, Search, Trash2, Pencil } from "lucide-react";
import { usePurchaseOrders, useCreatePurchaseOrder, useUpdatePOStatus, PurchaseOrder } from "@/hooks/usePurchaseOrders";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-blue-500/20 text-blue-400",
  approved: "bg-blue-500/20 text-blue-400",
  ordered: "bg-yellow-500/20 text-yellow-400",
  partially_received: "bg-orange-500/20 text-orange-400",
  received: "bg-green-500/20 text-green-400",
  invoiced: "bg-purple-500/20 text-purple-400",
  cancelled: "bg-destructive/20 text-destructive",
  closed: "bg-muted text-muted-foreground",
};

const PO_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["approved", "cancelled"],
  approved: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "closed"],
  received: ["closed"],
};

export default function PurchaseOrders() {
  const { data: orders = [], isLoading } = usePurchaseOrders();
  const createPO = useCreatePurchaseOrder();
  const updateStatus = useUpdatePOStatus();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [form, setForm] = useState({ vendor_name: "", order_date: format(new Date(), "yyyy-MM-dd"), expected_delivery: "", notes: "" });
  const [items, setItems] = useState([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);
  const [editForm, setEditForm] = useState({ vendor_name: "", order_date: "", expected_delivery: "", notes: "" });
  const [editItems, setEditItems] = useState([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);

  // Fetch vendors for dropdown
  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-list"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = orders.filter((o) =>
    o.po_number.toLowerCase().includes(search.toLowerCase()) ||
    o.vendor_name.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: orders.length,
    draft: orders.filter((o) => o.status === "draft").length,
    pending: orders.filter((o) => ["approved", "ordered", "submitted"].includes(o.status)).length,
    received: orders.filter((o) => o.status === "received").length,
  };

  const addItem = () => setItems([...items, { description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => {
    const updated = [...items];
    (updated[i] as any)[field] = value;
    setItems(updated);
  };

  const addEditItem = () => setEditItems([...editItems, { description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);
  const removeEditItem = (i: number) => setEditItems(editItems.filter((_, idx) => idx !== i));
  const updateEditItem = (i: number, field: string, value: any) => {
    const updated = [...editItems];
    (updated[i] as any)[field] = value;
    setEditItems(updated);
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

  const openEditDialog = async (po: PurchaseOrder) => {
    setEditingPO(po);
    setEditForm({ vendor_name: po.vendor_name, order_date: po.order_date, expected_delivery: po.expected_delivery || "", notes: po.notes || "" });
    // Fetch PO items
    const { data: poItems } = await supabase.from("purchase_order_items" as any).select("*").eq("purchase_order_id", po.id);
    if (poItems && (poItems as any[]).length > 0) {
      setEditItems((poItems as any[]).map((i: any) => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price, tax_rate: i.tax_rate || 0 })));
    } else {
      setEditItems([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0 }]);
    }
    setEditDialogOpen(true);
  };

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingPO || !user) throw new Error("Not ready");
      const orgId = orgData?.organizationId;
      if (!orgId) throw new Error("No organization");

      const subtotal = editItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const taxAmount = editItems.reduce((s, i) => s + i.quantity * i.unit_price * (i.tax_rate / 100), 0);

      const { error } = await supabase.from("purchase_orders" as any).update({
        vendor_name: editForm.vendor_name,
        order_date: editForm.order_date,
        expected_delivery: editForm.expected_delivery || null,
        notes: editForm.notes || null,
        subtotal,
        tax_amount: taxAmount,
        total_amount: subtotal + taxAmount,
      } as any).eq("id", editingPO.id).eq("organization_id", orgId);
      if (error) throw error;

      // Delete and re-insert items
      await supabase.from("purchase_order_items" as any).delete().eq("purchase_order_id", editingPO.id);
      const validItems = editItems.filter(i => i.description.trim());
      if (validItems.length > 0) {
        const { error: itemErr } = await supabase.from("purchase_order_items" as any).insert(
          validItems.map(i => ({
            purchase_order_id: editingPO.id,
            description: i.description,
            quantity: i.quantity,
            unit_price: i.unit_price,
            tax_rate: i.tax_rate,
            amount: i.quantity * i.unit_price * (1 + i.tax_rate / 100),
          }))
        );
        if (itemErr) throw itemErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Purchase order updated");
      setEditDialogOpen(false);
      setEditingPO(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const columns: Column<PurchaseOrder>[] = [
    { key: "po_number", header: "PO #", render: (r) => <span className="font-mono font-semibold text-foreground">{r.po_number}</span> },
    { key: "vendor_name", header: "Vendor" },
    { key: "order_date", header: "Date", render: (r) => format(new Date(r.order_date), "dd MMM yyyy") },
    { key: "total_amount", header: "Total", render: (r) => <span className="font-semibold">₹{Number(r.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span> },
    {
      key: "status", header: "Status",
      render: (r) => {
        const nextStatuses = PO_TRANSITIONS[r.status] || [];
        return (
          <Select value={r.status} onValueChange={(v) => updateStatus.mutate({ id: r.id, status: v })}>
            <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={r.status}>{r.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
              {nextStatuses.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      key: "id", header: "",
      render: (r) => r.status === "draft" ? (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(r)}>
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
      ) : null,
    },
  ];

  const renderItemsForm = (
    itemsList: typeof items,
    addFn: () => void,
    removeFn: (i: number) => void,
    updateFn: (i: number, field: string, value: any) => void,
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><Label className="text-base font-semibold">Line Items</Label><Button variant="outline" size="sm" onClick={addFn}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
      {itemsList.map((item, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_100px_80px_32px] gap-2 items-end">
          <div><Label className="text-xs">Description</Label><Input value={item.description} onChange={(e) => updateFn(i, "description", e.target.value)} /></div>
          <div><Label className="text-xs">Qty</Label><Input type="number" value={item.quantity} onChange={(e) => updateFn(i, "quantity", Number(e.target.value))} /></div>
          <div><Label className="text-xs">Unit Price</Label><Input type="number" value={item.unit_price} onChange={(e) => updateFn(i, "unit_price", Number(e.target.value))} /></div>
          <div><Label className="text-xs">Tax %</Label><Input type="number" value={item.tax_rate} onChange={(e) => updateFn(i, "tax_rate", Number(e.target.value))} /></div>
          <Button variant="ghost" size="icon" onClick={() => removeFn(i)} disabled={itemsList.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      ))}
    </div>
  );

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
                  <div>
                    <Label>Vendor *</Label>
                    <Select value={form.vendor_name} onValueChange={(v) => setForm({ ...form, vendor_name: v })}>
                      <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                      <SelectContent>
                        {vendors.map((v: any) => (
                          <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Order Date</Label><Input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} /></div>
                  <div><Label>Expected Delivery</Label><Input type="date" value={form.expected_delivery} onChange={(e) => setForm({ ...form, expected_delivery: e.target.value })} /></div>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                {renderItemsForm(items, addItem, removeItem, updateItem)}
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

        {/* Edit PO Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Purchase Order — {editingPO?.po_number}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vendor *</Label>
                  <Select value={editForm.vendor_name} onValueChange={(v) => setEditForm({ ...editForm, vendor_name: v })}>
                    <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent>
                      {vendors.map((v: any) => (
                        <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Order Date</Label><Input type="date" value={editForm.order_date} onChange={(e) => setEditForm({ ...editForm, order_date: e.target.value })} /></div>
                <div><Label>Expected Delivery</Label><Input type="date" value={editForm.expected_delivery} onChange={(e) => setEditForm({ ...editForm, expected_delivery: e.target.value })} /></div>
              </div>
              <div><Label>Notes</Label><Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></div>
              {renderItemsForm(editItems, addEditItem, removeEditItem, updateEditItem)}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => editMutation.mutate()} disabled={editMutation.isPending}>
                {editMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
