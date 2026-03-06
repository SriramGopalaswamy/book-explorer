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
import { Plus, Wrench, Clock, PlayCircle, CheckCircle, Search } from "lucide-react";
import { useWorkOrders, useCreateWorkOrder, useUpdateWOStatus, WorkOrder } from "@/hooks/useManufacturing";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  planned: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  completed: "bg-green-500/20 text-green-400",
  cancelled: "bg-destructive/20 text-destructive",
};

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-blue-500/20 text-blue-400",
  high: "bg-orange-500/20 text-orange-400",
  urgent: "bg-destructive/20 text-destructive",
};

export default function WorkOrders() {
  const { data: orders = [], isLoading } = useWorkOrders();
  const createWO = useCreateWorkOrder();
  const updateStatus = useUpdateWOStatus();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ product_name: "", planned_quantity: 1, priority: "normal", planned_start: "", planned_end: "", notes: "" });

  const filtered = orders.filter((o) =>
    o.wo_number.toLowerCase().includes(search.toLowerCase()) ||
    o.product_name.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: orders.length,
    planned: orders.filter((o) => o.status === "planned").length,
    in_progress: orders.filter((o) => o.status === "in_progress").length,
    completed: orders.filter((o) => o.status === "completed").length,
  };

  const handleCreate = () => {
    if (!form.product_name) return;
    createWO.mutate(form, {
      onSuccess: () => {
        setDialogOpen(false);
        setForm({ product_name: "", planned_quantity: 1, priority: "normal", planned_start: "", planned_end: "", notes: "" });
      },
    });
  };

  const columns: Column<WorkOrder>[] = [
    { key: "wo_number", header: "WO #", render: (r) => <span className="font-mono font-semibold text-foreground">{r.wo_number}</span> },
    { key: "product_name", header: "Product" },
    { key: "planned_quantity", header: "Planned Qty", render: (r) => <span className="font-semibold text-foreground">{Number(r.planned_quantity).toLocaleString()}</span> },
    { key: "completed_quantity", header: "Completed", render: (r) => <span className="text-foreground">{Number(r.completed_quantity).toLocaleString()}</span> },
    { key: "priority", header: "Priority", render: (r) => <Badge className={priorityColors[r.priority] || ""}>{r.priority.charAt(0).toUpperCase() + r.priority.slice(1)}</Badge> },
    {
      key: "status", header: "Status",
      render: (r) => (
        <Select value={r.status} onValueChange={(v) => updateStatus.mutate({ id: r.id, status: v })}>
          <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.keys(statusColors).map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
      ),
    },
    { key: "planned_start", header: "Start", render: (r) => r.planned_start ? format(new Date(r.planned_start), "dd MMM") : <span className="text-muted-foreground">—</span> },
  ];

  return (
    <MainLayout title="Work Orders" subtitle="Manage production scheduling and tracking">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Work Orders</h1>
            <p className="text-muted-foreground">Plan and track production runs</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Work Order</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create Work Order</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Product Name *</Label><Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} /></div>
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
                <Button onClick={handleCreate} disabled={createWO.isPending} className="w-full">{createWO.isPending ? "Creating..." : "Create Work Order"}</Button>
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

        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search work orders..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>

        <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No work orders yet. Create your first production run." />
      </div>
    </MainLayout>
  );
}
