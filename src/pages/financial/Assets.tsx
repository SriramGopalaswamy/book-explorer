import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { AnimatedPage } from "@/components/layout/AnimatedPage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable, Column } from "@/components/ui/data-table";
import { TablePagination } from "@/components/ui/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Search,
  Package,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  TrendingDown,
  Tag,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import {
  useAssets,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset,
  useRunDepreciation,
  useAssetDepreciation,
  Asset,
  ASSET_CATEGORIES,
  DEPRECIATION_METHODS,
  ASSET_STATUSES,
  ASSET_CONDITIONS,
} from "@/hooks/useAssets";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  under_maintenance: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  disposed: "bg-red-500/10 text-red-400 border-red-500/30",
  written_off: "bg-red-500/10 text-red-400 border-red-500/30",
  transferred: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

const conditionColors: Record<string, string> = {
  excellent: "text-emerald-400",
  good: "text-blue-400",
  fair: "text-amber-400",
  poor: "text-red-400",
};

export default function Assets() {
  const { data: assets = [], isLoading } = useAssets();
  const createAsset = useCreateAsset();
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();
  const runDepreciation = useRunDepreciation();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [depScheduleOpen, setDepScheduleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Form state
  const emptyForm = {
    asset_tag: "",
    name: "",
    description: "",
    category: "Equipment",
    sub_category: "",
    serial_number: "",
    model_number: "",
    manufacturer: "",
    barcode: "",
    purchase_date: new Date().toISOString().split("T")[0],
    purchase_price: 0,
    vendor_id: null as string | null,
    bill_id: null as string | null,
    po_number: "",
    location: "",
    department: "",
    custodian: "",
    useful_life_months: 60,
    salvage_value: 0,
    depreciation_method: "straight_line",
    status: "active",
    condition: "good",
    warranty_expiry: "",
    warranty_provider: "",
    insurance_policy: "",
    insurance_expiry: "",
    notes: "",
  };
  const [form, setForm] = useState(emptyForm);

  // Dispose form
  const [disposeForm, setDisposeForm] = useState({
    disposal_date: new Date().toISOString().split("T")[0],
    disposal_price: 0,
    disposal_method: "sale",
    disposal_notes: "",
  });

  // Filter + search
  const filtered = useMemo(() => {
    return assets.filter((a) => {
      const matchSearch =
        !searchQuery ||
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.asset_tag.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.serial_number || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.location || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === "all" || a.status === statusFilter;
      const matchCategory = categoryFilter === "all" || a.category === categoryFilter;
      return matchSearch && matchStatus && matchCategory;
    });
  }, [assets, searchQuery, statusFilter, categoryFilter]);

  const pagination = usePagination(filtered, 15);

  // Stats
  const totalAssets = assets.length;
  const activeAssets = assets.filter((a) => a.status === "active").length;
  const totalValue = assets.reduce((s, a) => s + Number(a.current_book_value), 0);
  const totalDepreciation = assets.reduce((s, a) => s + Number(a.accumulated_depreciation), 0);

  const openCreate = () => {
    setEditMode(false);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (asset: Asset) => {
    setEditMode(true);
    setSelectedAsset(asset);
    setForm({
      asset_tag: asset.asset_tag,
      name: asset.name,
      description: asset.description || "",
      category: asset.category,
      sub_category: asset.sub_category || "",
      serial_number: asset.serial_number || "",
      model_number: asset.model_number || "",
      manufacturer: asset.manufacturer || "",
      barcode: asset.barcode || "",
      purchase_date: asset.purchase_date,
      purchase_price: Number(asset.purchase_price),
      vendor_id: asset.vendor_id,
      bill_id: asset.bill_id,
      po_number: asset.po_number || "",
      location: asset.location || "",
      department: asset.department || "",
      custodian: asset.custodian || "",
      useful_life_months: asset.useful_life_months,
      salvage_value: Number(asset.salvage_value),
      depreciation_method: asset.depreciation_method,
      status: asset.status,
      condition: asset.condition,
      warranty_expiry: asset.warranty_expiry || "",
      warranty_provider: asset.warranty_provider || "",
      insurance_policy: asset.insurance_policy || "",
      insurance_expiry: asset.insurance_expiry || "",
      notes: asset.notes || "",
    });
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!form.asset_tag || !form.name) return;
    if (editMode && selectedAsset) {
      updateAsset.mutate({ id: selectedAsset.id, ...form } as any, {
        onSuccess: () => setFormOpen(false),
      });
    } else {
      createAsset.mutate(form as any, {
        onSuccess: () => setFormOpen(false),
      });
    }
  };

  const handleDelete = () => {
    if (!selectedAsset) return;
    deleteAsset.mutate(selectedAsset.id, {
      onSuccess: () => { setDeleteOpen(false); setSelectedAsset(null); },
    });
  };

  const handleDispose = () => {
    if (!selectedAsset) return;
    updateAsset.mutate(
      {
        id: selectedAsset.id,
        status: "disposed",
        disposal_date: disposeForm.disposal_date,
        disposal_price: disposeForm.disposal_price,
        disposal_method: disposeForm.disposal_method,
        disposal_notes: disposeForm.disposal_notes,
      } as any,
      {
        onSuccess: () => { setDisposeOpen(false); setSelectedAsset(null); },
      }
    );
  };

  const handleTag = () => {
    if (!selectedAsset) return;
    updateAsset.mutate(
      {
        id: selectedAsset.id,
        last_tagged_date: new Date().toISOString().split("T")[0],
        tag_verified: true,
      } as any,
      {
        onSuccess: () => { setTagOpen(false); setSelectedAsset(null); },
      }
    );
  };

  const columns: Column<Asset>[] = [
    {
      key: "asset_tag",
      header: "Tag / ID",
      render: (a) => (
        <span className="font-mono text-xs font-semibold text-primary">{a.asset_tag}</span>
      ),
      className: "w-[100px]",
    },
    {
      key: "name",
      header: "Asset Name",
      render: (a) => (
        <div>
          <div className="font-medium">{a.name}</div>
          {a.serial_number && (
            <div className="text-xs text-muted-foreground">S/N: {a.serial_number}</div>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (a) => <span className="text-sm">{a.category}</span>,
    },
    {
      key: "purchase_price",
      header: "Cost",
      render: (a) => <span className="font-medium">{formatCurrency(Number(a.purchase_price))}</span>,
      className: "text-right",
      headerClassName: "text-right",
    },
    {
      key: "current_book_value",
      header: "Book Value",
      render: (a) => (
        <span className="font-medium">{formatCurrency(Number(a.current_book_value))}</span>
      ),
      className: "text-right",
      headerClassName: "text-right",
    },
    {
      key: "status",
      header: "Status",
      render: (a) => (
        <Badge variant="outline" className={statusColors[a.status] || ""}>
          {a.status.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "condition",
      header: "Condition",
      render: (a) => (
        <span className={`text-sm capitalize ${conditionColors[a.condition] || ""}`}>
          {a.condition}
        </span>
      ),
    },
    {
      key: "location",
      header: "Location",
      render: (a) => <span className="text-sm text-muted-foreground">{a.location || "—"}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (a) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setSelectedAsset(a); setViewOpen(true); }}>
              <Eye className="h-4 w-4 mr-2" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openEdit(a)}>
              <Edit className="h-4 w-4 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setSelectedAsset(a); setDepScheduleOpen(true); }}>
              <TrendingDown className="h-4 w-4 mr-2" /> Depreciation Schedule
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              if (a.status !== "active") return;
              runDepreciation.mutate(a.id);
            }} disabled={a.status !== "active"}>
              <DollarSign className="h-4 w-4 mr-2" /> Run Depreciation
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setSelectedAsset(a); setTagOpen(true); }}>
              <Tag className="h-4 w-4 mr-2" /> Mark Tagged
            </DropdownMenuItem>
            {a.status === "active" && (
              <DropdownMenuItem onClick={() => {
                setSelectedAsset(a);
                setDisposeForm({ disposal_date: new Date().toISOString().split("T")[0], disposal_price: 0, disposal_method: "sale", disposal_notes: "" });
                setDisposeOpen(true);
              }}>
                <AlertTriangle className="h-4 w-4 mr-2" /> Dispose
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedAsset(a); setDeleteOpen(true); }}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: "w-[60px]",
    },
  ];

  return (
    <MainLayout title="Fixed Assets">
      <AnimatedPage>
        <div className="space-y-6 p-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Fixed Assets</h1>
              <p className="text-sm text-muted-foreground">
                Manage capital assets, depreciation, and tagging
              </p>
            </div>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Register Asset
            </Button>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10"><Package className="h-5 w-5 text-primary" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Assets</p>
                    <p className="text-xl font-bold text-foreground">{totalAssets}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10"><CheckCircle className="h-5 w-5 text-emerald-400" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="text-xl font-bold text-foreground">{activeAssets}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10"><DollarSign className="h-5 w-5 text-blue-400" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Book Value</p>
                    <p className="text-xl font-bold text-foreground">{formatCurrency(totalValue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10"><TrendingDown className="h-5 w-5 text-amber-400" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Depreciation</p>
                    <p className="text-xl font-bold text-foreground">{formatCurrency(totalDepreciation)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, tag, serial, location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {ASSET_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {ASSET_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <DataTable columns={columns} data={pagination.paginatedItems} isLoading={isLoading} emptyMessage="No assets registered yet" />
          {pagination.totalPages > 1 && (
            <TablePagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              from={pagination.from}
              to={pagination.to}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          )}
        </div>

        {/* ======= CREATE / EDIT DIALOG ======= */}
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editMode ? "Edit Asset" : "Register New Asset"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              {/* Identification */}
              <div className="md:col-span-2"><h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Identification</h3><Separator className="mt-1" /></div>
              <div className="space-y-1.5">
                <Label>Asset Tag *</Label>
                <Input value={form.asset_tag} onChange={(e) => setForm({ ...form, asset_tag: e.target.value })} placeholder="e.g. AST-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dell Latitude 5540" />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sub-Category</Label>
                <Input value={form.sub_category} onChange={(e) => setForm({ ...form, sub_category: e.target.value })} placeholder="e.g. Laptop" />
              </div>
              <div className="space-y-1.5">
                <Label>Serial Number</Label>
                <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Model Number</Label>
                <Input value={form.model_number} onChange={(e) => setForm({ ...form, model_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Manufacturer</Label>
                <Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Barcode</Label>
                <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
              </div>

              {/* Acquisition */}
              <div className="md:col-span-2 mt-2"><h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Acquisition</h3><Separator className="mt-1" /></div>
              <div className="space-y-1.5">
                <Label>Purchase Date *</Label>
                <Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Purchase Price (₹) *</Label>
                <Input type="number" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>PO Number</Label>
                <Input value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_CONDITIONS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Location */}
              <div className="md:col-span-2 mt-2"><h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Location & Assignment</h3><Separator className="mt-1" /></div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. HQ Floor 3" />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Custodian</Label>
                <Input value={form.custodian} onChange={(e) => setForm({ ...form, custodian: e.target.value })} />
              </div>

              {/* Depreciation */}
              <div className="md:col-span-2 mt-2"><h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Depreciation</h3><Separator className="mt-1" /></div>
              <div className="space-y-1.5">
                <Label>Useful Life (months)</Label>
                <Input type="number" value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Salvage Value (₹)</Label>
                <Input type="number" value={form.salvage_value} onChange={(e) => setForm({ ...form, salvage_value: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={form.depreciation_method} onValueChange={(v) => setForm({ ...form, depreciation_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEPRECIATION_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Warranty & Insurance */}
              <div className="md:col-span-2 mt-2"><h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Warranty & Insurance</h3><Separator className="mt-1" /></div>
              <div className="space-y-1.5">
                <Label>Warranty Expiry</Label>
                <Input type="date" value={form.warranty_expiry} onChange={(e) => setForm({ ...form, warranty_expiry: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Warranty Provider</Label>
                <Input value={form.warranty_provider} onChange={(e) => setForm({ ...form, warranty_provider: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Insurance Policy</Label>
                <Input value={form.insurance_policy} onChange={(e) => setForm({ ...form, insurance_policy: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Insurance Expiry</Label>
                <Input type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} />
              </div>

              {/* Notes */}
              <div className="md:col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createAsset.isPending || updateAsset.isPending}>
                {editMode ? "Save Changes" : "Register Asset"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ======= VIEW DETAIL DIALOG ======= */}
        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                {selectedAsset?.name}
              </DialogTitle>
            </DialogHeader>
            {selectedAsset && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <DetailRow label="Asset Tag" value={selectedAsset.asset_tag} />
                  <DetailRow label="Category" value={selectedAsset.category} />
                  <DetailRow label="Serial Number" value={selectedAsset.serial_number} />
                  <DetailRow label="Model" value={selectedAsset.model_number} />
                  <DetailRow label="Manufacturer" value={selectedAsset.manufacturer} />
                  <DetailRow label="Barcode" value={selectedAsset.barcode} />
                  <DetailRow label="Location" value={selectedAsset.location} />
                  <DetailRow label="Department" value={selectedAsset.department} />
                  <DetailRow label="Custodian" value={selectedAsset.custodian} />
                  <DetailRow label="Status" value={selectedAsset.status.replace("_", " ")} />
                  <DetailRow label="Condition" value={selectedAsset.condition} />
                  <DetailRow label="Purchase Date" value={selectedAsset.purchase_date} />
                  <DetailRow label="Purchase Price" value={formatCurrency(Number(selectedAsset.purchase_price))} />
                  <DetailRow label="Salvage Value" value={formatCurrency(Number(selectedAsset.salvage_value))} />
                  <DetailRow label="Useful Life" value={`${selectedAsset.useful_life_months} months`} />
                  <DetailRow label="Method" value={DEPRECIATION_METHODS.find((m) => m.value === selectedAsset.depreciation_method)?.label || selectedAsset.depreciation_method} />
                  <DetailRow label="Accumulated Depreciation" value={formatCurrency(Number(selectedAsset.accumulated_depreciation))} />
                  <DetailRow label="Current Book Value" value={formatCurrency(Number(selectedAsset.current_book_value))} highlight />
                  <DetailRow label="Warranty Expiry" value={selectedAsset.warranty_expiry} />
                  <DetailRow label="Insurance Expiry" value={selectedAsset.insurance_expiry} />
                  <DetailRow label="Last Tagged" value={selectedAsset.last_tagged_date} />
                  <DetailRow label="Tag Verified" value={selectedAsset.tag_verified ? "✓ Yes" : "✗ No"} />
                </div>
                {selectedAsset.notes && (
                  <div>
                    <Label className="text-muted-foreground">Notes</Label>
                    <p className="text-foreground mt-1">{selectedAsset.notes}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ======= DEPRECIATION SCHEDULE ======= */}
        <DepreciationScheduleDialog
          open={depScheduleOpen}
          onOpenChange={setDepScheduleOpen}
          asset={selectedAsset}
        />

        {/* ======= DISPOSE DIALOG ======= */}
        <Dialog open={disposeOpen} onOpenChange={setDisposeOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="h-5 w-5" /> Dispose Asset
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Disposing <strong>{selectedAsset?.name}</strong> will post disposal entries to the general ledger.
              Current book value: <strong>{formatCurrency(Number(selectedAsset?.current_book_value || 0))}</strong>
            </p>
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="space-y-1.5">
                <Label>Disposal Date</Label>
                <Input type="date" value={disposeForm.disposal_date} onChange={(e) => setDisposeForm({ ...disposeForm, disposal_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Sale/Scrap Price (₹)</Label>
                <Input type="number" value={disposeForm.disposal_price} onChange={(e) => setDisposeForm({ ...disposeForm, disposal_price: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={disposeForm.disposal_method} onValueChange={(v) => setDisposeForm({ ...disposeForm, disposal_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">Sale</SelectItem>
                    <SelectItem value="scrap">Scrap</SelectItem>
                    <SelectItem value="donation">Donation</SelectItem>
                    <SelectItem value="write_off">Write Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={disposeForm.disposal_notes} onChange={(e) => setDisposeForm({ ...disposeForm, disposal_notes: e.target.value })} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDisposeOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDispose} disabled={updateAsset.isPending}>
                Confirm Disposal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ======= TAG CONFIRM ======= */}
        <AlertDialog open={tagOpen} onOpenChange={setTagOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Asset Tagging</AlertDialogTitle>
              <AlertDialogDescription>
                Mark <strong>{selectedAsset?.name}</strong> ({selectedAsset?.asset_tag}) as physically tagged and verified today?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleTag}>Confirm Tag</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ======= DELETE CONFIRM ======= */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Asset</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete <strong>{selectedAsset?.name}</strong>? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AnimatedPage>
    </MainLayout>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p className={`font-medium ${highlight ? "text-primary" : "text-foreground"}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function DepreciationScheduleDialog({
  open,
  onOpenChange,
  asset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: Asset | null;
}) {
  const { data: entries = [], isLoading } = useAssetDepreciation(open ? asset?.id || null : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Depreciation Schedule — {asset?.name}
          </DialogTitle>
        </DialogHeader>
        {asset && (
          <div className="grid grid-cols-3 gap-3 text-sm mb-4">
            <div>
              <span className="text-muted-foreground">Purchase Price</span>
              <p className="font-semibold">{formatCurrency(Number(asset.purchase_price))}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Accumulated</span>
              <p className="font-semibold text-amber-400">{formatCurrency(Number(asset.accumulated_depreciation))}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Book Value</span>
              <p className="font-semibold text-primary">{formatCurrency(Number(asset.current_book_value))}</p>
            </div>
          </div>
        )}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No depreciation entries recorded yet. Use "Run Depreciation" to generate entries.</p>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="px-3 py-2 text-left">Period</th>
                  <th className="px-3 py-2 text-right">Depreciation</th>
                  <th className="px-3 py-2 text-right">Accumulated</th>
                  <th className="px-3 py-2 text-right">Book Value</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-3 py-2">{format(new Date(e.period_date), "MMM yyyy")}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(e.depreciation_amount)}</td>
                    <td className="px-3 py-2 text-right text-amber-400">{formatCurrency(e.accumulated_depreciation)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(e.book_value_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
