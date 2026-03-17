import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PackageCheck, Package, AlertTriangle, IndianRupee, Plus } from "lucide-react";
import { usePostFinishedGoods } from "@/hooks/useManufacturing";
import { useWorkOrders } from "@/hooks/useManufacturing";
import { useWarehouses } from "@/hooks/useInventory";
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
  const { data: workOrders = [] } = useWorkOrders();
  const { data: warehouses = [] } = useWarehouses();
  const postFG = usePostFinishedGoods();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedWO, setSelectedWO] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [fgNotes, setFgNotes] = useState("");

  const completedWOs = workOrders.filter((wo) => wo.status === "completed");

  const totalQty = entries.reduce((s, e) => s + Number(e.quantity), 0);
  const totalRejected = entries.reduce((s, e) => s + Number(e.rejected_quantity), 0);
  const totalCost = entries.reduce((s, e) => s + Number(e.total_cost || 0), 0);

  const handlePost = () => {
    const wo = workOrders.find((w) => w.id === selectedWO);
    if (!wo) return;
    postFG.mutate(
      {
        work_order_id: wo.id,
        product_name: wo.product_name,
        product_item_id: wo.product_item_id || null,
        quantity: wo.completed_quantity,
        rejected_quantity: wo.rejected_quantity,
        cost_per_unit: costPerUnit ? parseFloat(costPerUnit) : undefined,
        warehouse_id: warehouseId || wo.warehouse_id || null,
        notes: fgNotes || undefined,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setSelectedWO(""); setCostPerUnit(""); setWarehouseId(""); setFgNotes("");
        },
      }
    );
  };

  const columns: Column<FinishedGoodsEntry>[] = [
    { key: "product_name", header: "Product", render: (r) => <span className="font-semibold text-foreground">{r.product_name}</span> },
    { key: "quantity", header: "Qty Produced", render: (r) => <span className="font-semibold text-foreground">{Number(r.quantity).toLocaleString()}</span> },
    { key: "rejected_quantity", header: "Rejected", render: (r) => Number(r.rejected_quantity) > 0 ? <Badge variant="destructive">{Number(r.rejected_quantity)}</Badge> : <span className="text-muted-foreground">0</span> },
    { key: "total_cost", header: "Total Cost", render: (r) => r.total_cost ? `₹${Number(r.total_cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : <span className="text-muted-foreground">—</span> },
    { key: "posted_at", header: "Date", render: (r) => format(new Date(r.posted_at), "dd MMM yyyy") },
    { key: "notes" as any, header: "Notes", render: (r) => <span className="text-muted-foreground truncate max-w-[200px] block">{r.notes || "—"}</span> },
  ];

  return (
    <MainLayout title="Finished Goods" subtitle="Track completed production output">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button onClick={() => setDialogOpen(true)} disabled={completedWOs.length === 0}>
            <Plus className="h-4 w-4 mr-2" /> Post Production
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PackageCheck className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{entries.length}</p><p className="text-xs text-muted-foreground">Total Entries</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Package className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{totalQty.toLocaleString()}</p><p className="text-xs text-muted-foreground">Units Produced</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-destructive" /><div><p className="text-2xl font-bold text-foreground">{totalRejected.toLocaleString()}</p><p className="text-xs text-muted-foreground">Rejected</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><IndianRupee className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">₹{totalCost.toLocaleString("en-IN")}</p><p className="text-xs text-muted-foreground">Total Cost</p></div></div></CardContent></Card>
        </div>

        <DataTable columns={columns} data={entries} isLoading={isLoading} emptyMessage="No finished goods entries yet. Post output from Work Orders." />

        {/* Post Production Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Post Finished Goods</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Work Order (completed) *</Label>
                <Select value={selectedWO} onValueChange={setSelectedWO}>
                  <SelectTrigger><SelectValue placeholder="Select work order" /></SelectTrigger>
                  <SelectContent>
                    {completedWOs.map((wo) => (
                      <SelectItem key={wo.id} value={wo.id}>
                        {wo.wo_number} — {wo.product_name} (qty: {wo.completed_quantity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cost Per Unit (optional)</Label>
                  <Input type="number" value={costPerUnit} onChange={(e) => setCostPerUnit(e.target.value)} placeholder="e.g. 150.00" min={0} />
                </div>
                <div>
                  <Label>Warehouse</Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger><SelectValue placeholder="Default" /></SelectTrigger>
                    <SelectContent>
                      {warehouses.filter((w: any) => w.is_active !== false).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={fgNotes} onChange={(e) => setFgNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handlePost} disabled={postFG.isPending || !selectedWO}>
                {postFG.isPending ? "Posting…" : "Post to Inventory"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
