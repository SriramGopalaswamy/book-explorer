import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/data-table";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Flame, Package, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";

interface MaterialConsumption {
  id: string;
  work_order_id: string;
  material_name: string;
  planned_quantity: number;
  actual_quantity: number;
  wastage_quantity: number;
  consumed_at: string;
}

export default function MaterialConsumptionPage() {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ["material-consumption"],
    queryFn: async () => {
      const { data, error } = await supabase.from("material_consumption" as any).select("*").order("consumed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as MaterialConsumption[];
    },
  });

  const totalPlanned = records.reduce((s, r) => s + Number(r.planned_quantity), 0);
  const totalActual = records.reduce((s, r) => s + Number(r.actual_quantity), 0);
  const totalWastage = records.reduce((s, r) => s + Number(r.wastage_quantity), 0);

  const columns: Column<MaterialConsumption>[] = [
    { key: "material_name", header: "Material", render: (r) => <span className="font-semibold text-foreground">{r.material_name}</span> },
    { key: "planned_quantity", header: "Planned Qty", render: (r) => Number(r.planned_quantity).toLocaleString() },
    { key: "actual_quantity", header: "Actual Qty", render: (r) => <span className="font-semibold text-foreground">{Number(r.actual_quantity).toLocaleString()}</span> },
    { key: "wastage_quantity", header: "Wastage", render: (r) => Number(r.wastage_quantity) > 0 ? <Badge variant="destructive">{Number(r.wastage_quantity)}</Badge> : <span className="text-muted-foreground">0</span> },
    { key: "consumed_at", header: "Date", render: (r) => format(new Date(r.consumed_at), "dd MMM yyyy") },
  ];

  return (
    <MainLayout title="Material Consumption" subtitle="Track raw material usage in production">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Material Consumption</h1>
          <p className="text-muted-foreground">Track raw material usage across work orders</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Package className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{records.length}</p><p className="text-xs text-muted-foreground">Total Records</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-blue-500" /><div><p className="text-2xl font-bold text-foreground">{totalPlanned.toLocaleString()}</p><p className="text-xs text-muted-foreground">Planned Qty</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Flame className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{totalActual.toLocaleString()}</p><p className="text-xs text-muted-foreground">Actual Consumed</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-destructive" /><div><p className="text-2xl font-bold text-foreground">{totalWastage.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Wastage</p></div></div></CardContent></Card>
        </div>

        <DataTable columns={columns} data={records} isLoading={isLoading} emptyMessage="No consumption records yet. Log material usage from Work Orders." />
      </div>
    </MainLayout>
  );
}
