import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/data-table";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { PackageCheck, Package, AlertTriangle, IndianRupee } from "lucide-react";
import { format } from "date-fns";

interface FinishedGoodsEntry {
  id: string;
  work_order_id: string;
  product_name: string;
  quantity: number;
  rejected_quantity: number;
  cost_per_unit: number | null;
  total_cost: number | null;
  posted_at: string;
  notes: string | null;
}

export default function FinishedGoods() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["finished-goods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("finished_goods_entries" as any).select("*").order("posted_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as FinishedGoodsEntry[];
    },
  });

  const totalQty = entries.reduce((s, e) => s + Number(e.quantity), 0);
  const totalRejected = entries.reduce((s, e) => s + Number(e.rejected_quantity), 0);
  const totalCost = entries.reduce((s, e) => s + Number(e.total_cost || 0), 0);

  const columns: Column<FinishedGoodsEntry>[] = [
    { key: "product_name", header: "Product", render: (r) => <span className="font-semibold text-foreground">{r.product_name}</span> },
    { key: "quantity", header: "Qty Produced", render: (r) => <span className="font-semibold text-foreground">{Number(r.quantity).toLocaleString()}</span> },
    { key: "rejected_quantity", header: "Rejected", render: (r) => Number(r.rejected_quantity) > 0 ? <Badge variant="destructive">{Number(r.rejected_quantity)}</Badge> : <span className="text-muted-foreground">0</span> },
    { key: "total_cost", header: "Total Cost", render: (r) => r.total_cost ? `₹${Number(r.total_cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : <span className="text-muted-foreground">—</span> },
    { key: "posted_at", header: "Date", render: (r) => format(new Date(r.posted_at), "dd MMM yyyy") },
  ];

  return (
    <MainLayout title="Finished Goods" subtitle="Track completed production output">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Finished Goods</h1>
          <p className="text-muted-foreground">Track completed production output and quality metrics</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PackageCheck className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{entries.length}</p><p className="text-xs text-muted-foreground">Total Entries</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Package className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{totalQty.toLocaleString()}</p><p className="text-xs text-muted-foreground">Units Produced</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-destructive" /><div><p className="text-2xl font-bold text-foreground">{totalRejected.toLocaleString()}</p><p className="text-xs text-muted-foreground">Rejected</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><IndianRupee className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">₹{totalCost.toLocaleString("en-IN")}</p><p className="text-xs text-muted-foreground">Total Cost</p></div></div></CardContent></Card>
        </div>

        <DataTable columns={columns} data={entries} isLoading={isLoading} emptyMessage="No finished goods entries yet. Post output from Work Orders." />
      </div>
    </MainLayout>
  );
}
