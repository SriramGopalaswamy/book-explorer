import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { useItems, useCreateItem, useUpdateItem, useDeleteItem } from "@/hooks/useInventory";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Search, Trash2, Archive, ShoppingCart, Boxes, MoreHorizontal, Pencil, Power, PowerOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

const ITEM_TYPES = [
  { value: "product", label: "Product" },
  { value: "service", label: "Service" },
  { value: "raw_material", label: "Raw Material" },
  { value: "finished_good", label: "Finished Good" },
  { value: "consumable", label: "Consumable" },
];

const emptyForm = {
  name: "", sku: "", category: "general", item_type: "product",
  purchase_price: "", selling_price: "", hsn_code: "", reorder_level: "",
  opening_stock: "", current_stock: "", description: "", barcode: "",
};

export default function Items() {
  const { data: items, isLoading } = useItems();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ ...emptyForm });

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ ...emptyForm });

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deactivateConfirmId, setDeactivateConfirmId] = useState<string | null>(null);

  const filtered = (items || []).filter((i: any) => {
    const matchSearch = i.name?.toLowerCase().includes(search.toLowerCase()) ||
      i.sku?.toLowerCase().includes(search.toLowerCase()) ||
      String(i.current_stock ?? "").includes(search);
    const matchStock = stockFilter === "all" ||
      (stockFilter === "out_of_stock" && Number(i.current_stock) === 0) ||
      (stockFilter === "low_stock" && Number(i.current_stock) > 0 && Number(i.current_stock) <= Number(i.reorder_level) && Number(i.reorder_level) > 0) ||
      (stockFilter === "in_stock" && Number(i.current_stock) > Number(i.reorder_level));
    const matchStatus = statusFilter === "all" ||
      (statusFilter === "active" && i.is_active !== false) ||
      (statusFilter === "inactive" && i.is_active === false);
    return matchSearch && matchStock && matchStatus;
  });
  const pagination = usePagination(filtered, 10);

  const totalItems = items?.length || 0;
  const lowStock = (items || []).filter((i: any) => Number(i.current_stock) <= Number(i.reorder_level) && Number(i.reorder_level) > 0).length;
  const totalValue = (items || []).filter((i: any) => i.is_active !== false).reduce((s: number, i: any) => s + (Number(i.current_stock || 0) * Number(i.purchase_price || 0)), 0);

  const handleCreate = () => {
    createItem.mutate({
      name: form.name,
      sku: form.sku,
      category: form.category,
      item_type: form.item_type,
      purchase_price: Number(form.purchase_price) || 0,
      selling_price: Number(form.selling_price) || 0,
      hsn_code: form.hsn_code || null,
      reorder_level: Number(form.reorder_level) || 0,
      opening_stock: Number(form.opening_stock) || 0,
      current_stock: Number(form.opening_stock) || 0,
      description: form.description || null,
      barcode: form.barcode || null,
    }, {
      onSuccess: () => {
        setOpen(false);
        setForm({ ...emptyForm });
      },
    });
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setEditForm({
      name: item.name || "",
      sku: item.sku || "",
      category: item.category || "general",
      item_type: item.item_type || "product",
      purchase_price: String(item.purchase_price ?? ""),
      selling_price: String(item.selling_price ?? ""),
      hsn_code: item.hsn_code || "",
      reorder_level: String(item.reorder_level ?? ""),
      opening_stock: String(item.opening_stock ?? ""),
      current_stock: String(item.current_stock ?? ""),
      description: item.description || "",
      barcode: item.barcode || "",
    });
    setEditOpen(true);
  };

  const handleEdit = () => {
    if (!editItem) return;
    updateItem.mutate({
      id: editItem.id,
      name: editForm.name,
      sku: editForm.sku,
      category: editForm.category,
      item_type: editForm.item_type,
      purchase_price: Number(editForm.purchase_price) || 0,
      selling_price: Number(editForm.selling_price) || 0,
      hsn_code: editForm.hsn_code || null,
      reorder_level: Number(editForm.reorder_level) || 0,
      opening_stock: Number(editForm.opening_stock) || 0,
      current_stock: Number(editForm.current_stock) || 0,
      description: editForm.description || null,
      barcode: editForm.barcode || null,
    }, {
      onSuccess: () => {
        setEditOpen(false);
        setEditItem(null);
      },
    });
  };

  const typeBadgeColor = (t: string) => {
    const map: Record<string, string> = {
      product: "default", service: "secondary", raw_material: "outline",
      finished_good: "default", consumable: "secondary",
    };
    return (map[t] || "default") as any;
  };

  return (
    <MainLayout title="Items" subtitle="Manage your item master — products, raw materials, and services">
      <div className="space-y-6 animate-fade-in">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10"><Package className="h-6 w-6 text-primary" /></div>
            <div><p className="text-sm text-muted-foreground">Total Items</p><p className="text-2xl font-bold text-foreground">{totalItems}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-destructive/10"><Archive className="h-6 w-6 text-destructive" /></div>
            <div><p className="text-sm text-muted-foreground">Low Stock</p><p className="text-2xl font-bold text-foreground">{lowStock}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-accent/20"><Boxes className="h-6 w-6 text-accent-foreground" /></div>
            <div><p className="text-sm text-muted-foreground">Stock Value</p><p className="text-2xl font-bold text-foreground">₹{totalValue.toLocaleString("en-IN")}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-secondary/50"><ShoppingCart className="h-6 w-6 text-secondary-foreground" /></div>
            <div><p className="text-sm text-muted-foreground">Active</p><p className="text-2xl font-bold text-foreground">{(items || []).filter((i: any) => i.is_active).length}</p></div>
          </CardContent></Card>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, SKU or stock qty..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Stock" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                <SelectItem value="low_stock">Low Stock</SelectItem>
                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                <SelectItem value="in_stock">In Stock</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Item</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New Item</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div><Label>SKU *</Label><Input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Type</Label>
                    <Select value={form.item_type} onValueChange={v => setForm(f => ({ ...f, item_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ITEM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Category</Label><Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Purchase Price</Label><Input type="number" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} /></div>
                  <div><Label>Selling Price</Label><Input type="number" value={form.selling_price} onChange={e => setForm(f => ({ ...f, selling_price: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>HSN Code</Label><Input value={form.hsn_code} onChange={e => setForm(f => ({ ...f, hsn_code: e.target.value }))} /></div>
                  <div><Label>Barcode</Label><Input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Reorder Level</Label><Input type="number" value={form.reorder_level} onChange={e => setForm(f => ({ ...f, reorder_level: e.target.value }))} /></div>
                  <div><Label>Opening Stock</Label><Input type="number" value={form.opening_stock} onChange={e => setForm(f => ({ ...f, opening_stock: e.target.value }))} /></div>
                </div>
                <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                <Button onClick={handleCreate} disabled={!form.name || !form.sku || createItem.isPending}>
                  {createItem.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {createItem.isPending ? "Creating..." : "Create Item"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Purchase ₹</TableHead>
                    <TableHead className="text-right">Selling ₹</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-16">{search ? <span className="text-muted-foreground">No items match your search.</span> : <div className="flex flex-col items-center gap-3"><Package className="h-10 w-10 text-muted-foreground/50" /><div><p className="font-medium text-muted-foreground">No items yet</p><p className="text-sm text-muted-foreground/70 mt-1">Add your first item to start managing your inventory</p></div><Button variant="outline" size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Item</Button></div>}</TableCell></TableRow>
                  ) : pagination.paginatedItems.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{item.sku}</TableCell>
                      <TableCell><Badge variant={typeBadgeColor(item.item_type)}>{item.item_type?.replace("_", " ")}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{item.category}</TableCell>
                      <TableCell className="text-right text-foreground">₹{Number(item.purchase_price).toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right text-foreground">₹{Number(item.selling_price).toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right">
                        <span className={Number(item.current_stock) <= Number(item.reorder_level) && Number(item.reorder_level) > 0 ? "text-destructive font-semibold" : "text-foreground"}>
                          {Number(item.current_stock)}
                        </span>
                      </TableCell>
                      <TableCell><Badge variant={item.is_active ? "default" : "secondary"}>{item.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(item)}>
                              <Pencil className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateItem.mutate({ id: item.id, is_active: !item.is_active })}>
                              {item.is_active
                                ? <><PowerOff className="h-4 w-4 mr-2" /> Mark as Inactive</>
                                : <><Power className="h-4 w-4 mr-2" /> Mark as Active</>}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteConfirmId(item.id)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Item</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Name *</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>SKU *</Label><Input value={editForm.sku} onChange={e => setEditForm(f => ({ ...f, sku: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Type</Label>
                <Select value={editForm.item_type} onValueChange={v => setEditForm(f => ({ ...f, item_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ITEM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Category</Label><Input value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Purchase Price</Label><Input type="number" value={editForm.purchase_price} onChange={e => setEditForm(f => ({ ...f, purchase_price: e.target.value }))} /></div>
              <div><Label>Selling Price</Label><Input type="number" value={editForm.selling_price} onChange={e => setEditForm(f => ({ ...f, selling_price: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>HSN Code</Label><Input value={editForm.hsn_code} onChange={e => setEditForm(f => ({ ...f, hsn_code: e.target.value }))} /></div>
              <div><Label>Barcode</Label><Input value={editForm.barcode} onChange={e => setEditForm(f => ({ ...f, barcode: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Reorder Level</Label><Input type="number" value={editForm.reorder_level} onChange={e => setEditForm(f => ({ ...f, reorder_level: e.target.value }))} /></div>
              <div><Label>Current Stock</Label><Input type="number" value={editForm.current_stock} onChange={e => setEditForm(f => ({ ...f, current_stock: e.target.value }))} /></div>
            </div>
            <div><Label>Description</Label><Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
            <Button onClick={handleEdit} disabled={!editForm.name || !editForm.sku || updateItem.isPending}>
              {updateItem.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {updateItem.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deactivate Instead Dialog (shown when item has stock movements) */}
      <AlertDialog open={!!deactivateConfirmId} onOpenChange={(open) => { if (!open) setDeactivateConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              The delete was blocked because this item has existing stock movements. Deleting it would create data inconsistencies. You can deactivate it instead to hide it from active use.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deactivateConfirmId) {
                  updateItem.mutate({ id: deactivateConfirmId, is_active: false });
                  setDeactivateConfirmId(null);
                }
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Items with existing stock movements cannot be deleted — deactivate them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirmId) {
                  const idToDelete = deleteConfirmId;
                  setDeleteConfirmId(null);
                  deleteItem.mutate(idToDelete, {
                    onError: (e: any) => {
                      if (e.message.includes("existing stock movements")) {
                        setDeactivateConfirmId(idToDelete);
                      } else {
                        toast.error(e.message);
                      }
                    },
                  });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
