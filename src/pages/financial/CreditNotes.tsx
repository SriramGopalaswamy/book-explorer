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
import { Plus, MoreHorizontal, Trash2, Search, FileX } from "lucide-react";
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
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [form, setForm] = useState({ client_name: "", amount: "", reason: "", issue_date: new Date().toISOString().split("T")[0] });

  const { data: creditNotes = [], isLoading } = useQuery({
    queryKey: ["credit-notes", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("credit_notes").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data as CreditNote[];
    },
    enabled: !!user,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("customers").select("id,name").eq("user_id", user.id).eq("status", "active");
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!form.client_name || !form.amount) throw new Error("Client name and amount are required.");
      const { error } = await supabase.from("credit_notes").insert({
        user_id: user.id, credit_note_number: `CN-${Date.now().toString().slice(-6)}`,
        client_name: form.client_name, customer_id: selectedCustomerId || null,
        amount: Number(form.amount), reason: form.reason || null, issue_date: form.issue_date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      toast({ title: "Credit Note Created" });
      setIsDialogOpen(false);
      setForm({ client_name: "", amount: "", reason: "", issue_date: new Date().toISOString().split("T")[0] });
      setSelectedCustomerId("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("credit_notes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["credit-notes"] }); toast({ title: "Credit Note Deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleCustomerSelect = (id: string) => {
    setSelectedCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) setForm((f) => ({ ...f, client_name: c.name }));
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
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Credit Note</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Create Credit Note</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-2">
                <div>
                  <Label>Customer</Label>
                  <Select value={selectedCustomerId} onValueChange={handleCustomerSelect}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Client Name *</Label><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
                <div><Label>Amount (₹) *</Label><Input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                <div><Label>Issue Date</Label><Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></div>
                <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
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
      </div>
    </MainLayout>
  );
}
