import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useWarehouses, useCreateWarehouse, useDeleteWarehouse } from "@/hooks/useInventory";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Warehouse, Search, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Chandigarh", "Delhi", "Jammu & Kashmir", "Ladakh",
  "Puducherry", "Andaman & Nicobar", "Dadra & Nagar Haveli", "Daman & Diu",
  "Goa", "Lakshadweep",
].sort();

export default function Warehouses() {
  const { data: warehouses, isLoading } = useWarehouses();
  const createWH = useCreateWarehouse();
  const deleteWH = useDeleteWarehouse();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "", code: "", address: "", city: "", state: "", pincode: "",
    contact_person: "", contact_phone: "", contact_email: "",
  });

  const filtered = (warehouses || []).filter((w: any) =>
    w.name?.toLowerCase().includes(search.toLowerCase()) ||
    w.code?.toLowerCase().includes(search.toLowerCase())
  );

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
            <div className="p-3 rounded-xl bg-secondary/50"><Warehouse className="h-6 w-6 text-secondary-foreground" /></div>
            <div><p className="text-sm text-muted-foreground">Default</p><p className="text-2xl font-bold text-foreground">{(warehouses || []).filter((w: any) => w.is_default).length}</p></div>
          </CardContent></Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search warehouses..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
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
                  <div><Label>City</Label><Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
                  <div><Label>State</Label>
                    <Select value={form.state} onValueChange={v => setForm(f => ({ ...f, state: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                      <SelectContent>
                        {INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Pincode</Label><Input value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, "") }))} maxLength={6} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} /></div>
                  <div><Label>Contact Phone</Label><Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} /></div>
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
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No warehouses found.</TableCell></TableRow>
                  ) : filtered.map((wh: any) => (
                    <TableRow key={wh.id}>
                      <TableCell className="font-medium text-foreground">{wh.name}{wh.is_default && <Badge variant="outline" className="ml-2">Default</Badge>}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{wh.code}</TableCell>
                      <TableCell className="text-muted-foreground">{wh.city || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{wh.state || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{wh.contact_person || "—"}</TableCell>
                      <TableCell><Badge variant={wh.is_active ? "default" : "secondary"}>{wh.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => deleteWH.mutate(wh.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
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
