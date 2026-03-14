import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, Column } from "@/components/ui/data-table";
import { ClipboardCheck, Clock, PlayCircle, CheckCircle, Plus, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import {
  useInventoryCounts, useCountLines, useCreateInventoryCount, useUpdateCountLine, useApproveInventoryCount,
  InventoryCount,
} from "@/hooks/useWarehouse";
import { useWarehouses } from "@/hooks/useInventory";
import { useItems } from "@/hooks/useInventory";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  completed: "bg-blue-500/20 text-blue-400",
  approved: "bg-green-500/20 text-green-400",
};

interface CountItemRow { item_id?: string; item_name: string; expected_qty: number }

function CountLinesPanel({ countId, countStatus }: { countId: string; countStatus: string }) {
  const { data: lines = [], isLoading } = useCountLines(countId);
  const updateLine = useUpdateCountLine();
  const approve = useApproveInventoryCount();
  const [editing, setEditing] = useState<Record<string, string>>({});

  const handleSave = (lineId: string) => {
    const val = parseFloat(editing[lineId] ?? "");
    if (isNaN(val)) return;
    updateLine.mutate({ id: lineId, actual_qty: val });
    setEditing((prev) => { const next = { ...prev }; delete next[lineId]; return next; });
  };

  if (isLoading) return <div className="px-4 py-3 text-sm text-muted-foreground">Loading lines…</div>;
  if (lines.length === 0) return <div className="px-4 py-3 text-sm text-muted-foreground">No items in this count.</div>;

  return (
    <div className="border-t bg-muted/30">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Expected</TableHead>
            <TableHead className="text-right">Actual</TableHead>
            <TableHead className="text-right">Variance</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="font-medium">{line.item_name}</TableCell>
              <TableCell className="text-right">{line.expected_qty}</TableCell>
              <TableCell className="text-right">
                {countStatus !== "approved" ? (
                  <Input
                    type="number"
                    className="w-24 text-right inline-block"
                    value={editing[line.id] ?? (line.actual_qty !== null && line.actual_qty !== undefined ? String(line.actual_qty) : "")}
                    placeholder="—"
                    onChange={(e) => setEditing((prev) => ({ ...prev, [line.id]: e.target.value }))}
                    onBlur={() => { if (editing[line.id] !== undefined) handleSave(line.id); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(line.id); }}
                    min={0}
                  />
                ) : (
                  <span>{line.actual_qty ?? "—"}</span>
                )}
              </TableCell>
              <TableCell className={`text-right font-semibold ${Number(line.variance ?? 0) < 0 ? "text-red-400" : Number(line.variance ?? 0) > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                {line.variance !== null && line.variance !== undefined ? (Number(line.variance) > 0 ? `+${line.variance}` : String(line.variance)) : "—"}
              </TableCell>
              <TableCell />
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {countStatus !== "approved" && (
        <div className="px-4 py-3 flex justify-end">
          <Button size="sm" variant="default" onClick={() => approve.mutate(countId)} disabled={approve.isPending}>
            <CheckCircle className="h-4 w-4 mr-1" />
            {approve.isPending ? "Approving…" : "Approve & Post Variances"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function InventoryCounts() {
  const { data: counts = [], isLoading } = useInventoryCounts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: items = [] } = useItems();
  const createCount = useCreateInventoryCount();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [countDate, setCountDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [countItems, setCountItems] = useState<CountItemRow[]>([{ item_name: "", expected_qty: 0 }]);

  const stats = {
    total: counts.length,
    draft: counts.filter((c) => c.status === "draft").length,
    in_progress: counts.filter((c) => c.status === "in_progress").length,
    completed: counts.filter((c) => ["completed", "approved"].includes(c.status)).length,
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const addItemRow = () => setCountItems((prev) => [...prev, { item_name: "", expected_qty: 0 }]);
  const removeItemRow = (i: number) => setCountItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItemRow = (i: number, field: keyof CountItemRow, val: string | number) =>
    setCountItems((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

  const handleSelectItem = (i: number, itemId: string) => {
    const item = items.find((it: any) => it.id === itemId);
    if (item) {
      setCountItems((prev) => prev.map((row, idx) => idx === i ? { ...row, item_id: item.id, item_name: (item as any).name || (item as any).item_name || "" } : row));
    }
  };

  const handleCreate = () => {
    const validItems = countItems.filter((it) => it.item_name.trim());
    createCount.mutate(
      { warehouse_id: warehouseId, count_date: countDate, notes: notes || undefined, items: validItems },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setWarehouseId(""); setCountDate(new Date().toISOString().split("T")[0]);
          setNotes(""); setCountItems([{ item_name: "", expected_qty: 0 }]);
        },
      }
    );
  };

  const columns: Column<InventoryCount>[] = [
    {
      key: "count_number",
      header: "Count #",
      render: (r) => (
        <button className="flex items-center gap-1 font-mono font-semibold text-foreground hover:text-primary" onClick={() => toggleExpand(r.id)}>
          {expanded.has(r.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {r.count_number}
        </button>
      ),
    },
    { key: "count_date", header: "Date", render: (r) => format(new Date(r.count_date), "dd MMM yyyy") },
    { key: "warehouse_id", header: "Warehouse", render: (r) => { const wh = warehouses.find((w: any) => w.id === r.warehouse_id); return <span>{(wh as any)?.name || r.warehouse_id}</span>; } },
    {
      key: "status", header: "Status",
      render: (r) => <Badge className={statusColors[r.status] || ""}>{r.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>,
    },
    { key: "notes", header: "Notes", render: (r) => <span className="text-muted-foreground truncate max-w-[180px] block">{r.notes || "—"}</span> },
  ];

  return (
    <MainLayout title="Inventory Counts" subtitle="Physical inventory verification">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Count
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ClipboardCheck className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Clock className="h-8 w-8 text-muted-foreground" /><div><p className="text-2xl font-bold text-foreground">{stats.draft}</p><p className="text-xs text-muted-foreground">Draft</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PlayCircle className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.in_progress}</p><p className="text-xs text-muted-foreground">In Progress</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.completed}</p><p className="text-xs text-muted-foreground">Approved</p></div></div></CardContent></Card>
        </div>

        <div className="rounded-md border bg-card">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : counts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No inventory counts yet. Create your first count above.</div>
          ) : (
            counts.map((count) => (
              <div key={count.id} className="border-b last:border-b-0">
                <div className="grid grid-cols-5 gap-4 px-4 py-3 items-center hover:bg-muted/30">
                  <button className="flex items-center gap-1 font-mono font-semibold text-foreground hover:text-primary col-span-1 text-left" onClick={() => toggleExpand(count.id)}>
                    {expanded.has(count.id) ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    {count.count_number}
                  </button>
                  <span className="text-sm">{format(new Date(count.count_date), "dd MMM yyyy")}</span>
                  <span className="text-sm text-muted-foreground">{(warehouses.find((w: any) => w.id === count.warehouse_id) as any)?.name || count.warehouse_id}</span>
                  <Badge className={statusColors[count.status] || ""}>{count.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>
                  <span className="text-sm text-muted-foreground truncate">{count.notes || "—"}</span>
                </div>
                {expanded.has(count.id) && <CountLinesPanel countId={count.id} countStatus={count.status} />}
              </div>
            ))
          )}
        </div>

        {/* New Count Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New Inventory Count</DialogTitle></DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4">
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
                  <Label>Count Date *</Label>
                  <Input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Items to Count *</Label>
                  <Button size="sm" variant="outline" onClick={addItemRow}><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
                </div>
                <p className="text-xs text-muted-foreground mb-2">Select an item from your inventory, or type a custom item name. Enter the expected stock quantity for verification.</p>
                <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center mb-1 px-1">
                  <span className="text-xs font-medium text-muted-foreground">Select Item</span>
                  <span className="text-xs font-medium text-muted-foreground">Or Type Name</span>
                  <span className="text-xs font-medium text-muted-foreground w-28">Expected Qty</span>
                  <span className="w-9"></span>
                </div>
                <div className="space-y-2">
                  {countItems.map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                      <Select value={row.item_id || ""} onValueChange={(v) => handleSelectItem(i, v)}>
                        <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                        <SelectContent>
                          {items.map((it: any) => <SelectItem key={it.id} value={it.id}>{it.name || it.item_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Or type item name"
                        value={row.item_name}
                        onChange={(e) => updateItemRow(i, "item_name", e.target.value)}
                      />
                      <Input
                        type="number"
                        placeholder="Expected qty"
                        value={row.expected_qty}
                        onChange={(e) => updateItemRow(i, "expected_qty", parseFloat(e.target.value) || 0)}
                        className="w-28"
                        min={0}
                      />
                      <Button size="icon" variant="ghost" onClick={() => removeItemRow(i)} disabled={countItems.length === 1}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createCount.isPending || !warehouseId || !countDate}>
                {createCount.isPending ? "Creating…" : "Create Count"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
