import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, MoreHorizontal, Trash2, Search, Receipt, Pencil, Filter, X, Eye, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { useUserOrganization } from "@/hooks/useUserOrganization";

interface Vendor { id: string; name: string; }
interface VendorCredit {
  id: string; vendor_credit_number: string; vendor_name: string; vendor_id: string | null;
  amount: number; reason: string | null; status: string; issue_date: string; created_at: string;
}

const formatCurrency = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${n.toLocaleString("en-IN")}`;

// Valid status transitions
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft:   ["issued", "applied", "void"],
  issued:  ["applied", "void"],
  applied: ["void"],
  void:    [],
};

const CREATE_STATUSES = ["draft", "issued"];

const getEditStatuses = (current: string): string[] => {
  const transitions = ALLOWED_TRANSITIONS[current] || [];
  return [current, ...transitions];
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  issued: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  applied: "bg-green-500/15 text-green-500 border-green-500/30",
  void: "bg-destructive/15 text-destructive border-destructive/30",
};

const STATUS_STEPS = ["draft", "issued", "applied", "void"] as const;

const StatusStepper = ({ status }: { status: string }) => {
  const currentIdx = STATUS_STEPS.indexOf(status as typeof STATUS_STEPS[number]);
  return (
    <div className="flex items-center gap-0.5">
      {STATUS_STEPS.map((step, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent   = i === currentIdx;
        const isVoid      = step === "void";
        return (
          <div key={step} className="flex items-center gap-0.5">
            {i > 0 && <div className={`h-px w-3 ${isCompleted ? "bg-primary" : "bg-border"}`} />}
            <div
              title={step.charAt(0).toUpperCase() + step.slice(1)}
              className={[
                "h-2 w-2 rounded-full border transition-colors",
                isCurrent && isVoid ? "bg-destructive border-destructive" :
                isCurrent           ? "bg-primary border-primary" :
                isCompleted         ? "bg-primary/40 border-primary/40" :
                                      "bg-muted border-border",
              ].join(" ")}
            />
          </div>
        );
      })}
      <Badge variant="outline" className={`ml-1.5 text-xs ${STATUS_COLORS[status] || ""}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    </div>
  );
};

