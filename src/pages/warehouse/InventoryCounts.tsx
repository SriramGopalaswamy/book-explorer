import React, { useState } from "react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, Column } from "@/components/ui/data-table";
import { ClipboardCheck, Clock, PlayCircle, CheckCircle, Plus, ChevronDown, ChevronRight, Trash2, MoreHorizontal, Eye, Pencil, Loader2, Search, Send, ShieldCheck } from "lucide-react";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import {
  useInventoryCounts, useCountLines, useCreateInventoryCount, useUpdateCountLine, useApproveInventoryCount, usePostInventoryCount,
  InventoryCount, useBinLocations,
} from "@/hooks/useWarehouse";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useWarehouses } from "@/hooks/useInventory";
import { useItems } from "@/hooks/useInventory";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  completed: "bg-blue-500/20 text-blue-400",
  approved: "bg-blue-500/20 text-blue-400",
  posted: "bg-green-500/20 text-green-400",
};

interface CountItemRow { item_id?: string; item_name: string; expected_qty: number; bin_id?: string }

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
                {countStatus !== "posted" ? (
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
                ) : countStatus === "posted" ? (
                  <span>{line.actual_qty ?? "—"}</span>
                ) : null}
              </TableCell>
              <TableCell className={`text-right font-semibold ${Number(line.variance ?? 0) < 0 ? "text-red-400" : Number(line.variance ?? 0) > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                {line.variance !== null && line.variance !== undefined ? (Number(line.variance) > 0 ? `+${line.variance}` : String(line.variance)) : "—"}
              </TableCell>
              <TableCell />
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {countStatus === "draft" && (
        <div className="px-4 py-3 flex justify-end">
          <Button size="sm" variant="default" onClick={() => approve.mutate(countId)} disabled={approve.isPending}>
            <ShieldCheck className="h-4 w-4 mr-1" />
            {approve.isPending ? "Approving…" : "Approve"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Approve Dialog ─────────────────────────
function ApproveDialog({ countId, open, onOpenChange }: { countId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: lines = [], isLoading } = useCountLines(open ? countId : undefined);
  const updateLine = useUpdateCountLine();
  const approve = useApproveInventoryCount();
  const [actualQtys, setActualQtys] = useState<Record<string, string>>({});

  React.useEffect(() => {
    if (lines.length > 0) {
      const initial: Record<string, string> = {};
      lines.forEach((line) => {
        if (line.actual_qty !== null && line.actual_qty !== undefined) {
          initial[line.id] = String(line.actual_qty);
        }
      });
      setActualQtys(initial);
    }
  }, [lines]);

  const handleConfirm = async () => {
    const updates = lines.map((line) => {
      const val = parseFloat(actualQtys[line.id] ?? "");
      if (isNaN(val)) return null;
      return updateLine.mutateAsync({ id: line.id, actual_qty: val });
    }).filter(Boolean);

    try {
      await Promise.all(updates);
      await new Promise((r) => setTimeout(r, 300));
      await approve.mutateAsync(countId);
      onOpenChange(false);
    } catch (e: any) {
      // Error already shown by mutation
    }
  };

  const allFilled = lines.every((line) => {
    const val = actualQtys[line.id];
    return val !== undefined && val !== "" && !isNaN(parseFloat(val));
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Approve — Enter Actual Quantities</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="py-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading items…</div>
        ) : lines.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">No items in this count.</div>
        ) : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {lines.map((line) => {
              const val = actualQtys[line.id] ?? "";
              const variance = val !== "" && !isNaN(parseFloat(val)) ? parseFloat(val) - line.expected_qty : null;
              return (
                <div key={line.id} className="rounded-lg border p-3 space-y-1">
                  <p className="text-sm font-medium text-foreground">{line.item_name}</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Expected</Label>
                      <p className="text-sm font-semibold">{line.expected_qty}</p>
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Actual Qty *</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Enter qty"
                        value={val}
                        onChange={(e) => setActualQtys((prev) => ({ ...prev, [line.id]: e.target.value }))}
                        className="h-8"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Variance</Label>
                      <p className={`text-sm font-semibold ${variance !== null ? (variance < 0 ? "text-red-400" : variance > 0 ? "text-green-400" : "text-muted-foreground") : "text-muted-foreground"}`}>
                        {variance !== null ? (variance > 0 ? `+${variance}` : String(variance)) : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!allFilled || approve.isPending || updateLine.isPending}>
            <ShieldCheck className="h-4 w-4 mr-1" />
            {approve.isPending ? "Approving…" : "Confirm & Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CountFormDialog({ dialogOpen, setDialogOpen, warehouses, items, warehouseId, setWarehouseId, countDate, setCountDate, notes, setNotes, countItems, addItemRow, removeItemRow, updateItemRow, handleSelectItem, handleCreate, isPending }: {
  dialogOpen: boolean; setDialogOpen: (v: boolean) => void;
  warehouses: any[]; items: any[];
  warehouseId: string; setWarehouseId: (v: string) => void;
  countDate: string; setCountDate: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  countItems: CountItemRow[]; addItemRow: () => void; removeItemRow: (i: number) => void;
  updateItemRow: (i: number, field: keyof CountItemRow, val: string | number) => void;
  handleSelectItem: (i: number, v: string) => void;
  handleCreate: () => void; isPending: boolean;
}) {
  const { data: bins = [] } = useBinLocations(warehouseId || undefined);
  const activeBins = bins.filter((b: any) => b.is_active);

  return (
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
            <p className="text-xs text-muted-foreground mb-2">Pick an existing inventory item or enter a custom name. Set the expected quantity you believe should be in stock.</p>
            <div className="space-y-2">
              {countItems.map((row, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                    <Select value={row.item_id || ""} onValueChange={(v) => handleSelectItem(i, v)}>
                      <SelectTrigger><SelectValue placeholder="Pick from inventory" /></SelectTrigger>
                      <SelectContent>
                        {items.map((it: any) => <SelectItem key={it.id} value={it.id}>{it.name || it.item_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input placeholder="e.g. Laptop, Chair" value={row.item_name} onChange={(e) => updateItemRow(i, "item_name", e.target.value)} />
                    <Input type="number" placeholder="Expected qty" value={row.expected_qty} onChange={(e) => updateItemRow(i, "expected_qty", parseFloat(e.target.value) || 0)} className="w-28" min={0} />
                    <Button size="icon" variant="ghost" onClick={() => removeItemRow(i)} disabled={countItems.length === 1}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {warehouseId && activeBins.length > 0 && (
                    <div>
                      <Label className="text-xs">Bin Location</Label>
                      <Select value={row.bin_id || "none"} onValueChange={(v) => updateItemRow(i, "bin_id", v === "none" ? "" : v)}>
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
          <Button onClick={handleCreate} disabled={isPending || !warehouseId || !countDate}>
            {isPending ? "Creating…" : "Create Count"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewCountDialog({ count, open, onClose, warehouses }: { count: InventoryCount; open: boolean; onClose: () => void; warehouses: any[] }) {
  const { data: lines = [], isLoading } = useCountLines(open ? count.id : undefined);
  const warehouseName = warehouses.find((w: any) => w.id === count.warehouse_id)?.name || count.warehouse_id;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Inventory Count — {count.count_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Warehouse:</span> <span className="font-medium text-foreground">{warehouseName}</span></div>
            <div><span className="text-muted-foreground">Date:</span> <span className="text-foreground">{format(new Date(count.count_date), "dd MMM yyyy")}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <Badge className={statusColors[count.status] || ""}>{count.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge></div>
            {count.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> <span className="text-foreground">{count.notes}</span></div>}
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-2">Count Lines</h4>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items in this count.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">{line.item_name}</TableCell>
                      <TableCell className="text-right">{line.expected_qty}</TableCell>
                      <TableCell className="text-right">{line.actual_qty ?? "—"}</TableCell>
                      <TableCell className={`text-right font-semibold ${Number(line.variance ?? 0) < 0 ? "text-red-400" : Number(line.variance ?? 0) > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                        {line.variance !== null && line.variance !== undefined ? (Number(line.variance) > 0 ? `+${line.variance}` : String(line.variance)) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryCounts() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const { data: counts = [], isLoading } = useInventoryCounts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: items = [] } = useItems();
  const createCount = useCreateInventoryCount();

  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingCount, setEditingCount] = useState<InventoryCount | null>(null);
  const [viewingCount, setViewingCount] = useState<InventoryCount | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [countDate, setCountDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [approveCountId, setApproveCountId] = useState<string | null>(null);
  const filteredCounts = counts.filter(c => {
    const matchesSearch = c.count_number.toLowerCase().includes(search.toLowerCase()) || (c.notes || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const pagination = usePagination(filteredCounts, 10);

  const approve = useApproveInventoryCount();
  const postCount = usePostInventoryCount();
  const deleteCountMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("Organization not found");
      // Delete child lines first; surface any error (previously swallowed via console.warn)
      const { error: linesErr } = await (supabase as any).from("inventory_count_lines").delete().eq("count_id", id);
      if (linesErr) throw linesErr;
      // Delete the header and verify the row was actually removed (guards against
      // silent RLS blocks that return success but delete 0 rows)
      const { data: deleted, error: e2 } = await (supabase as any).from("inventory_counts").delete().eq("id", id).eq("organization_id", orgId).select("id");
      if (e2) throw e2;
      if (!deleted || deleted.length === 0)
        throw new Error("Count not found or could not be deleted. You may not have permission.");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory-counts"] }); toast.success("Count deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteCount = (id: string) => deleteCountMutation.mutate(id);
  const [countItems, setCountItems] = useState<CountItemRow[]>([{ item_name: "", expected_qty: 0 }]);

  const stats = {
    total: counts.length,
    draft: counts.filter((c) => c.status === "draft").length,
    approved: counts.filter((c) => c.status === "approved").length,
    posted: counts.filter((c) => c.status === "posted").length,
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
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-blue-500" /><div><p className="text-2xl font-bold text-foreground">{stats.approved}</p><p className="text-xs text-muted-foreground">Approved</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.posted}</p><p className="text-xs text-muted-foreground">Posted</p></div></div></CardContent></Card>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search counts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border bg-card">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : filteredCounts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">{search || statusFilter !== "all" ? "No matching counts." : "No inventory counts yet. Create your first count above."}</div>
          ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Count #</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Date</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Warehouse</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Notes</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.paginatedItems.map((count) => (
                      <React.Fragment key={count.id}>
                        <tr className="border-b last:border-b-0 hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <button className="flex items-center gap-1 font-mono font-semibold text-foreground hover:text-primary text-left" onClick={() => toggleExpand(count.id)}>
                              {expanded.has(count.id) ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                              {count.count_number}
                            </button>
                          </td>
                          <td className="px-4 py-3">{format(new Date(count.count_date), "dd MMM yyyy")}</td>
                          <td className="px-4 py-3 text-muted-foreground">{(warehouses.find((w: any) => w.id === count.warehouse_id) as any)?.name || count.warehouse_id}</td>
                          <td className="px-4 py-3"><Badge className={statusColors[count.status] || ""}>{count.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge></td>
                          <td className="px-4 py-3 text-muted-foreground truncate max-w-[160px]">{count.notes || "—"}</td>
                          <td className="px-4 py-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setViewingCount(count)}>
                                  <Eye className="h-4 w-4 mr-2" /> View Details
                                </DropdownMenuItem>
                                {count.status === "draft" && (
                                  <>
                                    <DropdownMenuItem onClick={() => { setEditingCount(count); setWarehouseId(count.warehouse_id); setCountDate(count.count_date); setNotes(count.notes || ""); setDialogOpen(true); }}>
                                      <Pencil className="h-4 w-4 mr-2" /> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setApproveCountId(count.id)}>
                                      <ShieldCheck className="h-4 w-4 mr-2" /> Approve
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive" onClick={() => deleteCount(count.id)}>
                                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {count.status === "approved" && (
                                  <DropdownMenuItem onClick={() => postCount.mutate(count.id)}>
                                    <Send className="h-4 w-4 mr-2" /> Post Variances
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                        {expanded.has(count.id) && (
                          <tr><td colSpan={6}><CountLinesPanel countId={count.id} countStatus={count.status} /></td></tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
          )}
        </div>
        <TablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />

        {/* View Details Dialog */}
        {viewingCount && (
          <ViewCountDialog count={viewingCount} open={!!viewingCount} onClose={() => setViewingCount(null)} warehouses={warehouses} />
        )}

        {/* Approve Dialog */}
        {approveCountId && (
          <ApproveDialog countId={approveCountId} open={!!approveCountId} onOpenChange={(v) => { if (!v) setApproveCountId(null); }} />
        )}

        {/* New Count Dialog */}
        <CountFormDialog
          dialogOpen={dialogOpen} setDialogOpen={setDialogOpen}
          warehouses={warehouses} items={items}
          warehouseId={warehouseId} setWarehouseId={setWarehouseId}
          countDate={countDate} setCountDate={setCountDate}
          notes={notes} setNotes={setNotes}
          countItems={countItems} addItemRow={addItemRow} removeItemRow={removeItemRow}
          updateItemRow={updateItemRow} handleSelectItem={handleSelectItem}
          handleCreate={handleCreate} isPending={createCount.isPending}
        />
      </div>
    </MainLayout>
  );
}
