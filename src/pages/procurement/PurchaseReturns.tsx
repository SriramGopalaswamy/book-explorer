import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Trash2, MoreHorizontal, Eye, Search, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePurchaseReturns, useCreatePurchaseReturn, useUpdatePurchaseReturnStatus, useCreateVendorCreditFromReturn } from "@/hooks/useReturns";
import { format, isAfter, isBefore } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";

const statusBadgeClass: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-blue-500/20 text-blue-400",
  approved: "bg-green-500/20 text-green-400",
  confirmed: "bg-green-500/20 text-green-400",
  processed: "bg-purple-500/20 text-purple-400",
  cancelled: "bg-destructive/20 text-destructive",
};

export default function PurchaseReturnsPage() {
  const { data: returns = [], isLoading } = usePurchaseReturns();
  const createReturn = useCreatePurchaseReturn();
  const updateStatus = useUpdatePurchaseReturnStatus();
  const createVendorCredit = useCreateVendorCreditFromReturn();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vendor_name: "", return_date: new Date().toISOString().split("T")[0], reason: "", notes: "" });
  const [items, setItems] = useState([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0, reason: "" }]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewingReturn, setViewingReturn] = useState<any>(null);
  const [viewItems, setViewItems] = useState<any[]>([]);
  const [editingReturn, setEditingReturn] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ vendor_name: "", return_date: "", reason: "", notes: "" });
  const [editItems, setEditItems] = useState<{ description: string; quantity: number; unit_price: number; tax_rate: number; reason: string }[]>([]);

  // Fetch vendors for dropdown
  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-list", orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, name, is_active").eq("organization_id", orgId).order("name");
      if (error) throw error;
      return (data || []).filter((v: any) => v.is_active !== false);
    },
  });

  const filtered = returns.filter(r => {
    const matchSearch = !search || r.return_number.toLowerCase().includes(search.toLowerCase()) || r.vendor_name.toLowerCase().includes(search.toLowerCase()) || (r.reason && r.reason.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchDateFrom = !dateFrom || !isBefore(new Date(r.return_date), new Date(dateFrom));
    const matchDateTo = !dateTo || !isAfter(new Date(r.return_date), new Date(dateTo));
    return matchSearch && matchStatus && matchDateFrom && matchDateTo;
  });
  const pagination = usePagination(filtered, 10);

  const addItem = () => setItems(p => [...p, { description: "", quantity: 1, unit_price: 0, tax_rate: 0, reason: "" }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => setItems(p => p.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const handleCreate = () => {
    if (!form.vendor_name || items.length === 0) return;
    createReturn.mutate({ ...form, items }, {
      onSuccess: () => { setOpen(false); setForm({ vendor_name: "", return_date: new Date().toISOString().split("T")[0], reason: "", notes: "" }); setItems([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0, reason: "" }]); },
    });
  };

  const openView = async (r: any) => {
    setViewingReturn(r);
    const { data } = await supabase.from("purchase_return_items" as any).select("*").eq("purchase_return_id", r.id);
    setViewItems((data as any[]) || []);
  };

  const openEdit = async (r: any) => {
    setEditingReturn(r);
    setEditForm({ vendor_name: r.vendor_name, return_date: r.return_date, reason: r.reason || "", notes: r.notes || "" });
    const { data } = await supabase.from("purchase_return_items" as any).select("*").eq("purchase_return_id", r.id);
    const existing = (data as any[]) || [];
    setEditItems(existing.length > 0
      ? existing.map((i: any) => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price, tax_rate: i.tax_rate || 0, reason: i.reason || "" }))
      : [{ description: "", quantity: 1, unit_price: 0, tax_rate: 0, reason: "" }]
    );
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingReturn || !orgId) return;
    const subtotal = editItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const taxAmount = editItems.reduce((s, i) => s + i.quantity * i.unit_price * (i.tax_rate / 100), 0);
    const { error } = await supabase.from("purchase_returns" as any).update({
      vendor_name: editForm.vendor_name,
      return_date: editForm.return_date,
      reason: editForm.reason || null,
      notes: editForm.notes || null,
      subtotal,
      tax_amount: taxAmount,
      total_amount: subtotal + taxAmount,
    } as any).eq("id", editingReturn.id).eq("organization_id", orgId);
    if (error) { toast.error(error.message); return; }
    await supabase.from("purchase_return_items" as any).delete().eq("purchase_return_id", editingReturn.id);
    const valid = editItems.filter(i => i.description.trim());
    if (valid.length > 0) {
      await supabase.from("purchase_return_items" as any).insert(
        valid.map(i => ({
          purchase_return_id: editingReturn.id,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          tax_rate: i.tax_rate,
          amount: i.quantity * i.unit_price * (1 + i.tax_rate / 100),
          reason: i.reason || null,
        }))
      );
    }
    await queryClient.invalidateQueries({ queryKey: ["purchase-returns"] });
    toast.success("Purchase return updated");
    setEditOpen(false);
    setEditingReturn(null);
  };

  if (isLoading) return <MainLayout title="Purchase Returns"><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></MainLayout>;

  return (
    <MainLayout title="Purchase Returns">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-44" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" placeholder="From" />
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" placeholder="To" />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => { setDateFrom(""); setDateTo(""); }} title="Clear date filter">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Return</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Purchase Return</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Vendor Name</Label>
                    <Select value={form.vendor_name} onValueChange={(v) => setForm(p => ({ ...p, vendor_name: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                      <SelectContent>
                        {vendors.map((v: any) => <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Return Date</Label><Input type="date" value={form.return_date} onChange={e => setForm(p => ({ ...p, return_date: e.target.value }))} /></div>
                </div>
                <div><Label>Reason</Label><Input value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} /></div>
                <div>
                  <div className="flex items-center justify-between mb-2"><Label>Return Items</Label><Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
                  {items.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_80px_100px_80px_40px] gap-2 mb-2 items-end">
                      <div><Label className="text-xs">Description</Label><Input placeholder="Item description" value={item.description} onChange={e => updateItem(i, "description", e.target.value)} /></div>
                      <div><Label className="text-xs">Qty</Label><Input type="number" value={item.quantity} onChange={e => updateItem(i, "quantity", Number(e.target.value))} /></div>
                      <div><Label className="text-xs">Unit Price</Label><Input type="number" value={item.unit_price} onChange={e => updateItem(i, "unit_price", Number(e.target.value))} /></div>
                      <div><Label className="text-xs">Tax %</Label><Input type="number" value={item.tax_rate} onChange={e => updateItem(i, "tax_rate", Number(e.target.value))} /></div>
                      <div><Label className="text-xs">&nbsp;</Label><Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)} disabled={items.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                    </div>
                  ))}
                </div>
                <Button onClick={handleCreate} disabled={createReturn.isPending} className="w-full">{createReturn.isPending ? "Creating..." : "Create Return"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader><CardTitle>All Purchase Returns</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-foreground">{r.return_number}</TableCell>
                    <TableCell className="text-foreground">{r.vendor_name}</TableCell>
                    <TableCell className="text-foreground">{format(new Date(r.return_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-right font-medium text-foreground">₹{Number(r.total_amount).toLocaleString()}</TableCell>
                    <TableCell><Badge className={statusBadgeClass[r.status] || "bg-muted text-muted-foreground"}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Badge></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openView(r)}><Eye className="h-4 w-4 mr-2" /> View Details</DropdownMenuItem>
                          {r.status === "draft" && <DropdownMenuItem onClick={() => openEdit(r)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>}
                          {r.status === "draft" && <DropdownMenuItem onClick={() => updateStatus.mutate({ id: r.id, status: "submitted" })}>Submit</DropdownMenuItem>}
                          {r.status === "submitted" && <DropdownMenuItem onClick={() => updateStatus.mutate({ id: r.id, status: "approved" })}>Approve</DropdownMenuItem>}
                          {(r.status === "draft" || r.status === "submitted") && <DropdownMenuItem onClick={() => updateStatus.mutate({ id: r.id, status: "cancelled" })} className="text-destructive">Cancel</DropdownMenuItem>}
                          {r.status === "approved" && !r.vendor_credit_id && (
                            <DropdownMenuItem onClick={() => createVendorCredit.mutate(r.id)} disabled={createVendorCredit.isPending}>Vendor Credit</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No purchase returns</TableCell></TableRow>}
              </TableBody>
            </Table>
            <TablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
          </CardContent>
        </Card>

        {/* View Return Dialog */}
        <Dialog open={!!viewingReturn} onOpenChange={(o) => { if (!o) setViewingReturn(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Purchase Return — {viewingReturn?.return_number}</DialogTitle></DialogHeader>
            {viewingReturn && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted-foreground">Vendor</p><p className="font-medium">{viewingReturn.vendor_name}</p></div>
                  <div><p className="text-xs text-muted-foreground">Date</p><p className="font-medium">{format(new Date(viewingReturn.return_date), "dd MMM yyyy")}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status</p><Badge className={statusBadgeClass[viewingReturn.status] || "bg-muted text-muted-foreground"}>{viewingReturn.status.charAt(0).toUpperCase() + viewingReturn.status.slice(1)}</Badge></div>
                  <div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold">₹{Number(viewingReturn.total_amount).toLocaleString()}</p></div>
                </div>
                {viewingReturn.reason && <div><p className="text-xs text-muted-foreground">Reason</p><p className="text-sm">{viewingReturn.reason}</p></div>}
                {viewingReturn.notes && <div><p className="text-xs text-muted-foreground">Notes</p><p className="text-sm">{viewingReturn.notes}</p></div>}
                {viewItems.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Items</p>
                    <Table>
                      <TableHeader><TableRow><TableHead className="text-xs">Description</TableHead><TableHead className="text-xs text-right">Qty</TableHead><TableHead className="text-xs text-right">Price</TableHead><TableHead className="text-xs text-right">Amount</TableHead></TableRow></TableHeader>
                      <TableBody>{viewItems.map((it: any, i: number) => (
                        <TableRow key={i}><TableCell className="text-sm">{it.description}</TableCell><TableCell className="text-sm text-right">{it.quantity}</TableCell><TableCell className="text-sm text-right">₹{Number(it.unit_price).toLocaleString()}</TableCell><TableCell className="text-sm text-right font-medium">₹{Number(it.amount).toLocaleString()}</TableCell></TableRow>
                      ))}</TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
            <DialogFooter><Button variant="outline" onClick={() => setViewingReturn(null)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Draft Return Dialog */}
        <Dialog open={editOpen} onOpenChange={(o) => { if (!o) { setEditOpen(false); setEditingReturn(null); } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Purchase Return — {editingReturn?.return_number}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vendor Name</Label>
                  <Select value={editForm.vendor_name} onValueChange={(v) => setEditForm(p => ({ ...p, vendor_name: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent>
                      {vendors.map((v: any) => <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Return Date</Label><Input type="date" value={editForm.return_date} onChange={e => setEditForm(p => ({ ...p, return_date: e.target.value }))} /></div>
              </div>
              <div><Label>Reason</Label><Input value={editForm.reason} onChange={e => setEditForm(p => ({ ...p, reason: e.target.value }))} /></div>
              <div>
                <div className="flex items-center justify-between mb-2"><Label>Return Items</Label><Button type="button" variant="outline" size="sm" onClick={() => setEditItems(p => [...p, { description: "", quantity: 1, unit_price: 0, tax_rate: 0, reason: "" }])}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
                {editItems.map((item, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_100px_80px_40px] gap-2 mb-2 items-end">
                    <div><Label className="text-xs">Description</Label><Input value={item.description} onChange={e => setEditItems(p => p.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it))} /></div>
                    <div><Label className="text-xs">Qty</Label><Input type="number" value={item.quantity} onChange={e => setEditItems(p => p.map((it, idx) => idx === i ? { ...it, quantity: Number(e.target.value) } : it))} /></div>
                    <div><Label className="text-xs">Unit Price</Label><Input type="number" value={item.unit_price} onChange={e => setEditItems(p => p.map((it, idx) => idx === i ? { ...it, unit_price: Number(e.target.value) } : it))} /></div>
                    <div><Label className="text-xs">Tax %</Label><Input type="number" value={item.tax_rate} onChange={e => setEditItems(p => p.map((it, idx) => idx === i ? { ...it, tax_rate: Number(e.target.value) } : it))} /></div>
                    <div><Label className="text-xs">&nbsp;</Label><Button type="button" variant="ghost" size="icon" onClick={() => setEditItems(p => p.filter((_, idx) => idx !== i))} disabled={editItems.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setEditOpen(false); setEditingReturn(null); }}>Cancel</Button>
                <Button className="flex-1" onClick={handleEditSave}>Save Changes</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
