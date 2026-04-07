import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CountrySelect } from "@/components/ui/country-select";
import { getPhoneConfig, getTaxConfig, validatePhone, validateTaxNumber } from "@/lib/country-validation";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, MoreHorizontal, Pencil, Trash2, Search, Building2, Mail, Phone, ToggleRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
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
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<{ phone?: string; tax_number?: string; email?: string }>({});

  // Auto-set country code when country changes
  useEffect(() => {
    if (form.country) {
      const config = getPhoneConfig(form.country);
      if (config.code && !form.phone.startsWith(config.code)) {
        setForm((prev) => ({ ...prev, phone: config.code + " " }));
      }
    }
  }, [form.country]);

  // Live validation on phone/tax changes
  useEffect(() => {
    const newErrors: typeof errors = {};
    if (form.phone.trim()) {
      const phoneErr = validatePhone(form.phone, form.country);
      if (phoneErr) newErrors.phone = phoneErr;
    }
    if (form.tax_number.trim()) {
      // Check 15-char alphanumeric rule (GSTIN is 15 characters)
      if (!/^[A-Za-z0-9]{15}$/.test(form.tax_number.trim())) {
        newErrors.tax_number = "Must be exactly 15 alphanumeric characters";
      } else {
        const taxErr = validateTaxNumber(form.tax_number, form.country);
        if (taxErr) newErrors.tax_number = taxErr;
      }
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      newErrors.email = "Invalid email format";
    }
    setErrors(newErrors);
  }, [form.phone, form.tax_number, form.country, form.email]);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("customers").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!orgId,
  });

  const createMutation = useMutation({
    mutationFn: async (values: typeof emptyForm) => {
      if (!user) throw new Error("Not authenticated");
      if (!orgId) throw new Error("Organization not found");
      const { error } = await supabase.from("customers").insert({ ...values, user_id: user.id, organization_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }); toast({ title: "Customer Added" }); setIsDialogOpen(false); setForm(emptyForm); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: typeof emptyForm }) => {
      if (!orgId) throw new Error("Organization not found");
      const { error } = await supabase.from("customers").update(values).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;

      // Propagate updated GSTIN to all draft invoices for this customer
      if (values.tax_number !== undefined) {
        await supabase
          .from("invoices")
          .update({ customer_gstin: values.tax_number || null } as any)
          .eq("customer_id", id)
          .eq("organization_id", orgId)
          .eq("status", "draft");
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); queryClient.invalidateQueries({ queryKey: ["invoices"] }); queryClient.invalidateQueries({ queryKey: ["quotes"] }); queryClient.invalidateQueries({ queryKey: ["credit-notes"] }); toast({ title: "Customer Updated" }); setEditingCustomer(null); setForm(emptyForm); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("Organization not found");
      // Check for linked invoices, credit notes, or quotes before deleting
      const [invoiceCheck, creditNoteCheck, quoteCheck] = await Promise.all([
        supabase.from("invoices").select("id").eq("customer_id", id).eq("organization_id", orgId).limit(1),
        supabase.from("credit_notes").select("id").eq("customer_id", id).eq("organization_id", orgId).limit(1),
        supabase.from("quotes").select("id").eq("customer_id", id).eq("organization_id", orgId).limit(1),
      ]);
      if ((invoiceCheck.data?.length ?? 0) > 0 || (creditNoteCheck.data?.length ?? 0) > 0 || (quoteCheck.data?.length ?? 0) > 0) {
        throw new Error("Cannot delete this customer because they have linked invoices, quotes, or credit notes. Mark them as inactive instead.");
      }
      // Delete AI profile if exists (no user-facing data — failure is non-critical)
      await supabase.from("ai_customer_profiles").delete().eq("customer_id", id);
      const { data: deleted, error } = await supabase.from("customers").delete().eq("id", id).eq("organization_id", orgId).select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) throw new Error("Customer not found or could not be deleted.");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }); toast({ title: "Customer Removed" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      if (!orgId) throw new Error("Organization not found");
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      const { error } = await supabase.from("customers").update({ status: newStatus }).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
      return newStatus;
    },
    onSuccess: (newStatus) => { queryClient.invalidateQueries({ queryKey: ["customers"] }); toast({ title: `Customer marked as ${newStatus}` }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = customers.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || (c.email ?? "").toLowerCase().includes(search.toLowerCase()) || (c.city ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const pagination = usePagination(filtered, 10);

  const openEdit = (c: Customer) => {
    setEditingCustomer(c);
    setForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "", city: c.city ?? "", country: c.country ?? "", tax_number: c.tax_number ?? "", contact_person: c.contact_person ?? "", notes: c.notes ?? "" });
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast({ title: "Validation Error", description: "Customer name is required.", variant: "destructive" });
    if (!form.email.trim()) return toast({ title: "Validation Error", description: "Email is required.", variant: "destructive" });
    
    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) return toast({ title: "Validation Error", description: "Please enter a valid email address.", variant: "destructive" });
    
    if (!form.phone.trim()) return toast({ title: "Validation Error", description: "Phone number is required.", variant: "destructive" });
    const phoneErr = validatePhone(form.phone, form.country);
    if (phoneErr) return toast({ title: "Invalid Phone", description: phoneErr, variant: "destructive" });
    
    if (!form.tax_number.trim()) return toast({ title: "Validation Error", description: "GST / Tax Number is required.", variant: "destructive" });
    
    // GST validation: must be exactly 15 alphanumeric characters (standard GSTIN format)
    const gstRaw = form.tax_number.trim();
    if (!/^[A-Za-z0-9]{15}$/.test(gstRaw)) {
      return toast({ title: "Invalid GST Number", description: "GST Number must be exactly 15 alphanumeric characters.", variant: "destructive" });
    }
    
    const taxErr = validateTaxNumber(form.tax_number, form.country);
    if (taxErr) return toast({ title: "Invalid Tax Number", description: taxErr, variant: "destructive" });

    if (editingCustomer) updateMutation.mutate({ id: editingCustomer.id, values: form });
    else createMutation.mutate(form);
  };

  const active = customers.filter((c) => c.status === "active").length;
  if (isCheckingRole) return <MainLayout title="Customers"><div className="flex items-center justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div></MainLayout>;
  if (!hasFinanceAccess) return <AccessDenied />;

  const phoneConfig = getPhoneConfig(form.country);
  const taxConfig = getTaxConfig(form.country);

  const CustomerForm = (
    <div className="grid gap-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Customer Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" /></div>
        <div>
          <Label>Email *</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="billing@acme.com" />
          {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
        </div>
        <div>
          <Label>Phone * {phoneConfig.code && <span className="text-xs text-muted-foreground ml-1">({phoneConfig.code})</span>}</Label>
          <Input
            value={form.phone}
            onChange={(e) => {
              const val = e.target.value;
              const codePrefix = phoneConfig.code ? phoneConfig.code + " " : "";
              // Prevent deleting the country code prefix
              if (codePrefix && !val.startsWith(phoneConfig.code)) {
                return;
              }
              // Only allow digits after country code
              const afterCode = val.slice(codePrefix.length);
              const digitsOnly = afterCode.replace(/\D/g, "");
              // Enforce exact digit limit
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
          <Label>{taxConfig ? taxConfig.label : "GST / Tax Number"} *</Label>
          <Input
            value={form.tax_number}
            onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
            placeholder={taxConfig?.placeholder || "Tax ID"}
          />
          {errors.tax_number && <p className="text-xs text-destructive mt-1">{errors.tax_number}</p>}
        </div>
        <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
        <div><Label>Country</Label><CountrySelect value={form.country} onChange={(val) => setForm({ ...form, country: val })} /></div>
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
          <StatCard title="Countries" value={String(new Set(customers.map((c) => c.country?.trim().toLowerCase()).filter(Boolean)).size)} icon={<Building2 className="h-4 w-4" />} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                <TableRow><TableCell colSpan={6} className="text-center py-16">{search ? <span className="text-muted-foreground">No customers match your search.</span> : <div className="flex flex-col items-center gap-3"><Users className="h-10 w-10 text-muted-foreground/50" /><div><p className="font-medium text-muted-foreground">No customers yet</p><p className="text-sm text-muted-foreground/70 mt-1">Add your first customer to start managing your sales</p></div><Button variant="outline" size="sm" onClick={() => setIsDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Customer</Button></div>}</TableCell></TableRow>
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
