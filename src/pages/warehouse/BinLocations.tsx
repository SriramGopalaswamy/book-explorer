import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DataTable, Column } from "@/components/ui/data-table";
import { Plus, MapPin, CheckCircle, XCircle, Search } from "lucide-react";
import { useBinLocations, useCreateBinLocation, BinLocation } from "@/hooks/useWarehouse";

export default function BinLocations() {
  const { data: bins = [], isLoading } = useBinLocations();
  const createBin = useCreateBinLocation();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ warehouse_id: "", bin_code: "", zone: "", aisle: "", rack: "", level: "", capacity_units: 0, notes: "" });

  const filtered = bins.filter((b) =>
    b.bin_code.toLowerCase().includes(search.toLowerCase()) ||
    (b.zone || "").toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: bins.length,
    active: bins.filter((b) => b.is_active).length,
    inactive: bins.filter((b) => !b.is_active).length,
    zones: new Set(bins.map((b) => b.zone).filter(Boolean)).size,
  };

  const handleCreate = () => {
    if (!form.bin_code || !form.warehouse_id) return;
    createBin.mutate({ ...form, capacity_units: form.capacity_units || undefined }, {
      onSuccess: () => {
        setDialogOpen(false);
        setForm({ warehouse_id: "", bin_code: "", zone: "", aisle: "", rack: "", level: "", capacity_units: 0, notes: "" });
      },
    });
  };

  const columns: Column<BinLocation>[] = [
    { key: "bin_code", header: "Bin Code", render: (r) => <span className="font-mono font-semibold text-foreground">{r.bin_code}</span> },
    { key: "zone", header: "Zone", render: (r) => r.zone || <span className="text-muted-foreground">—</span> },
    { key: "aisle", header: "Aisle", render: (r) => r.aisle || <span className="text-muted-foreground">—</span> },
    { key: "rack", header: "Rack/Level", render: (r) => [r.rack, r.level].filter(Boolean).join("-") || <span className="text-muted-foreground">—</span> },
    { key: "current_units", header: "Current", render: (r) => <span className="font-semibold text-foreground">{Number(r.current_units).toLocaleString()}</span> },
    { key: "capacity_units", header: "Capacity", render: (r) => r.capacity_units ? Number(r.capacity_units).toLocaleString() : <span className="text-muted-foreground">∞</span> },
    { key: "is_active", header: "Status", render: (r) => <Badge className={r.is_active ? "bg-green-500/20 text-green-400" : "bg-destructive/20 text-destructive"}>{r.is_active ? "Active" : "Inactive"}</Badge> },
  ];

  return (
    <MainLayout title="Bin Locations" subtitle="Manage warehouse storage locations">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold text-foreground">Bin Locations</h1><p className="text-muted-foreground">Manage storage slots within warehouses</p></div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Bin</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Bin Location</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Warehouse ID *</Label><Input value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} placeholder="Paste warehouse ID" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Bin Code *</Label><Input value={form.bin_code} onChange={(e) => setForm({ ...form, bin_code: e.target.value })} placeholder="e.g. A-01-01" /></div>
                  <div><Label>Zone</Label><Input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} /></div>
                  <div><Label>Aisle</Label><Input value={form.aisle} onChange={(e) => setForm({ ...form, aisle: e.target.value })} /></div>
                  <div><Label>Rack</Label><Input value={form.rack} onChange={(e) => setForm({ ...form, rack: e.target.value })} /></div>
                  <div><Label>Level</Label><Input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} /></div>
                  <div><Label>Capacity</Label><Input type="number" value={form.capacity_units} onChange={(e) => setForm({ ...form, capacity_units: Number(e.target.value) })} /></div>
                </div>
                <Button onClick={handleCreate} disabled={createBin.isPending} className="w-full">{createBin.isPending ? "Creating..." : "Create Bin"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><MapPin className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total Bins</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.active}</p><p className="text-xs text-muted-foreground">Active</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><XCircle className="h-8 w-8 text-destructive" /><div><p className="text-2xl font-bold text-foreground">{stats.inactive}</p><p className="text-xs text-muted-foreground">Inactive</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><MapPin className="h-8 w-8 text-blue-500" /><div><p className="text-2xl font-bold text-foreground">{stats.zones}</p><p className="text-xs text-muted-foreground">Zones</p></div></div></CardContent></Card>
        </div>

        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search bins..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>
        <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No bin locations yet" />
      </div>
    </MainLayout>
  );
}