export default function VendorCredits() {
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCredit, setEditingCredit] = useState<VendorCredit | null>(null);
  const [viewingCredit, setViewingCredit] = useState<VendorCredit | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [editVendorId, setEditVendorId] = useState("");
  const [form, setForm] = useState({ vendor_name: "", amount: "", reason: "", issue_date: new Date().toISOString().split("T")[0], status: "issued" });
  const [editForm, setEditForm] = useState({ vendor_name: "", amount: "", reason: "", issue_date: "", status: "" });
  const [deleteTarget, setDeleteTarget] = useState<VendorCredit | null>(null);

  const { data: vendorCredits = [], isLoading } = useQuery({
    queryKey: ["vendor-credits", user?.id, orgId],
    queryFn: async () => {
      if (!user || !orgId) return [];
      const { data, error } = await supabase.from("vendor_credits").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as VendorCredit[];
    },
    enabled: !!user && !!orgId,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors", user?.id, orgId],
    queryFn: async () => {
      if (!user || !orgId) return [];
      const { data, error } = await supabase.from("vendors").select("id,name").eq("organization_id", orgId).eq("status", "active");
      if (error) throw error;
      return data as Vendor[];
    },
    enabled: !!user && !!orgId,
  });

  const resetForm = () => {
    setForm({ vendor_name: "", amount: "", reason: "", issue_date: new Date().toISOString().split("T")[0], status: "issued" });
    setSelectedVendorId("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!orgId) throw new Error("Organization not found");
      if (!form.vendor_name || !form.amount) throw new Error("Vendor name and amount are required.");
      const { error } = await supabase.from("vendor_credits").insert({
        user_id: user.id, organization_id: orgId, vendor_credit_number: `VC-${Date.now().toString().slice(-6)}`,
        vendor_name: form.vendor_name, vendor_id: selectedVendorId || null,
        amount: Number(form.amount), reason: form.reason || null, issue_date: form.issue_date,
        status: form.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-credits"] });
      toast({ title: "Vendor Credit Created" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingCredit) throw new Error("No vendor credit selected");
      if (!orgId) throw new Error("Organization not found");
      if (!editForm.vendor_name || !editForm.amount) throw new Error("Vendor name and amount are required.");
      const { error } = await supabase.from("vendor_credits").update({
        vendor_name: editForm.vendor_name,
        vendor_id: editVendorId || null,
        amount: Number(editForm.amount),
        reason: editForm.reason || null,
        issue_date: editForm.issue_date,
        status: editForm.status,
      }).eq("id", editingCredit.id).eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-credits"] });
      toast({ title: "Vendor Credit Updated" });
      setIsEditDialogOpen(false);
      setEditingCredit(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("Organization not found");
      const { data: deleted, error } = await supabase.from("vendor_credits").delete().eq("id", id).eq("organization_id", orgId).select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) throw new Error("Vendor credit not found or could not be deleted.");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vendor-credits"] }); toast({ title: "Vendor Credit Deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!orgId) throw new Error("Organization not found");
      const { error } = await supabase.from("vendor_credits").update({ status }).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vendor-credits"] }); toast({ title: "Status Updated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleStatusChange = (vc: VendorCredit, newStatus: string) => {
    const allowed = ALLOWED_TRANSITIONS[vc.status] || [];
    if (!allowed.includes(newStatus)) {
      toast({ title: "Invalid Transition", description: `Cannot change from "${vc.status}" to "${newStatus}".`, variant: "destructive" });
      return;
    }
    updateStatusMutation.mutate({ id: vc.id, status: newStatus });
  };

  const handleVendorSelect = (id: string) => {
    setSelectedVendorId(id);
    const v = vendors.find((x) => x.id === id);
    if (v) setForm((f) => ({ ...f, vendor_name: v.name }));
  };

  const handleEditVendorSelect = (id: string) => {
    setEditVendorId(id);
    const v = vendors.find((x) => x.id === id);
    if (v) setEditForm((f) => ({ ...f, vendor_name: v.name }));
  };

  const handleEdit = (vc: VendorCredit) => {
    setEditingCredit(vc);
    setEditVendorId(vc.vendor_id || "");
    setEditForm({ vendor_name: vc.vendor_name, amount: String(vc.amount), reason: vc.reason || "", issue_date: vc.issue_date, status: vc.status });
    setIsEditDialogOpen(true);
  };

  const filtered = vendorCredits.filter((vc) => {
    const matchesSearch = vc.vendor_name.toLowerCase().includes(search.toLowerCase()) || vc.vendor_credit_number.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || vc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const pagination = usePagination(filtered, 10);

  const hasActiveFilters = search || statusFilter !== "all";

  if (isCheckingRole) return <MainLayout title="Vendor Credits"><div className="flex items-center justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div></MainLayout>;
  if (!hasFinanceAccess) return <AccessDenied />;

  return (
    <MainLayout title="Vendor Credits" subtitle="Manage credit notes received from vendors">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Vendor Credits" value={String(vendorCredits.length)} icon={<Receipt className="h-4 w-4" />} />
          <StatCard title="Draft" value={String(vendorCredits.filter((vc) => vc.status === "draft").length)} icon={<Receipt className="h-4 w-4" />} />
          <StatCard title="Issued" value={String(vendorCredits.filter((vc) => vc.status === "issued").length)} icon={<Receipt className="h-4 w-4" />} />
          <StatCard title="Total Value" value={formatCurrency(vendorCredits.filter((vc) => vc.status === "issued" || vc.status === "applied").reduce((s, vc) => s + Number(vc.amount), 0))} icon={<Receipt className="h-4 w-4" />} />
        </div>

        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search vendor credits..." value={search} onChange={(e) => { setSearch(e.target.value); pagination.setPage(1); }} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); pagination.setPage(1); }}>
              <SelectTrigger className="w-[140px] h-9 text-sm">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter("all"); pagination.setPage(1); }}>
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Vendor Credit</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Create Vendor Credit</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-2">
                <div>
                  <Label>Vendor</Label>
                  <Select value={selectedVendorId} onValueChange={handleVendorSelect}>
                    <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Vendor Name *</Label><Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} /></div>
                <div><Label>Amount (₹) *</Label><Input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                <div><Label>Issue Date</Label><Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CREATE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Credit #</TableHead><TableHead>Vendor</TableHead>
                <TableHead>Amount</TableHead><TableHead>Issue Date</TableHead>
                <TableHead>Reason</TableHead><TableHead className="min-w-[220px]">Status</TableHead><TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
              ) : pagination.paginatedItems.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  {hasActiveFilters ? "No vendor credits match your filters." : "No vendor credits yet."}
                </TableCell></TableRow>
              ) : pagination.paginatedItems.map((vc) => {
                const allowedNext = ALLOWED_TRANSITIONS[vc.status] || [];
                return (
                  <TableRow key={vc.id}>
                    <TableCell className="font-mono text-sm">{vc.vendor_credit_number}</TableCell>
                    <TableCell className="font-medium">{vc.vendor_name}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(vc.amount)}</TableCell>
                    <TableCell className="text-sm">{new Date(vc.issue_date).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={vc.reason || "—"}>{vc.reason || "—"}</TableCell>
                    <TableCell><StatusStepper status={vc.status} /></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                         <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewingCredit(vc)}><Eye className="h-4 w-4 mr-2" />View Details</DropdownMenuItem>
                          {vc.status === "draft" && (
                            <DropdownMenuItem onClick={() => handleEdit(vc)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                          )}
                          {allowedNext.map((s) => (
                            <DropdownMenuItem key={s} onClick={() => handleStatusChange(vc, s)}>
                              Mark as {s.charAt(0).toUpperCase() + s.slice(1)}
                            </DropdownMenuItem>
                          ))}
                          {(vc.status === "draft" || vc.status === "void" || vc.status === "issued" || vc.status === "applied") && (
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(vc)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="p-4">
            <TablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Vendor Credit</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget?.status === "void"
                  ? `This void vendor credit (${deleteTarget?.vendor_credit_number}) has been permanently cancelled. Are you sure you want to delete it? This action cannot be undone.`
                  : `Are you sure you want to delete ${deleteTarget?.vendor_credit_number}? This action cannot be undone.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { if (deleteTarget) { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); } }}
              >Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit Dialog — only for draft status */}
        <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setEditingCredit(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit Vendor Credit</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2">
              <div>
                <Label>Vendor</Label>
                <Select value={editVendorId} onValueChange={handleEditVendorSelect}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Vendor Name *</Label><Input value={editForm.vendor_name} onChange={(e) => setEditForm({ ...editForm, vendor_name: e.target.value })} /></div>
              <div><Label>Amount (₹) *</Label><Input type="number" min={0} value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} /></div>
              <div><Label>Issue Date</Label><Input type="date" value={editForm.issue_date} onChange={(e) => setEditForm({ ...editForm, issue_date: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {getEditStatuses(editingCredit?.status || "draft").map((s) => (
                      <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Reason</Label><Textarea value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} rows={3} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingCredit(null); }}>Cancel</Button>
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Details Dialog */}
        <Dialog open={!!viewingCredit} onOpenChange={(open) => { if (!open) setViewingCredit(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Vendor Credit Details</DialogTitle></DialogHeader>
            {viewingCredit && (
              <div className="grid gap-3 py-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Credit Number</p>
                    <p className="font-mono font-medium">{viewingCredit.vendor_credit_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant="outline" className={STATUS_COLORS[viewingCredit.status] || ""}>
                      {viewingCredit.status.charAt(0).toUpperCase() + viewingCredit.status.slice(1)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Vendor Name</p>
                    <p className="font-medium">{viewingCredit.vendor_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-semibold">{formatCurrency(viewingCredit.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Issue Date</p>
                    <p>{new Date(viewingCredit.issue_date).toLocaleDateString("en-IN")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created At</p>
                    <p>{new Date(viewingCredit.created_at).toLocaleDateString("en-IN")}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reason</p>
                  <p className="text-sm mt-0.5">{viewingCredit.reason || "—"}</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewingCredit(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

