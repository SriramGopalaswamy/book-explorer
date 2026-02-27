import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TablePagination } from "@/components/ui/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Users, MoreHorizontal, Pencil, Trash2, Search, Building2, Mail, Phone, ToggleRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";

interface Customer {
  id: string; name: string; email: string | null; phone: string | null;
  address: string | null; city: string | null; country: string | null;
  tax_number: string | null; contact_person: string | null; notes: string | null;
  status: string; created_at: string;
}

const emptyForm = {
  name: "", email: "", phone: "", address: "", city: "", country: "",
  tax_number: "", contact_person: "", notes: "",
};

export default function Customers() {
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (values: typeof emptyForm) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("customers").insert({ ...values, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); toast({ title: "Customer Added" }); setIsDialogOpen(false); setForm(emptyForm); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: typeof emptyForm }) => {
      const { error } = await supabase.from("customers").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); queryClient.invalidateQueries({ queryKey: ["invoices"] }); queryClient.invalidateQueries({ queryKey: ["quotes"] }); queryClient.invalidateQueries({ queryKey: ["credit-notes"] }); toast({ title: "Customer Updated" }); setEditingCustomer(null); setForm(emptyForm); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("customers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); toast({ title: "Customer Removed" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      const { error } = await supabase.from("customers").update({ status: newStatus }).eq("id", id);
      if (error) throw error;
      return newStatus;
    },
    onSuccess: (newStatus) => { queryClient.invalidateQueries({ queryKey: ["customers"] }); toast({ title: `Customer marked as ${newStatus}` }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.email ?? "").toLowerCase().includes(search.toLowerCase()) || (c.city ?? "").toLowerCase().includes(search.toLowerCase()));
  const pagination = usePagination(filtered, 10);

  const openEdit = (c: Customer) => {
    setEditingCustomer(c);
    setForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "", city: c.city ?? "", country: c.country ?? "", tax_number: c.tax_number ?? "", contact_person: c.contact_person ?? "", notes: c.notes ?? "" });
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast({ title: "Validation Error", description: "Customer name is required.", variant: "destructive" });
    if (editingCustomer) updateMutation.mutate({ id: editingCustomer.id, values: form });
    else createMutation.mutate(form);
  };

  const active = customers.filter((c) => c.status === "active").length;
  if (isCheckingRole) return <MainLayout title="Customers"><div className="flex items-center justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div></MainLayout>;
  if (!hasFinanceAccess) return <AccessDenied />;

  const CustomerForm = (
    <div className="grid gap-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Customer Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" /></div>
        <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="billing@acme.com" /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 99999 00000" /></div>
        <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
        <div><Label>Tax / GST Number</Label><Input value={form.tax_number} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} /></div>
        <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
        <div><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
        <div className="col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
      </div>
    </div>
  );

  return (
    <MainLayout title="Customers" subtitle="Manage registered customers for invoicing and quotes">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Customers" value={String(customers.length)} icon={<Users className="h-4 w-4" />} />
          <StatCard title="Active" value={String(active)} icon={<Building2 className="h-4 w-4" />} />
          <StatCard title="Inactive" value={String(customers.length - active)} icon={<Users className="h-4 w-4" />} />
          <StatCard title="Countries" value={String(new Set(customers.map((c) => c.country).filter(Boolean)).size)} icon={<Building2 className="h-4 w-4" />} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) { setForm(emptyForm); setEditingCustomer(null); } }}>
            <DialogTrigger asChild><Button onClick={() => setEditingCustomer(null)}><Plus className="h-4 w-4 mr-2" />Add Customer</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
              {CustomerForm}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending}>Add Customer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={!!editingCustomer} onOpenChange={(o) => { if (!o) { setEditingCustomer(null); setForm(emptyForm); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>
            {CustomerForm}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingCustomer(null)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={updateMutation.isPending}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead><TableHead>Contact</TableHead>
                <TableHead>Location</TableHead><TableHead>Tax Number</TableHead>
                <TableHead>Status</TableHead><TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
              ) : pagination.paginatedItems.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">{search ? "No customers match your search." : "No customers yet. Add your first customer."}</TableCell></TableRow>
              ) : pagination.paginatedItems.map((c) => (
                <TableRow key={c.id}>
                  <TableCell><div className="font-medium">{c.name}</div>{c.contact_person && <div className="text-xs text-muted-foreground">{c.contact_person}</div>}</TableCell>
                  <TableCell><div className="flex flex-col gap-0.5">{c.email && <div className="flex items-center gap-1 text-sm"><Mail className="h-3 w-3 text-muted-foreground" />{c.email}</div>}{c.phone && <div className="flex items-center gap-1 text-sm"><Phone className="h-3 w-3 text-muted-foreground" />{c.phone}</div>}</div></TableCell>
                  <TableCell className="text-sm">{[c.city, c.country].filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell className="text-sm font-mono">{c.tax_number || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={c.status === "active" ? "bg-success/20 text-success border-success/30" : ""}>{c.status}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(c)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleStatusMutation.mutate({ id: c.id, currentStatus: c.status })}><ToggleRight className="h-4 w-4 mr-2" />{c.status === "active" ? "Mark Inactive" : "Mark Active"}</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(c.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="p-4">
            <TablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
