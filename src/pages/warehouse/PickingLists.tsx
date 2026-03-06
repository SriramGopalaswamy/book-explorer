import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, Column } from "@/components/ui/data-table";
import { ClipboardList, PlayCircle, CheckCircle, XCircle } from "lucide-react";
import { usePickingLists, PickingList } from "@/hooks/useWarehouse";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  completed: "bg-green-500/20 text-green-400",
  cancelled: "bg-destructive/20 text-destructive",
};

export default function PickingLists() {
  const { data: lists = [], isLoading } = usePickingLists();

  const stats = {
    total: lists.length,
    pending: lists.filter((l) => l.status === "pending").length,
    in_progress: lists.filter((l) => l.status === "in_progress").length,
    completed: lists.filter((l) => l.status === "completed").length,
  };

  const columns: Column<PickingList>[] = [
    { key: "pick_number", header: "Pick #", render: (r) => <span className="font-mono font-semibold text-foreground">{r.pick_number}</span> },
    { key: "created_at", header: "Created", render: (r) => format(new Date(r.created_at), "dd MMM yyyy") },
    { key: "status", header: "Status", render: (r) => <Badge className={statusColors[r.status] || ""}>{r.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge> },
    { key: "notes", header: "Notes", render: (r) => <span className="text-muted-foreground truncate max-w-[200px] block">{r.notes || "—"}</span> },
  ];

  return (
    <MainLayout title="Picking Lists" subtitle="Manage warehouse picking operations">
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Picking Lists</h1><p className="text-muted-foreground">Pick items from warehouse for sales orders</p></div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ClipboardList className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PlayCircle className="h-8 w-8 text-muted-foreground" /><div><p className="text-2xl font-bold text-foreground">{stats.pending}</p><p className="text-xs text-muted-foreground">Pending</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PlayCircle className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.in_progress}</p><p className="text-xs text-muted-foreground">In Progress</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.completed}</p><p className="text-xs text-muted-foreground">Completed</p></div></div></CardContent></Card>
        </div>

        <DataTable columns={columns} data={lists} isLoading={isLoading} emptyMessage="No picking lists yet. Generate one from a Sales Order." />
      </div>
    </MainLayout>
  );
}
