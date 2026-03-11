import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DataTable, Column } from "@/components/ui/data-table";
import { Plus, Layers, CheckCircle, Archive, Search, Trash2 } from "lucide-react";
import { useBOMs, useCreateBOM, BOM } from "@/hooks/useManufacturing";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-green-500/20 text-green-400",
  archived: "bg-yellow-500/20 text-yellow-400",
};

export default function BillOfMaterials() {
  const { data: boms = [], isLoading } = useBOMs();
  const createBOM = useCreateBOM();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ product_name: "", notes: "" });
  const [lines, setLines] = useState([{ material_name: "", quantity: 1, uom: "pcs", wastage_pct: 0 }]);

  const filtered = boms.filter((b) =>
    b.bom_code.toLowerCase().includes(search.toLowerCase()) ||
    b.product_name.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: boms.length,
    active: boms.filter((b) => b.status === "active").length,
    draft: boms.filter((b) => b.status === "draft").length,
    archived: boms.filter((b) => b.status === "archived").length,
  };

  const addLine = () => setLines([...lines, { material_name: "", quantity: 1, uom: "pcs", wastage_pct: 0 }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: any) => {
    const updated = [...lines];
    (updated[i] as any)[field] = value;
    setLines(updated);
  };

  const handleCreate = () => {
    if (!form.product_name || lines.some((l) => !l.material_name)) return;
    createBOM.mutate({ ...form, lines }, {
      onSuccess: () => {
        setDialogOpen(false);
        setForm({ product_name: "", notes: "" });
        setLines([{ material_name: "", quantity: 1, uom: "pcs", wastage_pct: 0 }]);
      },
    });
  };

  const columns: Column<BOM>[] = [
    { key: "bom_code", header: "BOM Code", render: (r) => <span className="font-mono font-semibold text-foreground">{r.bom_code}</span> },
    { key: "product_name", header: "Product" },
    { key: "version", header: "Version", render: (r) => <span className="text-muted-foreground">v{r.version}</span> },
    { key: "status", header: "Status", render: (r) => <Badge className={statusColors[r.status] || ""}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Badge> },
    { key: "created_at", header: "Created", render: (r) => format(new Date(r.created_at), "dd MMM yyyy") },
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
                    <div key={i} className="grid grid-cols-[1fr_80px_80px_80px_32px] gap-2 items-end">
                      <div><Label className="text-xs">Material</Label><Input value={line.material_name} onChange={(e) => updateLine(i, "material_name", e.target.value)} /></div>
                      <div><Label className="text-xs">Qty</Label><Input type="number" value={line.quantity} onChange={(e) => updateLine(i, "quantity", Number(e.target.value))} /></div>
                      <div><Label className="text-xs">UOM</Label><Input value={line.uom} onChange={(e) => updateLine(i, "uom", e.target.value)} /></div>
                      <div><Label className="text-xs">Waste %</Label><Input type="number" value={line.wastage_pct} onChange={(e) => updateLine(i, "wastage_pct", Number(e.target.value))} /></div>
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

        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search BOMs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>

        <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No BOMs yet. Create your first Bill of Materials." />
      </div>
    </MainLayout>
  );
}
