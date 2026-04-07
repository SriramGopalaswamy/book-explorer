import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CountrySelect } from "@/components/ui/country-select";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/StatCard";
import { TablePagination } from "@/components/ui/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, MoreHorizontal, Pencil, Trash2, Search, Building2, Mail, Phone, Truck, ToggleRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsFinance } from "@/hooks/useRoles";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { getPhoneConfig, getTaxConfig, validatePhone, validateTaxNumber } from "@/lib/country-validation";

interface Vendor {
  id: string; name: string; email: string | null; phone: string | null; address: string | null;
  city: string | null; country: string | null; tax_number: string | null;
  contact_person: string | null; payment_terms: string | null; bank_account: string | null;
  notes: string | null; status: string; created_at: string;
}

const emptyForm = { name: "", email: "", phone: "", address: "", city: "", country: "", tax_number: "", contact_person: "", payment_terms: "30 days", bank_account: "", notes: "" };

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Vendors() {
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<{ email?: string; phone?: string; tax_number?: string }>({});
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Auto-set country code when country changes
  useEffect(() => {
    if (form.country) {
      const config = getPhoneConfig(form.country);
      if (config.code && !form.phone.startsWith(config.code)) {
        setForm((prev) => ({ ...prev, phone: config.code + " " }));
      }
    }
  }, [form.country]);

  // Live validation
  useEffect(() => {
    const newErrors: typeof errors = {};
    if (form.email.trim() && !emailRegex.test(form.email.trim())) {
      newErrors.email = "Enter a valid email address";
    }
    if (form.phone.trim()) {
      const phoneErr = validatePhone(form.phone, form.country);
      if (phoneErr) newErrors.phone = phoneErr;
    }
    if (form.tax_number.trim()) {
      if (!/^[A-Za-z0-9]{15}$/.test(form.tax_number.trim())) {
        newErrors.tax_number = "Must be exactly 15 alphanumeric characters";
      } else {
        const taxErr = validateTaxNumber(form.tax_number, form.country);
        if (taxErr) newErrors.tax_number = taxErr;
      }
    }
    setErrors(newErrors);
  }, [form.email, form.phone, form.tax_number, form.country]);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors", user?.id, orgId],
    queryFn: async () => {
      if (!user || !orgId) return [];
      const { data, error } = await supabase.from("vendors").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Vendor[];
    },
    enabled: !!user && !!orgId,
  });

  const createMutation = useMutation({
    mutationFn: async (values: typeof emptyForm) => {
      if (!user) throw new Error("Not authenticated");
      if (!orgId) throw new Error("Organization not found");
      const { error } = await supabase.from("vendors").insert({ ...values, user_id: user.id, organization_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vendors"] }); queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }); toast({ title: "Vendor Added" }); setIsDialogOpen(false); setForm(emptyForm); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: typeof emptyForm }) => {
      if (!orgId) throw new Error("Organization not found");
      const { error } = await supabase.from("vendors").update(values).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vendors"] }); toast({ title: "Vendor Updated" }); setEditingVendor(null); setForm(emptyForm); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("Organization not found");
      const { data: deleted, error } = await supabase.from("vendors").delete().eq("id", id).eq("organization_id", orgId).select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) throw new Error("Vendor not found or could not be deleted.");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vendors"] }); queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }); toast({ title: "Vendor Removed" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      if (!orgId) throw new Error("Organization not found");
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      const { error } = await supabase.from("vendors").update({ status: newStatus }).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
      return newStatus;
    },
    onSuccess: (newStatus) => { queryClient.invalidateQueries({ queryKey: ["vendors"] }); toast({ title: `Vendor marked as ${newStatus}` }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = vendors.filter((v) => {
    const matchesSearch = v.name.toLowerCase().includes(search.toLowerCase()) || (v.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const pagination = usePagination(filtered, 10);

  const openEdit = (v: Vendor) => {
    setEditingVendor(v);
    setForm({ name: v.name, email: v.email ?? "", phone: v.phone ?? "", address: v.address ?? "", city: v.city ?? "", country: v.country ?? "", tax_number: v.tax_number ?? "", contact_person: v.contact_person ?? "", payment_terms: v.payment_terms ?? "30 days", bank_account: v.bank_account ?? "", notes: v.notes ?? "" });
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast({ title: "Validation Error", description: "Vendor name is required.", variant: "destructive" });
    if (!form.email.trim()) return toast({ title: "Validation Error", description: "Email is required.", variant: "destructive" });
    if (!emailRegex.test(form.email.trim())) return toast({ title: "Invalid Email", description: "Enter a valid email address.", variant: "destructive" });
    if (!form.phone.trim()) return toast({ title: "Validation Error", description: "Phone number is required.", variant: "destructive" });
    const phoneErr = validatePhone(form.phone, form.country);
    if (phoneErr) return toast({ title: "Invalid Phone", description: phoneErr, variant: "destructive" });
    if (!form.tax_number.trim()) return toast({ title: "Validation Error", description: "Tax / GST number is required.", variant: "destructive" });
    if (!/^[A-Za-z0-9]{15}$/.test(form.tax_number.trim())) return toast({ title: "Invalid Tax Number", description: "Must be exactly 15 alphanumeric characters.", variant: "destructive" });
    const taxErr = validateTaxNumber(form.tax_number, form.country);
    if (taxErr) return toast({ title: "Invalid Tax Number", description: taxErr, variant: "destructive" });

    if (editingVendor) updateMutation.mutate({ id: editingVendor.id, values: form });
    else createMutation.mutate(form);
  };

  if (isCheckingRole) return <MainLayout title="Vendors"><div className="flex items-center justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div></MainLayout>;
  if (!hasFinanceAccess) return <AccessDenied />;

  const phoneConfig = getPhoneConfig(form.country);
  const taxConfig = getTaxConfig(form.country);

  const VendorForm = (
    <div className="grid gap-3 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Vendor Name <span className="text-destructive">*</span></Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Supplier Pvt Ltd" /></div>
        <div>
          <Label>Email <span className="text-destructive">*</span></Label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="vendor@company.com" />
          {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
        </div>
        <div>
          <Label>Phone <span className="text-destructive">*</span> {phoneConfig.code && <span className="text-xs text-muted-foreground ml-1">({phoneConfig.code})</span>}</Label>
          <Input
            value={form.phone}
            onChange={(e) => {
              const val = e.target.value;
              const codePrefix = phoneConfig.code ? phoneConfig.code + " " : "";
              if (codePrefix && !val.startsWith(phoneConfig.code)) {
                return;
              }
              const afterCode = val.slice(codePrefix.length);
              const digitsOnly = afterCode.replace(/\D/g, "");
              const capped = digitsOnly.slice(0, phoneConfig.digits);
              setForm({ ...form, phone: codePrefix + capped });
            }}
            placeholder={phoneConfig.code ? `${phoneConfig.code} ${"9".repeat(phoneConfig.digits)}` : "+XX XXXXXXXXXX"}
            maxLength={(phoneConfig.code?.length || 0) + 1 + phoneConfig.digits}
          />
          {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
          {form.phone.trim() && !errors.phone && <p className="text-xs text-muted-foreground mt-1">Exactly {phoneConfig.digits} digits required</p>}
        </div>
        <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
        <div>
          <Label>{taxConfig ? taxConfig.label : "Tax / GST Number"} <span className="text-destructive">*</span></Label>
          <Input
            value={form.tax_number}
            onChange={(e) => setForm({ ...form, tax_number: e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 15) })}
            placeholder={taxConfig?.placeholder || "Tax ID"}
            maxLength={15}
          />
          {errors.tax_number && <p className="text-xs text-destructive mt-1">{errors.tax_number}</p>}
        </div>
        <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
        <div><Label>Country</Label><CountrySelect value={form.country} onChange={(val) => setForm({ ...form, country: val })} /></div>
        <div><Label>Payment Terms</Label><Input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="30 days" /></div>
        <div><Label>Bank Account</Label><Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} /></div>
        <div className="col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
      </div>
    </div>
  );

  return (
    <MainLayout title="Vendors" subtitle="Manage vendor and agency master data for bills and expenses">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Vendors" value={String(vendors.length)} icon={<Truck className="h-4 w-4" />} />
          <StatCard title="Active" value={String(vendors.filter((v) => v.status === "active").length)} icon={<Building2 className="h-4 w-4" />} />
          <StatCard title="Inactive" value={String(vendors.filter((v) => v.status !== "active").length)} icon={<Building2 className="h-4 w-4" />} />
          <StatCard title="Countries" value={String(new Set(vendors.map((v) => v.country?.trim().toLowerCase()).filter(Boolean)).size)} icon={<Building2 className="h-4 w-4" />} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) { setForm(emptyForm); setEditingVendor(null); } }}>
            <DialogTrigger asChild><Button onClick={() => setEditingVendor(null)}><Plus className="h-4 w-4 mr-2" />Add Vendor</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add Vendor</DialogTitle></DialogHeader>
              {VendorForm}
              <DialogFooter><Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button><Button onClick={handleSubmit} disabled={createMutation.isPending}>Add Vendor</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={!!editingVendor} onOpenChange={(o) => { if (!o) { setEditingVendor(null); setForm(emptyForm); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit Vendor</DialogTitle></DialogHeader>
            {VendorForm}
            <DialogFooter><Button variant="outline" onClick={() => setEditingVendor(null)}>Cancel</Button><Button onClick={handleSubmit} disabled={updateMutation.isPending}>Save Changes</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead><TableHead>Contact</TableHead>
                <TableHead>Location</TableHead><TableHead>Payment Terms</TableHead>
                <TableHead>Status</TableHead><TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
              ) : pagination.paginatedItems.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-16">{search ? <span className="text-muted-foreground">No vendors match your search.</span> : <div className="flex flex-col items-center gap-3"><Truck className="h-10 w-10 text-muted-foreground/50" /><div><p className="font-medium text-muted-foreground">No vendors yet</p><p className="text-sm text-muted-foreground/70 mt-1">Add your first vendor to get started with procurement</p></div><Button variant="outline" size="sm" onClick={() => setIsDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Vendor</Button></div>}</TableCell></TableRow>
              ) : pagination.paginatedItems.map((v) => (
                <TableRow key={v.id}>
                  <TableCell><div className="font-medium">{v.name}</div>{v.contact_person && <div className="text-xs text-muted-foreground">{v.contact_person}</div>}</TableCell>
                  <TableCell><div className="flex flex-col gap-0.5">{v.email && <div className="flex items-center gap-1 text-sm"><Mail className="h-3 w-3 text-muted-foreground" />{v.email}</div>}{v.phone && <div className="flex items-center gap-1 text-sm"><Phone className="h-3 w-3 text-muted-foreground" />{v.phone}</div>}</div></TableCell>
                  <TableCell className="text-sm">{[v.city, v.country].filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell className="text-sm">{v.payment_terms || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={v.status === "active" ? "bg-success/20 text-success border-success/30" : ""}>{v.status}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(v)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleStatusMutation.mutate({ id: v.id, currentStatus: v.status })}><ToggleRight className="h-4 w-4 mr-2" />{v.status === "active" ? "Mark Inactive" : "Mark Active"}</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(v.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
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

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this vendor. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteMutation.mutate(deleteTarget!); setDeleteTarget(null); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
