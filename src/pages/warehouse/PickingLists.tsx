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
import { ClipboardList, PlayCircle, CheckCircle, XCircle, Plus, Trash2 } from "lucide-react";
import {
  usePickingLists, useGeneratePickingList, useUpdatePickingListStatus, PickingList,
} from "@/hooks/useWarehouse";
import { useWarehouses, useItems } from "@/hooks/useInventory";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  completed: "bg-green-500/20 text-green-400",
  cancelled: "bg-destructive/20 text-destructive",
};

const TRANSITIONS: Record<string, string[]> = {
  draft: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

interface PickItemRow { item_id?: string; item_name: string; quantity: number }

export default function PickingLists() {
  const { data: lists = [], isLoading } = usePickingLists();
  const { data: warehouses = [] } = useWarehouses();
  const { data: items = [] } = useItems();
  const generateList = useGeneratePickingList();
  const updateStatus = useUpdatePickingListStatus();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [pickItems, setPickItems] = useState<PickItemRow[]>([{ item_name: "", quantity: 1 }]);

  const stats = {
    total: lists.length,
    draft: lists.filter((l) => l.status === "draft").length,
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
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PlayCircle className="h-8 w-8 text-muted-foreground" /><div><p className="text-2xl font-bold text-foreground">{stats.draft}</p><p className="text-xs text-muted-foreground">Draft</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PlayCircle className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.in_progress}</p><p className="text-xs text-muted-foreground">In Progress</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.completed}</p><p className="text-xs text-muted-foreground">Completed</p></div></div></CardContent></Card>
        </div>

        <div className="rounded-md border bg-card">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : lists.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No picking lists yet. Generate one above.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
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
                {lists.map((list) => {
                  const nextStates = TRANSITIONS[list.status] ?? [];
                  const wh = warehouses.find((w: any) => w.id === list.warehouse_id);
                  return (
                    <tr key={list.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono font-semibold text-foreground">{list.pick_number}</td>
                      <td className="px-4 py-3">{format(new Date(list.created_at), "dd MMM yyyy")}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(wh as any)?.name || list.warehouse_id}</td>
                      <td className="px-4 py-3">
                        <Badge className={statusColors[list.status] || ""}>{list.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[160px]">{list.notes || "—"}</td>
                      <td className="px-4 py-3">
                        {nextStates.length > 0 && (
                          <Select onValueChange={(v) => updateStatus.mutate({ id: list.id, status: v })}>
                            <SelectTrigger className="w-[130px] h-8"><SelectValue placeholder="Advance…" /></SelectTrigger>
                            <SelectContent>
                              {nextStates.map((s) => (
                                <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Generate Pick List Dialog */}
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
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                      <Select value={row.item_id || ""} onValueChange={(v) => handleSelectItem(i, v)}>
                        <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                        <SelectContent>
                          {items.map((it: any) => <SelectItem key={it.id} value={it.id}>{it.name || it.item_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input placeholder="Or type name" value={row.item_name} onChange={(e) => updateItem(i, "item_name", e.target.value)} />
                      <Input type="number" value={row.quantity} onChange={(e) => updateItem(i, "quantity", parseFloat(e.target.value) || 1)} className="w-20" min={1} />
                      <Button size="icon" variant="ghost" onClick={() => removeItem(i)} disabled={pickItems.length === 1}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={generateList.isPending || !warehouseId}>
                {generateList.isPending ? "Generating…" : "Generate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
