import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, Column } from "@/components/ui/data-table";
import { Plus, MapPin, CheckCircle, XCircle, Search, Pencil, Trash2 } from "lucide-react";
import { useBinLocations, useCreateBinLocation, useUpdateBinLocation, useDeleteBinLocation, BinLocation } from "@/hooks/useWarehouse";
import { useWarehouses } from "@/hooks/useInventory";

export default function BinLocations() {
  const { data: bins = [], isLoading } = useBinLocations();
  const { data: warehouses = [] } = useWarehouses();
  const createBin = useCreateBinLocation();
  const updateBin = useUpdateBinLocation();
  const deleteBin = useDeleteBinLocation();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingBin, setEditingBin] = useState<BinLocation | null>(null);
  const [form, setForm] = useState({ warehouse_id: "", bin_code: "", zone: "", aisle: "", rack: "", level: "", capacity_units: 0, notes: "" });
  const [editForm, setEditForm] = useState({ bin_code: "", zone: "", aisle: "", rack: "", level: "", capacity_units: 0, is_active: true, notes: "" });

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

  const openEdit = (bin: BinLocation) => {
    setEditingBin(bin);
    setEditForm({ bin_code: bin.bin_code, zone: bin.zone || "", aisle: bin.aisle || "", rack: bin.rack || "", level: bin.level || "", capacity_units: bin.capacity_units || 0, is_active: bin.is_active, notes: bin.notes || "" });
    setEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!editingBin) return;
    updateBin.mutate({ id: editingBin.id, ...editForm, capacity_units: editForm.capacity_units || undefined }, {
      onSuccess: () => { setEditDialogOpen(false); setEditingBin(null); },
    });
  };

  const handleDelete = (id: string) => {
    deleteBin.mutate(id, {
      onSuccess: () => setDeleteConfirmId(null),
    });
  };

  const whName = (id: string) => warehouses.find((w: any) => w.id === id)?.name || "—";

  const columns: Column<BinLocation>[] = [
    { key: "bin_code", header: "Bin Code", render: (r) => <span className="font-mono font-semibold text-foreground">{r.bin_code}</span> },
    { key: "warehouse_id" as any, header: "Warehouse", render: (r) => <span className="text-foreground">{whName((r as any).warehouse_id)}</span> },
    { key: "zone", header: "Zone", render: (r) => r.zone || <span className="text-muted-foreground">—</span> },
    { key: "aisle", header: "Aisle", render: (r) => r.aisle || <span className="text-muted-foreground">—</span> },
    { key: "rack", header: "Rack/Level", render: (r) => [r.rack, r.level].filter(Boolean).join("-") || <span className="text-muted-foreground">—</span> },
    { key: "current_units", header: "Current Units", render: (r) => <span className="font-semibold text-foreground" title="Updated automatically when stock is assigned to this bin">{Number(r.current_units).toLocaleString()}</span> },
    { key: "capacity_units", header: "Capacity", render: (r) => r.capacity_units ? Number(r.capacity_units).toLocaleString() : <span className="text-muted-foreground">∞</span> },
    { key: "notes" as any, header: "Notes", render: (r) => (r as any).notes ? <span className="text-muted-foreground max-w-[120px] truncate block" title={(r as any).notes}>{(r as any).notes}</span> : <span className="text-muted-foreground">—</span> },
    { key: "is_active", header: "Status", render: (r) => <Badge className={r.is_active ? "bg-green-500/20 text-green-400" : "bg-destructive/20 text-destructive"}>{r.is_active ? "Active" : "Inactive"}</Badge> },
    {
      key: "id", header: "",
      render: (r) => (
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setDeleteConfirmId(r.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <MainLayout title="Bin Locations" subtitle="Manage warehouse storage locations">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div></div>
          <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />New Bin</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><MapPin className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total Bins</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.active}</p><p className="text-xs text-muted-foreground">Active</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><XCircle className="h-8 w-8 text-destructive" /><div><p className="text-2xl font-bold text-foreground">{stats.inactive}</p><p className="text-xs text-muted-foreground">Inactive</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><MapPin className="h-8 w-8 text-blue-500" /><div><p className="text-2xl font-bold text-foreground">{stats.zones}</p><p className="text-xs text-muted-foreground">Zones</p></div></div></CardContent></Card>
        </div>

        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search bins..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>
        <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No bin locations yet" />

        {/* Create Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Bin Location</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Warehouse *</Label>
                <Select value={form.warehouse_id} onValueChange={(v) => setForm({ ...form, warehouse_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Bin Code *</Label><Input value={form.bin_code} onChange={(e) => setForm({ ...form, bin_code: e.target.value })} placeholder="e.g. A-01-01" /></div>
                <div><Label>Zone</Label><Input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} /></div>
                <div><Label>Aisle</Label><Input value={form.aisle} onChange={(e) => setForm({ ...form, aisle: e.target.value })} /></div>
                <div><Label>Rack</Label><Input value={form.rack} onChange={(e) => setForm({ ...form, rack: e.target.value })} /></div>
                <div><Label>Level</Label><Input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} /></div>
                <div><Label>Capacity</Label><Input type="number" value={form.capacity_units} onChange={(e) => setForm({ ...form, capacity_units: Number(e.target.value) })} /></div>
                <div><Label>Current Units</Label><Input type="number" value={(form as any).current_units || 0} onChange={(e) => setForm({ ...form, current_units: Number(e.target.value) } as any)} placeholder="0" /></div>
              </div>
              <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes about this bin location" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createBin.isPending || !form.bin_code || !form.warehouse_id}>
                {createBin.isPending ? "Creating..." : "Create Bin"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Bin Location</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Bin Code *</Label><Input value={editForm.bin_code} onChange={(e) => setEditForm({ ...editForm, bin_code: e.target.value })} /></div>
                <div><Label>Zone</Label><Input value={editForm.zone} onChange={(e) => setEditForm({ ...editForm, zone: e.target.value })} /></div>
                <div><Label>Aisle</Label><Input value={editForm.aisle} onChange={(e) => setEditForm({ ...editForm, aisle: e.target.value })} /></div>
                <div><Label>Rack</Label><Input value={editForm.rack} onChange={(e) => setEditForm({ ...editForm, rack: e.target.value })} /></div>
                <div><Label>Level</Label><Input value={editForm.level} onChange={(e) => setEditForm({ ...editForm, level: e.target.value })} /></div>
                <div><Label>Capacity</Label><Input type="number" value={editForm.capacity_units} onChange={(e) => setEditForm({ ...editForm, capacity_units: Number(e.target.value) })} /></div>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="isActive" checked={editForm.is_active} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })} />
                <Label htmlFor="isActive">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={updateBin.isPending}>
                {updateBin.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Delete Bin Location?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This action cannot be undone. Are you sure?</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)} disabled={deleteBin.isPending}>
                {deleteBin.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
