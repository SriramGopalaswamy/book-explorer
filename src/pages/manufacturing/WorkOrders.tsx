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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Wrench, Clock, PlayCircle, CheckCircle, Search, ClipboardCheck, PackageCheck, Pencil } from "lucide-react";
import {
  useWorkOrders, useCreateWorkOrder, useUpdateWorkOrder, useUpdateWOStatus, useRecordProduction, usePostFinishedGoods,
  useBOMs, useBOMCostRollup, WorkOrder,
} from "@/hooks/useManufacturing";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  planned: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  completed: "bg-green-500/20 text-green-400",
  on_hold: "bg-orange-500/20 text-orange-400",
  cancelled: "bg-destructive/20 text-destructive",
};

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-blue-500/20 text-blue-400",
  high: "bg-orange-500/20 text-orange-400",
  urgent: "bg-destructive/20 text-destructive",
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["planned", "cancelled"],
  planned: ["in_progress", "cancelled", "on_hold"],
  in_progress: ["completed", "on_hold", "cancelled"],
  on_hold: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

function BOMPreview({ bomId }: { bomId: string }) {
  const { data: rollup, isLoading } = useBOMCostRollup(bomId);
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading BOM…</p>;
  if (!rollup || rollup.lineDetails.length === 0) return <p className="text-xs text-muted-foreground">No material lines found.</p>;
  return (
    <div className="rounded border bg-muted/30 p-3 space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">BOM Materials</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs h-7">Material</TableHead>
            <TableHead className="text-xs h-7 text-right">Qty</TableHead>
            <TableHead className="text-xs h-7 text-right">Wastage</TableHead>
            <TableHead className="text-xs h-7 text-right">Est. Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rollup.lineDetails.map((l, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs py-1">{l.material_name}</TableCell>
              <TableCell className="text-xs py-1 text-right">{l.quantity}</TableCell>
              <TableCell className="text-xs py-1 text-right">{l.wastage_pct}%</TableCell>
              <TableCell className="text-xs py-1 text-right">₹{l.effectiveCost.toLocaleString("en-IN")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-right text-muted-foreground pt-1">
        Total with wastage: <span className="font-semibold text-foreground">₹{rollup.totalWithWastage.toLocaleString("en-IN")}</span>
      </p>
    </div>
  );
}

export default function WorkOrders() {
  const { data: orders = [], isLoading } = useWorkOrders();
  const { data: boms = [] } = useBOMs();
  const createWO = useCreateWorkOrder();
  const updateWO = useUpdateWorkOrder();
  const updateStatus = useUpdateWOStatus();
  const recordProduction = useRecordProduction();
  const postFinishedGoods = usePostFinishedGoods();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    product_name: "", planned_quantity: 1, priority: "normal",
    planned_start: "", planned_end: "", notes: "", bom_id: "",
  });

  // Reset form when dialog closes
  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setForm({ product_name: "", planned_quantity: 1, priority: "normal", planned_start: "", planned_end: "", notes: "", bom_id: "" });
    }
  };

  const [prodDialogOpen, setProdDialogOpen] = useState(false);
  const [prodWO, setProdWO] = useState<WorkOrder | null>(null);
  const [prodForm, setProdForm] = useState({ completed_quantity: 0, rejected_quantity: 0, actual_end: "", notes: "" });

  const [fgDialogOpen, setFgDialogOpen] = useState(false);
  const [fgWO, setFgWO] = useState<WorkOrder | null>(null);
  const [fgForm, setFgForm] = useState({ cost_per_unit: "", notes: "" });

  const filtered = orders.filter((o) => {
    const matchSearch = o.wo_number.toLowerCase().includes(search.toLowerCase()) ||
      o.product_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: orders.length,
    planned: orders.filter((o) => o.status === "planned").length,
    in_progress: orders.filter((o) => o.status === "in_progress").length,
    completed: orders.filter((o) => o.status === "completed").length,
  };

  const handleCreate = () => {
    if (!form.product_name) return;
    createWO.mutate(
      { ...form, bom_id: form.bom_id || undefined },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setForm({ product_name: "", planned_quantity: 1, priority: "normal", planned_start: "", planned_end: "", notes: "", bom_id: "" });
        },
      }
    );
  };

  const openProdDialog = (wo: WorkOrder) => {
    setProdWO(wo);
    setProdForm({
      completed_quantity: wo.completed_quantity ?? 0,
      rejected_quantity: wo.rejected_quantity ?? 0,
      actual_end: wo.actual_end ?? new Date().toISOString().split("T")[0],
      notes: wo.notes ?? "",
    });
    setProdDialogOpen(true);
  };

  const handleRecordProduction = () => {
    if (!prodWO) return;
    recordProduction.mutate(
      { id: prodWO.id, ...prodForm },
      { onSuccess: () => setProdDialogOpen(false) }
    );
  };

  const openFgDialog = (wo: WorkOrder) => {
    setFgWO(wo);
    setFgForm({ cost_per_unit: "", notes: "" });
    setFgDialogOpen(true);
  };

  const handlePostFG = () => {
    if (!fgWO) return;
    postFinishedGoods.mutate(
      {
        work_order_id: fgWO.id,
        product_name: fgWO.product_name,
        product_item_id: fgWO.product_item_id,
        quantity: fgWO.completed_quantity,
        rejected_quantity: fgWO.rejected_quantity,
        cost_per_unit: fgForm.cost_per_unit ? Number(fgForm.cost_per_unit) : undefined,
        warehouse_id: fgWO.warehouse_id,
        notes: fgForm.notes || undefined,
      },
      { onSuccess: () => setFgDialogOpen(false) }
    );
  };

  const columns: Column<WorkOrder>[] = [
    { key: "wo_number", header: "WO #", render: (r) => <span className="font-mono font-semibold text-foreground">{r.wo_number}</span> },
    { key: "product_name", header: "Product" },
    {
      key: "planned_quantity", header: "Qty",
      render: (r) => (
        <span className="text-foreground">
          {Number(r.completed_quantity)}/{Number(r.planned_quantity)}
          {Number(r.rejected_quantity) > 0 && <span className="text-destructive ml-1">({r.rejected_quantity} rej)</span>}
        </span>
      ),
    },
    { key: "priority", header: "Priority", render: (r) => <Badge className={priorityColors[r.priority] || ""}>{r.priority.charAt(0).toUpperCase() + r.priority.slice(1)}</Badge> },
    {
      key: "status", header: "Status",
      render: (r) => {
        const allowed = VALID_TRANSITIONS[r.status] ?? [];
        if (allowed.length === 0) return <Badge className={statusColors[r.status] || ""}>{r.status.replace(/_/g, " ")}</Badge>;
        return (
          <Select value="" onValueChange={(v) => { if (v && v !== r.status) updateStatus.mutate({ id: r.id, status: v }); }}>
            <SelectTrigger className="w-[150px] h-8">
              <span>{r.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
            </SelectTrigger>
            <SelectContent>
              {allowed.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      key: "id" as any, header: "Actions",
      render: (r) => (
        <div className="flex items-center gap-1">
          {(r.status === "in_progress" || r.status === "planned") && (
            <Button variant="outline" size="sm" onClick={() => openProdDialog(r)}>
              <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Record
            </Button>
          )}
          {r.status === "completed" && (
            <Button variant="outline" size="sm" onClick={() => openFgDialog(r)}>
              <PackageCheck className="h-3.5 w-3.5 mr-1" /> Post FG
            </Button>
          )}
        </div>
      ),
    },
    { key: "notes", header: "Notes", render: (r) => <span className="text-muted-foreground truncate max-w-[120px] block">{r.notes || "—"}</span> },
    { key: "planned_start", header: "Start", render: (r) => r.planned_start ? format(new Date(r.planned_start), "dd MMM") : <span className="text-muted-foreground">—</span> },
  ];

  return (
    <MainLayout title="Work Orders" subtitle="Manage production scheduling and tracking">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Work Order</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Work Order</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Product Name *</Label><Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} /></div>
                <div>
                  <Label>Bill of Materials (optional)</Label>
                  <Select value={form.bom_id || "none"} onValueChange={(v) => setForm({ ...form, bom_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Select BOM…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {boms.map((b) => <SelectItem key={b.id} value={b.id}>{b.product_name} ({b.bom_code})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.bom_id && <BOMPreview bomId={form.bom_id} />}
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Planned Quantity</Label><Input type="number" value={form.planned_quantity} onChange={(e) => setForm({ ...form, planned_quantity: Number(e.target.value) })} /></div>
                  <div>
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Planned Start</Label><Input type="date" value={form.planned_start} onChange={(e) => setForm({ ...form, planned_start: e.target.value })} /></div>
                  <div><Label>Planned End</Label><Input type="date" value={form.planned_end} onChange={(e) => setForm({ ...form, planned_end: e.target.value })} /></div>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <Button onClick={handleCreate} disabled={createWO.isPending} className="w-full">{createWO.isPending ? "Creating…" : "Create Work Order"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Wrench className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total WOs</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Clock className="h-8 w-8 text-blue-500" /><div><p className="text-2xl font-bold text-foreground">{stats.planned}</p><p className="text-xs text-muted-foreground">Planned</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PlayCircle className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.in_progress}</p><p className="text-xs text-muted-foreground">In Progress</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.completed}</p><p className="text-xs text-muted-foreground">Completed</p></div></div></CardContent></Card>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search work orders…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No work orders yet. Create your first production run." />
      </div>

      {/* Record Production Dialog */}
      <Dialog open={prodDialogOpen} onOpenChange={setProdDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Production — {prodWO?.wo_number}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Product: <span className="font-semibold text-foreground">{prodWO?.product_name}</span>
              {" · "}Planned: <span className="font-semibold text-foreground">{prodWO?.planned_quantity}</span>
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Completed Qty *</Label>
                <Input type="number" min={0} value={prodForm.completed_quantity}
                  onChange={(e) => setProdForm((p) => ({ ...p, completed_quantity: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Rejected Qty</Label>
                <Input type="number" min={0} value={prodForm.rejected_quantity}
                  onChange={(e) => setProdForm((p) => ({ ...p, rejected_quantity: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label>Actual End Date</Label>
              <Input type="date" value={prodForm.actual_end}
                onChange={(e) => setProdForm((p) => ({ ...p, actual_end: e.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={prodForm.notes}
                onChange={(e) => setProdForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setProdDialogOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleRecordProduction} disabled={recordProduction.isPending}>
                {recordProduction.isPending ? "Saving…" : "Save Production"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post Finished Goods Dialog */}
      <Dialog open={fgDialogOpen} onOpenChange={setFgDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Post Finished Goods — {fgWO?.wo_number}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Product: <span className="font-semibold text-foreground">{fgWO?.product_name}</span>
              {" · "}Completed: <span className="font-semibold text-green-400">{fgWO?.completed_quantity}</span>
              {Number(fgWO?.rejected_quantity) > 0 && <span className="text-destructive"> ({fgWO?.rejected_quantity} rejected)</span>}
            </p>
            <div>
              <Label>Cost per Unit (optional)</Label>
              <Input type="number" min={0} step="0.01" placeholder="Leave blank to skip costing"
                value={fgForm.cost_per_unit}
                onChange={(e) => setFgForm((p) => ({ ...p, cost_per_unit: e.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={fgForm.notes}
                onChange={(e) => setFgForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setFgDialogOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handlePostFG} disabled={postFinishedGoods.isPending}>
                {postFinishedGoods.isPending ? "Posting…" : "Post to Inventory"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
