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
import { Plus, MoreHorizontal, Trash2, Search, FileX, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";

interface Customer { id: string; name: string; }
interface CreditNote {
  id: string; credit_note_number: string; client_name: string; customer_id: string | null;
  amount: number; reason: string | null; status: string; issue_date: string; created_at: string;
}

const formatCurrency = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${n.toLocaleString("en-IN")}`;

export default function CreditNotes() {
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCreditNote, setEditingCreditNote] = useState<CreditNote | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [editCustomerId, setEditCustomerId] = useState("");
  const [form, setForm] = useState({ amount: "", reason: "", issue_date: new Date().toISOString().split("T")[0], status: "issued" });
  const [editForm, setEditForm] = useState({ amount: "", reason: "", issue_date: "", status: "" });

  const { data: creditNotes = [], isLoading } = useQuery({
    queryKey: ["credit-notes", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("credit_notes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as CreditNote[];
    },
    enabled: !!user,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("customers").select("id,name").eq("status", "active");
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!user,
  });

  const resetForm = () => {
    setForm({ amount: "", reason: "", issue_date: new Date().toISOString().split("T")[0], status: "issued" });
    setSelectedCustomerId("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!selectedCustomerId) throw new Error("Please select a customer.");
      if (!form.amount || Number(form.amount) <= 0) throw new Error("Please enter a valid amount.");
      const customer = customers.find((c) => c.id === selectedCustomerId);
      if (!customer) throw new Error("Selected customer not found.");
      const { error } = await supabase.from("credit_notes").insert({
        user_id: user.id,
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
      const { error } = await supabase.from("credit_notes").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["credit-notes"] }); toast({ title: "Status Updated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingCreditNote) throw new Error("No credit note selected");
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
      }).eq("id", editingCreditNote.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      toast({ title: "Credit Note Updated" });
      setIsEditDialogOpen(false);
      setEditingCreditNote(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("credit_notes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["credit-notes"] }); toast({ title: "Credit Note Deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleEdit = (cn: CreditNote) => {
    setEditingCreditNote(cn);
    setEditCustomerId(cn.customer_id || "");
    setEditForm({ amount: String(cn.amount), reason: cn.reason || "", issue_date: cn.issue_date, status: cn.status });
    setIsEditDialogOpen(true);
  };

  const filtered = creditNotes.filter((cn) => cn.client_name.toLowerCase().includes(search.toLowerCase()) || cn.credit_note_number.toLowerCase().includes(search.toLowerCase()));
  const pagination = usePagination(filtered, 10);

  if (isCheckingRole) return null;
  if (!hasFinanceAccess) return <AccessDenied />;

  return (
    <MainLayout title="Credit Notes" subtitle="Issue credit notes against registered customers">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard title="Total Credit Notes" value={String(creditNotes.length)} icon={<FileX className="h-4 w-4" />} />
          <StatCard title="Draft" value={String(creditNotes.filter((cn) => cn.status === "draft").length)} icon={<FileX className="h-4 w-4" />} />
          <StatCard title="Total Value" value={formatCurrency(creditNotes.reduce((s, cn) => s + cn.amount, 0))} icon={<FileX className="h-4 w-4" />} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search credit notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                      <SelectItem value="issued">Issued</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="applied">Applied</SelectItem>
                      <SelectItem value="void">Void</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Create</Button>
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
                <TableHead>Status</TableHead><TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
              ) : pagination.paginatedItems.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No credit notes yet.</TableCell></TableRow>
              ) : pagination.paginatedItems.map((cn) => (
                <TableRow key={cn.id}>
                  <TableCell className="font-mono text-sm">{cn.credit_note_number}</TableCell>
                  <TableCell className="font-medium">{cn.client_name}</TableCell>
                  <TableCell className="font-semibold">{formatCurrency(cn.amount)}</TableCell>
                  <TableCell className="text-sm">{new Date(cn.issue_date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell><Badge variant="outline">{cn.status}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(cn)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                        {cn.status !== "issued" && <DropdownMenuItem onClick={() => statusMutation.mutate({ id: cn.id, status: "issued" })}>Mark as Issued</DropdownMenuItem>}
                        {cn.status !== "applied" && <DropdownMenuItem onClick={() => statusMutation.mutate({ id: cn.id, status: "applied" })}>Mark as Applied</DropdownMenuItem>}
                        {cn.status !== "void" && <DropdownMenuItem onClick={() => statusMutation.mutate({ id: cn.id, status: "void" })}>Mark as Void</DropdownMenuItem>}
                        {cn.status !== "draft" && <DropdownMenuItem onClick={() => statusMutation.mutate({ id: cn.id, status: "draft" })}>Revert to Draft</DropdownMenuItem>}
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(cn.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
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

        {/* Edit Dialog */}
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
                    <SelectItem value="issued">Issued</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="applied">Applied</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Reason</Label><Textarea value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} rows={3} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingCreditNote(null); }}>Cancel</Button>
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
