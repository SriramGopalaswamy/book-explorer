import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useStockAdjustments, useCreateStockAdjustment, useWarehouses } from "@/hooks/useInventory";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, ClipboardList, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function StockAdjustments() {
  const { user } = useAuth();
  const { data: adjustments, isLoading } = useStockAdjustments();
  const { data: warehouses } = useWarehouses();
  const createAdj = useCreateStockAdjustment();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ adjustment_number: "", warehouse_id: "", reason: "", notes: "" });

  const filtered = (adjustments || []).filter((a: any) =>
    a.adjustment_number?.toLowerCase().includes(search.toLowerCase()) ||
    a.reason?.toLowerCase().includes(search.toLowerCase())
  );

  const whName = (id: string) => warehouses?.find((w: any) => w.id === id)?.name || id?.slice(0, 8);

  const statusColor = (s: string) => {
    const map: Record<string, string> = { draft: "secondary", approved: "default", posted: "default", cancelled: "destructive" };
    return (map[s] || "secondary") as any;
  };

  const handleCreate = () => {
    createAdj.mutate({
      adjustment_number: form.adjustment_number,
      warehouse_id: form.warehouse_id,
      reason: form.reason,
      notes: form.notes || null,
      created_by: user?.id,
    }, {
      onSuccess: () => {
        setOpen(false);
        setForm({ adjustment_number: "", warehouse_id: "", reason: "", notes: "" });
      },
    });
  };

  return (
    <MainLayout title="Stock Adjustments" subtitle="Create and manage inventory adjustments">
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10"><ClipboardList className="h-6 w-6 text-primary" /></div>
            <div><p className="text-sm text-muted-foreground">Total Adjustments</p><p className="text-2xl font-bold text-foreground">{adjustments?.length || 0}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-accent/20"><ClipboardList className="h-6 w-6 text-accent-foreground" /></div>
            <div><p className="text-sm text-muted-foreground">Pending</p><p className="text-2xl font-bold text-foreground">{(adjustments || []).filter((a: any) => a.status === "draft").length}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-secondary/50"><ClipboardList className="h-6 w-6 text-secondary-foreground" /></div>
            <div><p className="text-sm text-muted-foreground">Posted</p><p className="text-2xl font-bold text-foreground">{(adjustments || []).filter((a: any) => a.status === "posted").length}</p></div>
          </CardContent></Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search adjustments..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Adjustment</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Stock Adjustment</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div><Label>Adjustment # *</Label><Input value={form.adjustment_number} onChange={e => setForm(f => ({ ...f, adjustment_number: e.target.value }))} /></div>
                <div><Label>Warehouse *</Label>
                  <Select value={form.warehouse_id} onValueChange={v => setForm(f => ({ ...f, warehouse_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                    <SelectContent>
                      {(warehouses || []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Reason *</Label><Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></div>
                <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <Button onClick={handleCreate} disabled={!form.adjustment_number || !form.warehouse_id || !form.reason || createAdj.isPending}>
                  {createAdj.isPending ? "Creating..." : "Create Adjustment"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Adjustment #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No stock adjustments found.</TableCell></TableRow>
                  ) : filtered.map((adj: any) => (
                    <TableRow key={adj.id}>
                      <TableCell className="font-mono font-medium text-foreground">{adj.adjustment_number}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(adj.adjustment_date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-foreground">{whName(adj.warehouse_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{adj.reason}</TableCell>
                      <TableCell><Badge variant={statusColor(adj.status)}>{adj.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">{adj.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
