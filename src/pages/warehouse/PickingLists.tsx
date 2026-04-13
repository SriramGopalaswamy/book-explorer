import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { ClipboardList, PlayCircle, CheckCircle, XCircle, Plus, Trash2, MoreHorizontal, Eye, Pencil, Loader2, Search } from "lucide-react";
import {
  usePickingLists, useGeneratePickingList, useUpdatePickingListStatus, PickingList, useBinLocations,
} from "@/hooks/useWarehouse";
import { useWarehouses, useItems } from "@/hooks/useInventory";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  completed: "bg-green-500/20 text-green-400",
  cancelled: "bg-destructive/20 text-destructive",
};

const TRANSITIONS: Record<string, string[]> = {
  pending: ["in_progress", "cancelled"],
  draft: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

interface PickItemRow { item_id?: string; item_name: string; quantity: number; bin_id?: string }

function PickListFormInner({ dialogOpen, setDialogOpen, warehouses, allItems, warehouseId, setWarehouseId, notes, setNotes, pickItems, addItem, removeItem, updateItem, handleSelectItem, handleCreate, isPending }: {
  dialogOpen: boolean; setDialogOpen: (v: boolean) => void;
  warehouses: any[]; allItems: any[];
  warehouseId: string; setWarehouseId: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  pickItems: PickItemRow[]; addItem: () => void; removeItem: (i: number) => void;
  updateItem: (i: number, field: keyof PickItemRow, val: string | number) => void;
  handleSelectItem: (i: number, v: string) => void;
  handleCreate: () => void; isPending: boolean;
}) {
  const { data: bins = [] } = useBinLocations(warehouseId || undefined);
  const activeBins = bins.filter((b: any) => b.is_active);

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Generate Pick List</DialogTitle></DialogHeader>
        <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
          <div>
            <Label>Warehouse *</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Items to Pick *</Label>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 mr-1" /> Add</Button>
            </div>
            <div className="space-y-2">
              {pickItems.map((row, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                    <Select value={row.item_id || ""} onValueChange={(v) => handleSelectItem(i, v)}>
                      <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                      <SelectContent>
                        {allItems.map((it: any) => <SelectItem key={it.id} value={it.id}>{it.name || it.item_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Or type name" value={row.item_name} onChange={(e) => updateItem(i, "item_name", e.target.value)} />
                    <Input type="number" value={row.quantity} onChange={(e) => updateItem(i, "quantity", parseFloat(e.target.value) || 1)} className="w-20" min={1} />
                    <Button size="icon" variant="ghost" onClick={() => removeItem(i)} disabled={pickItems.length === 1}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {warehouseId && activeBins.length > 0 && (
                    <div>
                      <Label className="text-xs">Bin Location</Label>
                      <Select value={row.bin_id || "none"} onValueChange={(v) => updateItem(i, "bin_id", v === "none" ? "" : v)}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Optional" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {activeBins.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.bin_code}{b.zone ? ` (${b.zone})` : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={isPending || !warehouseId}>
            {isPending ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PickingLists() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const { data: lists = [], isLoading } = usePickingLists();
  const { data: warehouses = [] } = useWarehouses();
  const { data: items = [] } = useItems();
  const generateList = useGeneratePickingList();
  const updateStatus = useUpdatePickingListStatus();

  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [warehouseId, setWarehouseId] = useState("");
  const filteredLists = lists.filter(l => {
    const matchesSearch = l.pick_number.toLowerCase().includes(search.toLowerCase()) || (l.notes || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const pagination = usePagination(filteredLists, 10);
  const [notes, setNotes] = useState("");
  const [pickItems, setPickItems] = useState<PickItemRow[]>([{ item_name: "", quantity: 1 }]);
  const [viewList, setViewList] = useState<PickingList | null>(null);
  const [viewItems, setViewItems] = useState<any[]>([]);
  const [editList, setEditList] = useState<PickingList | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editWarehouseId, setEditWarehouseId] = useState("");
  const [editPickItems, setEditPickItems] = useState<PickItemRow[]>([]);
  const [editItemsLoading, setEditItemsLoading] = useState(false);

  const [viewItemsLoading, setViewItemsLoading] = useState(false);

  const openView = async (list: PickingList) => {
    setViewList(list);
    setViewItems([]);
    setViewItemsLoading(true);
    try {
      const { data } = await supabase.from("picking_list_items" as any).select("*").eq("picking_list_id", list.id);
      setViewItems((data as any[]) || []);
    } catch (e) {
      console.error("Failed to load picking list items:", e);
    } finally {
      setViewItemsLoading(false);
    }
  };

  const openEdit = async (list: PickingList) => {
    setEditList(list);
    setEditNotes(list.notes || "");
    setEditWarehouseId(list.warehouse_id || "");
    setEditPickItems([]);
    setEditItemsLoading(true);
    try {
      const { data } = await supabase.from("picking_list_items" as any).select("*").eq("picking_list_id", list.id);
      const loaded = ((data as any[]) || []).map((it: any) => ({
        item_id: it.item_id || undefined,
        item_name: it.item_name || "",
        quantity: Number(it.required_quantity || it.quantity || 1),
        bin_id: it.bin_id || undefined,
      }));
      setEditPickItems(loaded.length > 0 ? loaded : [{ item_name: "", quantity: 1 }]);
    } catch {
      setEditPickItems([{ item_name: "", quantity: 1 }]);
    } finally {
      setEditItemsLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editList) return;
    if (!orgId) { toast.error("Organization not found"); return; }
    if (!editWarehouseId) { toast.error("Please select a warehouse"); return; }
    const validItems = editPickItems.filter((it) => it.item_name.trim());
    if (validItems.length === 0) { toast.error("Add at least one item"); return; }
    try {
      const { error } = await (supabase as any).from("picking_lists")
        .update({ notes: editNotes, warehouse_id: editWarehouseId })
        .eq("id", editList.id).eq("organization_id", orgId);
      if (error) throw error;
      // Replace items
      await supabase.from("picking_list_items" as any).delete().eq("picking_list_id", editList.id);
      await supabase.from("picking_list_items" as any).insert(
        validItems.map((it) => ({
          picking_list_id: editList.id,
          item_id: it.item_id || null,
          item_name: it.item_name,
          required_quantity: it.quantity,
          bin_id: it.bin_id || null,
          status: "pending",
        }))
      );
      toast.success("Picking list updated");
      await qc.invalidateQueries({ queryKey: ["picking-lists"] });
      setEditList(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const addEditItem = () => setEditPickItems((p) => [...p, { item_name: "", quantity: 1 }]);
  const removeEditItem = (i: number) => setEditPickItems((p) => p.filter((_, idx) => idx !== i));
  const updateEditItem = (i: number, field: keyof PickItemRow, val: string | number) =>
    setEditPickItems((p) => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const handleSelectEditItem = (i: number, itemId: string) => {
    const item = items.find((it: any) => it.id === itemId);
    if (item) {
      updateEditItem(i, "item_id", itemId);
      updateEditItem(i, "item_name", (item as any).name || (item as any).item_name || "");
    }
  };

  const handleDelete = async (id: string) => {
    if (!orgId) { toast.error("Organization not found"); return; }
    try {
      await supabase.from("picking_list_items" as any).delete().eq("picking_list_id", id);
      const { error } = await (supabase as any).from("picking_lists").delete().eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
      toast.success("Picking list deleted");
      await qc.invalidateQueries({ queryKey: ["picking-lists"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const stats = {
    total: lists.length,
    draft: lists.filter((l) => l.status === "draft" || l.status === "pending").length,
    in_progress: lists.filter((l) => l.status === "in_progress").length,
    completed: lists.filter((l) => l.status === "completed").length,
  };

  const addItem = () => setPickItems((p) => [...p, { item_name: "", quantity: 1 }]);
  const removeItem = (i: number) => setPickItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof PickItemRow, val: string | number) =>
    setPickItems((p) => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  const handleSelectItem = (i: number, itemId: string) => {
    const item = items.find((it: any) => it.id === itemId);
    if (item) updateItem(i, "item_id", itemId);
    if (item) updateItem(i, "item_name", (item as any).name || (item as any).item_name || "");
  };

  const handleCreate = () => {
    const validItems = pickItems.filter((it) => it.item_name.trim());
    generateList.mutate(
      { warehouse_id: warehouseId, notes: notes || undefined, items: validItems },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setWarehouseId(""); setNotes("");
          setPickItems([{ item_name: "", quantity: 1 }]);
        },
      }
    );
  };

  return (
    <MainLayout title="Picking Lists" subtitle="Manage warehouse picking operations">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Generate Pick List
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ClipboardList className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PlayCircle className="h-8 w-8 text-muted-foreground" /><div><p className="text-2xl font-bold text-foreground">{stats.draft}</p><p className="text-xs text-muted-foreground">Pending</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PlayCircle className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.in_progress}</p><p className="text-xs text-muted-foreground">In Progress</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.completed}</p><p className="text-xs text-muted-foreground">Completed</p></div></div></CardContent></Card>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search picking lists..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border bg-card">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : filteredLists.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">{search || statusFilter !== "all" ? "No matching picking lists." : "No picking lists yet. Generate one above."}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Pick #</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Created</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Warehouse</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Notes</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedItems.map((list) => {
                  const nextStates = TRANSITIONS[list.status] ?? [];
                  const wh = warehouses.find((w: any) => w.id === list.warehouse_id);
                  return (
                    <tr key={list.id} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer" onClick={() => openView(list)}>
                      <td className="px-4 py-3 font-mono font-semibold text-foreground">{list.pick_number}</td>
                      <td className="px-4 py-3">{format(new Date(list.created_at), "dd MMM yyyy")}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(wh as any)?.name || list.warehouse_id}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Badge className={statusColors[list.status] || ""}>{list.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[250px] break-words whitespace-normal">{list.notes || "—"}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openView(list); }}>
                              <Eye className="h-4 w-4 mr-2" /> View Details
                            </DropdownMenuItem>
                            {(list.status === "pending" || list.status === "draft") && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(list); }}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                            )}
                            {nextStates.includes("in_progress") && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: list.id, status: "in_progress" }); }}>
                                <PlayCircle className="h-4 w-4 mr-2" /> In Progress
                              </DropdownMenuItem>
                            )}
                            {nextStates.includes("completed") && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: list.id, status: "completed" }); }}>
                                <CheckCircle className="h-4 w-4 mr-2" /> Completed
                              </DropdownMenuItem>
                            )}
                            {nextStates.includes("cancelled") && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: list.id, status: "cancelled" }); }}>
                                <XCircle className="h-4 w-4 mr-2" /> Cancelled
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(list.id); }} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <TablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />

        {/* View Picking List Detail Dialog */}
        <Dialog open={!!viewList} onOpenChange={(v) => { if (!v) setViewList(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Picking List — {viewList?.pick_number}</DialogTitle></DialogHeader>
            {viewList && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Warehouse</p>
                    <p className="font-medium text-foreground">{(warehouses.find((w: any) => w.id === viewList.warehouse_id) as any)?.name || viewList.warehouse_id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Status</p>
                    <Badge className={statusColors[viewList.status] || ""}>{viewList.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Created</p>
                    <p className="text-foreground">{format(new Date(viewList.created_at), "dd MMM yyyy, hh:mm a")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Pick Number</p>
                    <p className="font-mono font-semibold text-foreground">{viewList.pick_number}</p>
                  </div>
                </div>

                {viewList.notes && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Notes</p>
                    <p className="text-sm text-foreground bg-muted/40 rounded-md p-2">{viewList.notes}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm font-semibold mb-2">Items</p>
                  {viewItemsLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading items…
                    </div>
                  ) : viewItems.length > 0 ? (
                    <Table>
                      <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Required</TableHead><TableHead className="text-right">Picked</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {viewItems.map((it: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-foreground">{it.item_name}</TableCell>
                            <TableCell className="text-right">{it.required_quantity}</TableCell>
                            <TableCell className="text-right">{it.picked_quantity || 0}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{it.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No items recorded for this picking list.</p>
                  )}
                </div>
              </div>
            )}
            <DialogFooter><Button variant="outline" onClick={() => setViewList(null)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Picking List Dialog */}
        <Dialog open={!!editList} onOpenChange={(v) => { if (!v) setEditList(null); }}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Edit Picking List — {editList?.pick_number}</DialogTitle></DialogHeader>
            <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
              <div>
                <Label>Warehouse *</Label>
                <Select value={editWarehouseId} onValueChange={setEditWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Items to Pick *</Label>
                  <Button size="sm" variant="outline" onClick={addEditItem}><Plus className="h-3 w-3 mr-1" /> Add</Button>
                </div>
                {editItemsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading items…
                  </div>
                ) : (
                  <div className="space-y-2">
                    {editPickItems.map((row, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center rounded-lg border p-3">
                        <Select value={row.item_id || ""} onValueChange={(v) => handleSelectEditItem(i, v)}>
                          <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                          <SelectContent>
                            {(items as any[]).map((it: any) => <SelectItem key={it.id} value={it.id}>{it.name || it.item_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input placeholder="Or type name" value={row.item_name} onChange={(e) => updateEditItem(i, "item_name", e.target.value)} />
                        <Input type="number" value={row.quantity} onChange={(e) => updateEditItem(i, "quantity", parseFloat(e.target.value) || 1)} className="w-20" min={1} />
                        <Button size="icon" variant="ghost" onClick={() => removeEditItem(i)} disabled={editPickItems.length === 1}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditList(null)}>Cancel</Button>
              <Button onClick={handleSaveEdit}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Generate Pick List Dialog */}
        <PickListFormInner
          dialogOpen={dialogOpen} setDialogOpen={setDialogOpen}
          warehouses={warehouses} allItems={items}
          warehouseId={warehouseId} setWarehouseId={setWarehouseId}
          notes={notes} setNotes={setNotes}
          pickItems={pickItems} addItem={addItem} removeItem={removeItem}
          updateItem={updateItem} handleSelectItem={handleSelectItem}
          handleCreate={handleCreate} isPending={generateList.isPending}
        />
      </div>
    </MainLayout>
  );
}
