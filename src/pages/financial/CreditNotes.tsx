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
import { Plus, MoreHorizontal, Trash2, Search, FileX, Pencil, Filter, X, Eye, Loader2 } from "lucide-react";
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

interface Customer { id: string; name: string; }
interface CreditNote {
  id: string; credit_note_number: string; client_name: string; customer_id: string | null;
  amount: number; reason: string | null; status: string; issue_date: string; created_at: string;
}

const formatCurrency = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${n.toLocaleString("en-IN")}`;

// Valid status transitions: current → allowed next statuses
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft:   ["issued", "applied", "void"],
  issued:  ["applied", "void"],
  applied: ["void"],
  void:    [],       // terminal
};

// Statuses allowed when creating new records
const CREATE_STATUSES = ["draft", "issued"];

// For edit dialog: allowed statuses based on current
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

export default function CreditNotes() {
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewingCreditNote, setViewingCreditNote] = useState<CreditNote | null>(null);
  const [editingCreditNote, setEditingCreditNote] = useState<CreditNote | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [editCustomerId, setEditCustomerId] = useState("");
  const [form, setForm] = useState({ amount: "", reason: "", issue_date: new Date().toISOString().split("T")[0], status: "issued" });
  const [editForm, setEditForm] = useState({ amount: "", reason: "", issue_date: "", status: "" });
  const [deleteTarget, setDeleteTarget] = useState<CreditNote | null>(null);

  const { data: creditNotes = [], isLoading } = useQuery({
    queryKey: ["credit-notes", user?.id, orgId],
    queryFn: async () => {
      if (!user || !orgId) return [];
      const { data, error } = await supabase.from("credit_notes").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as CreditNote[];
    },
    enabled: !!user && !!orgId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", user?.id, orgId],
    queryFn: async () => {
      if (!user || !orgId) return [];
      const { data, error } = await supabase.from("customers").select("id,name").eq("organization_id", orgId).eq("status", "active");
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!user && !!orgId,
  });

  const resetForm = () => {
    setForm({ amount: "", reason: "", issue_date: new Date().toISOString().split("T")[0], status: "issued" });
    setSelectedCustomerId("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!orgId) throw new Error("Organization not found");
      if (!selectedCustomerId) throw new Error("Please select a customer.");
      if (!form.amount || Number(form.amount) <= 0) throw new Error("Please enter a valid amount.");
      const customer = customers.find((c) => c.id === selectedCustomerId);
      if (!customer) throw new Error("Selected customer not found.");
      const { error } = await supabase.from("credit_notes").insert({
        user_id: user.id,
        organization_id: orgId,
        credit_note_number: `CN-${Date.now().toString().slice(-6)}`,
        client_name: customer.name,
        customer_id: selectedCustomerId,
        amount: Number(form.amount),
        reason: form.reason || null,
        issue_date: form.issue_date,
        status: form.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      toast({ title: "Credit Note Created" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!orgId) throw new Error("Organization not found");
      const { error } = await supabase.from("credit_notes").update({ status }).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["credit-notes"] }); queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }); queryClient.invalidateQueries({ queryKey: ["financial-data"] }); toast({ title: "Status Updated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleStatusChange = (cn: CreditNote, newStatus: string) => {
    const allowed = ALLOWED_TRANSITIONS[cn.status] || [];
    if (!allowed.includes(newStatus)) {
      toast({ title: "Invalid Transition", description: `Cannot change from "${cn.status}" to "${newStatus}".`, variant: "destructive" });
      return;
    }
    statusMutation.mutate({ id: cn.id, status: newStatus });
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingCreditNote) throw new Error("No credit note selected");
      if (!orgId) throw new Error("Organization not found");
      if (!editCustomerId) throw new Error("Please select a customer.");
      if (!editForm.amount || Number(editForm.amount) <= 0) throw new Error("Please enter a valid amount.");
      const customer = customers.find((c) => c.id === editCustomerId);
      if (!customer) throw new Error("Selected customer not found.");
      const { error } = await supabase.from("credit_notes").update({
        client_name: customer.name,
        customer_id: editCustomerId,
        amount: Number(editForm.amount),
        reason: editForm.reason || null,
        issue_date: editForm.issue_date,
        status: editForm.status,
      }).eq("id", editingCreditNote.id).eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["financial-data"] });
      setIsEditDialogOpen(false);
      setEditingCreditNote(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("Organization not found");
      const { data: deleted, error } = await supabase.from("credit_notes").delete().eq("id", id).eq("organization_id", orgId).select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) throw new Error("Credit note not found or could not be deleted.");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["credit-notes"] }); queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }); queryClient.invalidateQueries({ queryKey: ["financial-data"] }); toast({ title: "Credit Note Deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleEdit = (cn: CreditNote) => {
    setEditingCreditNote(cn);
    setEditCustomerId(cn.customer_id || "");
    setEditForm({ amount: String(cn.amount), reason: cn.reason || "", issue_date: cn.issue_date, status: cn.status });
    setIsEditDialogOpen(true);
  };

  const filtered = creditNotes.filter((cn) => {
    const matchesSearch = cn.client_name.toLowerCase().includes(search.toLowerCase()) || cn.credit_note_number.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || cn.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const pagination = usePagination(filtered, 10);

  const hasActiveFilters = search || statusFilter !== "all";

  if (isCheckingRole) return <MainLayout title="Credit Notes"><div className="flex items-center justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div></MainLayout>;
  if (!hasFinanceAccess) return <AccessDenied />;

  return (
    <MainLayout title="Credit Notes" subtitle="Issue credit notes against registered customers">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Credit Notes" value={String(creditNotes.length)} icon={<FileX className="h-4 w-4" />} />
          <StatCard title="Draft" value={String(creditNotes.filter((cn) => cn.status === "draft").length)} icon={<FileX className="h-4 w-4" />} />
          <StatCard title="Issued" value={String(creditNotes.filter((cn) => cn.status === "issued").length)} icon={<FileX className="h-4 w-4" />} />
          <StatCard title="Total Value" value={formatCurrency(creditNotes.filter((cn) => cn.status === "issued" || cn.status === "applied").reduce((s, cn) => s + Number(cn.amount), 0))} icon={<FileX className="h-4 w-4" />} />
        </div>

        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search credit notes..." value={search} onChange={(e) => { setSearch(e.target.value); pagination.setPage(1); }} />
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
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Credit Note</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Create Credit Note</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-2">
                <div>
                  <Label>Customer <span className="text-destructive">*</span></Label>
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>
                      {customers.length === 0
                        ? <SelectItem value="_none" disabled>No active customers found</SelectItem>
                        : customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)
                      }
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Amount (₹) <span className="text-destructive">*</span></Label><Input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
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
                <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
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
                <TableHead>Credit Note #</TableHead><TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead><TableHead>Issue Date</TableHead>
                <TableHead>Reason</TableHead><TableHead className="min-w-[220px]">Status</TableHead><TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
              ) : pagination.paginatedItems.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  {hasActiveFilters ? "No credit notes match your filters." : "No credit notes yet."}
                </TableCell></TableRow>
              ) : pagination.paginatedItems.map((cn) => {
                const allowedNext = ALLOWED_TRANSITIONS[cn.status] || [];
                return (
                  <TableRow key={cn.id}>
                    <TableCell className="font-mono text-sm">{cn.credit_note_number}</TableCell>
                    <TableCell className="font-medium">{cn.client_name}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(cn.amount)}</TableCell>
                    <TableCell className="text-sm">{new Date(cn.issue_date).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={cn.reason || "—"}>{cn.reason || "—"}</TableCell>
                    <TableCell><StatusStepper status={cn.status} /></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setViewingCreditNote(cn); setIsViewDialogOpen(true); }}><Eye className="h-4 w-4 mr-2" />View Details</DropdownMenuItem>
                          {cn.status === "draft" && (
                            <DropdownMenuItem onClick={() => handleEdit(cn)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                          )}
                          {allowedNext.map((s) => (
                            <DropdownMenuItem key={s} onClick={() => handleStatusChange(cn, s)}>
                              Mark as {s.charAt(0).toUpperCase() + s.slice(1)}
                            </DropdownMenuItem>
                          ))}
                          {(cn.status === "draft" || cn.status === "void" || cn.status === "issued" || cn.status === "applied") && (
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(cn)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
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

        {/* View Details Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={(open) => { setIsViewDialogOpen(open); if (!open) setViewingCreditNote(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Credit Note Details</DialogTitle></DialogHeader>
            {viewingCreditNote && (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Credit Note #</p>
                    <p className="font-mono font-medium text-sm">{viewingCreditNote.credit_note_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                    <Badge variant="outline" className={STATUS_COLORS[viewingCreditNote.status] || ""}>
                      {viewingCreditNote.status.charAt(0).toUpperCase() + viewingCreditNote.status.slice(1)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Customer</p>
                    <p className="font-medium">{viewingCreditNote.client_name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Amount</p>
                    <p className="font-semibold text-primary">{formatCurrency(viewingCreditNote.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Issue Date</p>
                    <p className="text-sm">{new Date(viewingCreditNote.issue_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Created</p>
                    <p className="text-sm">{new Date(viewingCreditNote.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
                  </div>
                </div>
                {viewingCreditNote.reason && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Reason</p>
                    <p className="text-sm bg-muted/30 rounded-lg p-3">{viewingCreditNote.reason}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsViewDialogOpen(false); setViewingCreditNote(null); }}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Credit Note</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget?.status === "void"
                  ? `This void credit note (${deleteTarget?.credit_note_number}) has been permanently cancelled. Are you sure you want to delete it? This action cannot be undone.`
                  : `Are you sure you want to delete ${deleteTarget?.credit_note_number}? This action cannot be undone.`}
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
        <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setEditingCreditNote(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit Credit Note</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2">
              <div>
                <Label>Customer <span className="text-destructive">*</span></Label>
                <Select value={editCustomerId} onValueChange={setEditCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.length === 0
                      ? <SelectItem value="_none" disabled>No active customers found</SelectItem>
                      : customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Amount (₹) <span className="text-destructive">*</span></Label><Input type="number" min={0} value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} /></div>
              <div><Label>Issue Date</Label><Input type="date" value={editForm.issue_date} onChange={(e) => setEditForm({ ...editForm, issue_date: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {getEditStatuses(editingCreditNote?.status || "draft").map((s) => (
                      <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Reason</Label><Textarea value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} rows={3} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingCreditNote(null); }}>Cancel</Button>
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
