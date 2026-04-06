import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useWarehouses, useCreateWarehouse, useUpdateWarehouse, useDeleteWarehouse } from "@/hooks/useInventory";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Warehouse, Search, Trash2, MoreHorizontal, Edit, Eye, ToggleLeft, ToggleRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman & Nicobar", "Chandigarh", "Dadra & Nagar Haveli",
  "Delhi", "Jammu & Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

export default function Warehouses() {
  const { data: warehouses, isLoading } = useWarehouses();
  const createWH = useCreateWarehouse();
  const updateWH = useUpdateWarehouse();
  const deleteWH = useDeleteWarehouse();
  const [editOpen, setEditOpen] = useState(false);
  const [editWH, setEditWH] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", city: "", state: "", contact_person: "", contact_phone: "", is_active: true });
  const [open, setOpen] = useState(false);
  const [deleteWHId, setDeleteWHId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({
    name: "", code: "", address: "", city: "", state: "", pincode: "",
    contact_person: "", contact_phone: "", contact_email: "",
  });

  const filtered = (warehouses || []).filter((w: any) => {
    const matchSearch = w.name?.toLowerCase().includes(search.toLowerCase()) ||
      w.code?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" ||
      (statusFilter === "active" && w.is_active) ||
      (statusFilter === "inactive" && !w.is_active);
    return matchSearch && matchStatus;
  });
  const pagination = usePagination(filtered, 10);

  const handleCreate = () => {
    createWH.mutate({
      name: form.name, code: form.code, address: form.address || null,
      city: form.city || null, state: form.state || null, pincode: form.pincode || null,
      contact_person: form.contact_person || null, contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null,
    }, {
      onSuccess: () => {
        setOpen(false);
        setForm({ name: "", code: "", address: "", city: "", state: "", pincode: "", contact_person: "", contact_phone: "", contact_email: "" });
      },
    });
  };

  return (
    <MainLayout title="Warehouses" subtitle="Manage warehouse locations and storage facilities">
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10"><Warehouse className="h-6 w-6 text-primary" /></div>
            <div><p className="text-sm text-muted-foreground">Total Warehouses</p><p className="text-2xl font-bold text-foreground">{warehouses?.length || 0}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-accent/20"><Warehouse className="h-6 w-6 text-accent-foreground" /></div>
            <div><p className="text-sm text-muted-foreground">Active</p><p className="text-2xl font-bold text-foreground">{(warehouses || []).filter((w: any) => w.is_active).length}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-destructive/10"><Warehouse className="h-6 w-6 text-destructive" /></div>
            <div><p className="text-sm text-muted-foreground">Inactive</p><p className="text-2xl font-bold text-foreground">{(warehouses || []).filter((w: any) => !w.is_active).length}</p></div>
          </CardContent></Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search warehouses..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Warehouse</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New Warehouse</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div><Label>Code *</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
                </div>
                <div><Label>Address</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
                <div className="grid grid-cols-3 gap-4">
                  <div><Label>Pincode</Label><Input value={form.pincode} onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setForm(f => ({ ...f, pincode: v })); }} placeholder="e.g. 400001" /></div>
                  <div><Label>State</Label>
                    <Select value={form.state} onValueChange={v => setForm(f => ({ ...f, state: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                      <SelectContent>
                        {INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>City</Label><Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} /></div>
                  <div><Label>Contact Phone</Label><Input value={form.contact_phone} onChange={e => { const v = e.target.value.replace(/[^0-9+\-\s]/g, "").slice(0, 15); setForm(f => ({ ...f, contact_phone: v })); }} placeholder="e.g. +91 98765 43210" maxLength={15} /></div>
                </div>
                <Button onClick={handleCreate} disabled={!form.name || !form.code || createWH.isPending}>
                  {createWH.isPending ? "Creating..." : "Create Warehouse"}
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
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No warehouses found.</TableCell></TableRow>
                  ) : pagination.paginatedItems.map((wh: any) => (
                    <TableRow key={wh.id}>
                      <TableCell className="font-medium text-foreground">{wh.name}{wh.is_default && <Badge variant="outline" className="ml-2">Default</Badge>}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{wh.code}</TableCell>
                      <TableCell className="text-muted-foreground">{wh.city || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{wh.state || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{wh.contact_person || "—"}</TableCell>
                      <TableCell><Badge variant={wh.is_active ? "default" : "secondary"}>{wh.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setEditWH(wh);
                              setEditForm({ name: wh.name || "", code: wh.code || "", city: wh.city || "", state: wh.state || "", contact_person: wh.contact_person || "", contact_phone: wh.contact_phone || "", is_active: wh.is_active ?? true });
                              setEditOpen(true);
                            }}>
                              <Edit className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateWH.mutate({ id: wh.id, is_active: !wh.is_active })}>
                              {wh.is_active ? <ToggleLeft className="h-4 w-4 mr-2" /> : <ToggleRight className="h-4 w-4 mr-2" />}
                              {wh.is_active ? "Mark Inactive" : "Mark Active"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteWHId(wh.id)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!isLoading && filtered.length > 0 && (
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
          </CardContent>
        </Card>

        {/* Edit Warehouse Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Warehouse</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Name *</Label><Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
                <div><Label>Code</Label><Input value={editForm.code} onChange={e => setEditForm({ ...editForm, code: e.target.value })} /></div>
                <div><Label>City</Label><Input value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} /></div>
                <div>
                  <Label>State</Label>
                  <Select value={editForm.state} onValueChange={v => setEditForm({ ...editForm, state: v })}>
                    <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent>{INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Contact Person</Label><Input value={editForm.contact_person} onChange={e => setEditForm({ ...editForm, contact_person: e.target.value })} /></div>
                <div><Label>Contact Phone</Label><Input value={editForm.contact_phone} onChange={e => { const v = e.target.value.replace(/[^0-9+\-\s]/g, "").slice(0, 15); setEditForm({ ...editForm, contact_phone: v }); }} placeholder="e.g. +91 98765 43210" maxLength={15} /></div>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="whActive" checked={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} />
                <Label htmlFor="whActive">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={() => {
                if (!editWH) return;
                updateWH.mutate({ id: editWH.id, ...editForm }, { onSuccess: () => { setEditOpen(false); setEditWH(null); } });
              }} disabled={updateWH.isPending}>
                {updateWH.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Warehouse Confirmation */}
        <AlertDialog open={!!deleteWHId} onOpenChange={(open) => { if (!open) setDeleteWHId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Warehouse?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the warehouse. Warehouses with existing stock entries cannot be deleted — transfer all stock out first before deleting.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteWHId) {
                    deleteWH.mutate(deleteWHId);
                    setDeleteWHId(null);
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}
