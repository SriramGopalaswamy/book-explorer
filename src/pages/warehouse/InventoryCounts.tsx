import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, Column } from "@/components/ui/data-table";
import { ClipboardCheck, Clock, PlayCircle, CheckCircle } from "lucide-react";
import { useInventoryCounts, InventoryCount } from "@/hooks/useWarehouse";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  completed: "bg-blue-500/20 text-blue-400",
  approved: "bg-green-500/20 text-green-400",
};

export default function InventoryCounts() {
  const { data: counts = [], isLoading } = useInventoryCounts();

  const stats = {
    total: counts.length,
    draft: counts.filter((c) => c.status === "draft").length,
    in_progress: counts.filter((c) => c.status === "in_progress").length,
    completed: counts.filter((c) => ["completed", "approved"].includes(c.status)).length,
  };

  const columns: Column<InventoryCount>[] = [
    { key: "count_number", header: "Count #", render: (r) => <span className="font-mono font-semibold text-foreground">{r.count_number}</span> },
    { key: "count_date", header: "Date", render: (r) => format(new Date(r.count_date), "dd MMM yyyy") },
    { key: "status", header: "Status", render: (r) => <Badge className={statusColors[r.status] || ""}>{r.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge> },
    { key: "notes", header: "Notes", render: (r) => <span className="text-muted-foreground truncate max-w-[200px] block">{r.notes || "—"}</span> },
  ];

  return (
    <MainLayout title="Inventory Counts" subtitle="Physical inventory verification">
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Inventory Counts</h1><p className="text-muted-foreground">Schedule and track physical inventory counts</p></div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ClipboardCheck className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Clock className="h-8 w-8 text-muted-foreground" /><div><p className="text-2xl font-bold text-foreground">{stats.draft}</p><p className="text-xs text-muted-foreground">Draft</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PlayCircle className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.in_progress}</p><p className="text-xs text-muted-foreground">In Progress</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.completed}</p><p className="text-xs text-muted-foreground">Completed</p></div></div></CardContent></Card>
        </div>

        <DataTable columns={columns} data={counts} isLoading={isLoading} emptyMessage="No inventory counts yet" />
      </div>
    </MainLayout>
  );
}
