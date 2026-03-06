import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, Column } from "@/components/ui/data-table";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Truck, PackageCheck, RotateCcw, ClipboardList } from "lucide-react";
import { format } from "date-fns";

interface DeliveryNote {
  id: string;
  dn_number: string;
  delivery_date: string;
  status: string;
  notes: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  dispatched: "bg-blue-500/20 text-blue-400",
  in_transit: "bg-yellow-500/20 text-yellow-400",
  delivered: "bg-green-500/20 text-green-400",
  returned: "bg-destructive/20 text-destructive",
};

export default function DeliveryNotes() {
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["delivery-notes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_notes" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DeliveryNote[];
    },
  });

  const stats = {
    total: notes.length,
    in_transit: notes.filter((n) => n.status === "in_transit").length,
    delivered: notes.filter((n) => n.status === "delivered").length,
    returned: notes.filter((n) => n.status === "returned").length,
  };

  const columns: Column<DeliveryNote>[] = [
    { key: "dn_number", header: "DN #", render: (r) => <span className="font-mono font-semibold text-foreground">{r.dn_number}</span> },
    { key: "delivery_date", header: "Date", render: (r) => format(new Date(r.delivery_date), "dd MMM yyyy") },
    { key: "status", header: "Status", render: (r) => <Badge className={statusColors[r.status] || ""}>{r.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge> },
    { key: "notes", header: "Notes", render: (r) => <span className="text-muted-foreground truncate max-w-[200px] block">{r.notes || "—"}</span> },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Delivery Notes</h1>
          <p className="text-muted-foreground">Track outbound shipments from sales orders</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ClipboardList className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total DNs</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Truck className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.in_transit}</p><p className="text-xs text-muted-foreground">In Transit</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PackageCheck className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.delivered}</p><p className="text-xs text-muted-foreground">Delivered</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><RotateCcw className="h-8 w-8 text-destructive" /><div><p className="text-2xl font-bold text-foreground">{stats.returned}</p><p className="text-xs text-muted-foreground">Returned</p></div></div></CardContent></Card>
        </div>

        <DataTable columns={columns} data={notes} isLoading={isLoading} emptyMessage="No delivery notes yet. Create one from a Sales Order." />
      </div>
    </MainLayout>
  );
}
