import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, Column } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Layers, CheckCircle, Archive, Search, Trash2, MoreHorizontal, Eye, Pencil, Power } from "lucide-react";
import { useBOMs, useCreateBOM, useBOMLines, useBOMCostRollup, useUpdateBOMStatus, useDeleteBOM, BOM } from "@/hooks/useManufacturing";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-green-500/20 text-green-400",
  archived: "bg-yellow-500/20 text-yellow-400",
};

function BOMDetailDialog({ bom, open, onClose }: { bom: BOM; open: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useBOMLines(open ? bom.id : undefined);
  const { data: rollup } = useBOMCostRollup(open ? bom.id : undefined);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>BOM Details — {bom.bom_code}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Product:</span> <span className="font-medium text-foreground">{bom.product_name}</span></div>
            <div><span className="text-muted-foreground">Version:</span> <span className="font-medium text-foreground">v{bom.version}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <Badge className={statusColors[bom.status] || ""}>{bom.status}</Badge></div>
            <div><span className="text-muted-foreground">Created:</span> <span className="text-foreground">{format(new Date(bom.created_at), "dd MMM yyyy")}</span></div>
          </div>
          {bom.notes && <p className="text-sm text-muted-foreground">{bom.notes}</p>}

          <div>
            <h4 className="text-sm font-semibold mb-2">Materials ({lines.length})</h4>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No materials found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead className="text-right">Wastage %</TableHead>
                    <TableHead className="text-right">Est. Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l: any) => {
                    const detail = rollup?.lineDetails.find((d) => d.material_name === l.material_name);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium text-foreground">{l.material_name}</TableCell>
                        <TableCell className="text-right">{l.quantity}</TableCell>
                        <TableCell>{l.uom}</TableCell>
                        <TableCell className="text-right">{l.wastage_pct}%</TableCell>
                        <TableCell className="text-right">₹{(detail?.effectiveCost ?? 0).toLocaleString("en-IN")}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {rollup && (
              <p className="text-sm text-right mt-2 text-muted-foreground">
                Total cost (incl. wastage): <span className="font-semibold text-foreground">₹{rollup.totalWithWastage.toLocaleString("en-IN")}</span>
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BillOfMaterials() {
  const { data: boms = [], isLoading } = useBOMs();
  const createBOM = useCreateBOM();
  const updateStatus = useUpdateBOMStatus();
  const deleteBOM = useDeleteBOM();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewBom, setViewBom] = useState<BOM | null>(null);
  const [form, setForm] = useState({ product_name: "", notes: "" });
  const [lines, setLines] = useState([{ material_name: "", quantity: 1, uom: "pcs", wastage_pct: 0, est_cost: 0 }]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingBom, setEditingBom] = useState<BOM | null>(null);
  const [editForm, setEditForm] = useState({ product_name: "", notes: "" });
  const [editLines, setEditLines] = useState([{ material_name: "", quantity: 1, uom: "pcs", wastage_pct: 0, est_cost: 0 }]);
  const [savingEdit, setSavingEdit] = useState(false);
  const qc = useQueryClient();

  const addEditLine = () => setEditLines([...editLines, { material_name: "", quantity: 1, uom: "pcs", wastage_pct: 0, est_cost: 0 }]);
  const removeEditLine = (i: number) => setEditLines(editLines.filter((_, idx) => idx !== i));
  const updateEditLine = (i: number, field: string, value: any) => {
    const updated = [...editLines];
    (updated[i] as any)[field] = value;
    setEditLines(updated);
  };

  const openEditBom = async (r: BOM) => {
    setEditingBom(r);
    setEditForm({ product_name: r.product_name, notes: r.notes || "" });
    // Load existing lines
    const { data: existingLines } = await supabase.from("bom_lines" as any).select("*").eq("bom_id", r.id).order("sort_order");
    if (existingLines && existingLines.length > 0) {
      setEditLines((existingLines as any[]).map((l: any) => ({ material_name: l.material_name, quantity: l.quantity, uom: l.uom, wastage_pct: l.wastage_pct || 0, est_cost: l.est_cost || 0 })));
    } else {
      setEditLines([{ material_name: "", quantity: 1, uom: "pcs", wastage_pct: 0, est_cost: 0 }]);
    }
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingBom || !editForm.product_name.trim()) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase.from("bill_of_materials" as any).update({ product_name: editForm.product_name.trim(), notes: editForm.notes || null, updated_at: new Date().toISOString() } as any).eq("id", editingBom.id);
      if (error) throw error;
      // Delete old lines and re-insert
      await supabase.from("bom_lines" as any).delete().eq("bom_id", editingBom.id);
      const validLines = editLines.filter(l => l.material_name.trim());
      if (validLines.length > 0) {
        const lines = validLines.map((l, i) => ({ bom_id: editingBom.id, material_name: l.material_name, quantity: l.quantity, uom: l.uom, wastage_pct: l.wastage_pct, est_cost: l.est_cost || 0, sort_order: i }));
        const { error: lErr } = await supabase.from("bom_lines" as any).insert(lines as any);
        if (lErr) throw lErr;
      }
      toast.success("BOM updated");
      await qc.invalidateQueries({ queryKey: ["boms"] });
      await qc.invalidateQueries({ queryKey: ["bom-lines"] });
      await qc.invalidateQueries({ queryKey: ["bom-cost-rollup"] });
      setEditDialogOpen(false);
      setEditingBom(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const filtered = boms.filter((b) => {
    const matchSearch = b.bom_code.toLowerCase().includes(search.toLowerCase()) ||
      b.product_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: boms.length,
    active: boms.filter((b) => b.status === "active").length,
    draft: boms.filter((b) => b.status === "draft").length,
    archived: boms.filter((b) => b.status === "archived").length,
  };

  const addLine = () => setLines([...lines, { material_name: "", quantity: 1, uom: "pcs", wastage_pct: 0, est_cost: 0 }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: any) => {
    const updated = [...lines];
    (updated[i] as any)[field] = value;
    setLines(updated);
  };

  const handleCreate = () => {
    if (!form.product_name || lines.some((l) => !l.material_name)) return;
    createBOM.mutate({ ...form, lines: lines.map(l => ({ material_name: l.material_name, quantity: l.quantity, uom: l.uom, wastage_pct: l.wastage_pct, est_cost: l.est_cost || 0 })) }, {
      onSuccess: () => {
        setDialogOpen(false);
        setForm({ product_name: "", notes: "" });
        setLines([{ material_name: "", quantity: 1, uom: "pcs", wastage_pct: 0, est_cost: 0 }]);
      },
    });
  };

  const columns: Column<BOM>[] = [
    { key: "bom_code", header: "BOM Code", render: (r) => <span className="font-mono font-semibold text-foreground">{r.bom_code}</span> },
    { key: "product_name", header: "Product" },
    { key: "version", header: "Version", render: (r) => <span className="text-muted-foreground">v{r.version}</span> },
    { key: "status", header: "Status", render: (r) => <Badge className={statusColors[r.status] || ""}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Badge> },
    { key: "created_at", header: "Created", render: (r) => format(new Date(r.created_at), "dd MMM yyyy") },
    {
      key: "id" as any, header: "Actions",
      render: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setViewBom(r)}>
              <Eye className="h-4 w-4 mr-2" /> View Details
            </DropdownMenuItem>
            {r.status === "draft" && (
              <DropdownMenuItem onClick={() => openEditBom(r)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </DropdownMenuItem>
            )}
            {r.status === "draft" && (
              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: r.id, status: "active" })}>
                <CheckCircle className="h-4 w-4 mr-2" /> Mark Active
              </DropdownMenuItem>
            )}
            {r.status === "active" && (
              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: r.id, status: "archived" })}>
                <Archive className="h-4 w-4 mr-2" /> Archive
              </DropdownMenuItem>
            )}
            {r.status === "archived" && (
              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: r.id, status: "active" })}>
                <Power className="h-4 w-4 mr-2" /> Reactivate
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => deleteBOM.mutate(r.id)} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <MainLayout title="Bill of Materials" subtitle="Define product composition and material requirements">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New BOM</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Bill of Materials</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Product Name *</Label><Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} /></div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><Label className="text-base font-semibold">Materials</Label><Button variant="outline" size="sm" onClick={addLine}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
                  {lines.map((line, i) => (
                    <div key={i} className="grid grid-cols-[1fr_80px_80px_80px_80px_32px] gap-2 items-end">
                      <div><Label className="text-xs">Material</Label><Input value={line.material_name} onChange={(e) => updateLine(i, "material_name", e.target.value)} /></div>
                      <div><Label className="text-xs">Qty</Label><Input type="number" value={line.quantity} onChange={(e) => updateLine(i, "quantity", Number(e.target.value))} /></div>
                      <div><Label className="text-xs">UOM</Label><Input value={line.uom} onChange={(e) => updateLine(i, "uom", e.target.value)} /></div>
                      <div><Label className="text-xs">Waste %</Label><Input type="number" value={line.wastage_pct} onChange={(e) => updateLine(i, "wastage_pct", Number(e.target.value))} /></div>
                      <div><Label className="text-xs">Est. Cost</Label><Input type="number" value={line.est_cost} onChange={(e) => updateLine(i, "est_cost", Number(e.target.value))} placeholder="₹" /></div>
                      <Button variant="ghost" size="icon" onClick={() => removeLine(i)} disabled={lines.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  ))}
                </div>
                <Button onClick={handleCreate} disabled={createBOM.isPending} className="w-full">{createBOM.isPending ? "Creating..." : "Create BOM"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Layers className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total BOMs</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.active}</p><p className="text-xs text-muted-foreground">Active</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Layers className="h-8 w-8 text-muted-foreground" /><div><p className="text-2xl font-bold text-foreground">{stats.draft}</p><p className="text-xs text-muted-foreground">Drafts</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Archive className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.archived}</p><p className="text-xs text-muted-foreground">Archived</p></div></div></CardContent></Card>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search BOMs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No BOMs yet. Create your first Bill of Materials." />

        {viewBom && <BOMDetailDialog bom={viewBom} open={!!viewBom} onClose={() => setViewBom(null)} />}

        {/* Edit Draft BOM Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit BOM — {editingBom?.bom_code}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Product Name *</Label><Input value={editForm.product_name} onChange={(e) => setEditForm({ ...editForm, product_name: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label className="text-base font-semibold">Materials</Label><Button variant="outline" size="sm" onClick={addEditLine}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
                {editLines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_80px_80px_80px_32px] gap-2 items-end">
                    <div><Label className="text-xs">Material</Label><Input value={line.material_name} onChange={(e) => updateEditLine(i, "material_name", e.target.value)} /></div>
                    <div><Label className="text-xs">Qty</Label><Input type="number" value={line.quantity} onChange={(e) => updateEditLine(i, "quantity", Number(e.target.value))} /></div>
                    <div><Label className="text-xs">UOM</Label><Input value={line.uom} onChange={(e) => updateEditLine(i, "uom", e.target.value)} /></div>
                    <div><Label className="text-xs">Waste %</Label><Input type="number" value={line.wastage_pct} onChange={(e) => updateEditLine(i, "wastage_pct", Number(e.target.value))} /></div>
                    <div><Label className="text-xs">Est. Cost</Label><Input type="number" value={line.est_cost} onChange={(e) => updateEditLine(i, "est_cost", Number(e.target.value))} placeholder="₹" /></div>
                    <Button variant="ghost" size="icon" onClick={() => removeEditLine(i)} disabled={editLines.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
              <Button onClick={handleSaveEdit} disabled={savingEdit} className="w-full">{savingEdit ? "Saving..." : "Save Changes"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
