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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, MoreHorizontal, Trash2, Search, Wallet, Upload, Paperclip } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";

interface Expense {
  id: string; category: string; amount: number; description: string | null;
  expense_date: string; receipt_url: string | null; status: string; notes: string | null; created_at: string;
}

const EXPENSE_CATEGORIES = ["Travel", "Meals", "Office Supplies", "Software", "Hardware", "Utilities", "Rent", "Marketing", "Training", "Miscellaneous"];
const formatCurrency = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${n.toLocaleString("en-IN")}`;
const statusColors: Record<string, string> = {
  pending: "bg-warning/20 text-warning border-warning/30",
  approved: "bg-success/20 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive",
  paid: "bg-primary/10 text-primary",
};

export default function Expenses() {
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [form, setForm] = useState({ category: "", amount: "", description: "", expense_date: new Date().toISOString().split("T")[0], notes: "" });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("expenses").select("*").eq("user_id", user.id).order("expense_date", { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!form.category || !form.amount) throw new Error("Category and amount are required.");
      if (!receiptFile) throw new Error("Bill/receipt upload is required.");
      let receiptUrl: string | null = null;
      if (receiptFile) {
        const path = `${user.id}/${Date.now()}-${receiptFile.name}`;
        const { error: upErr } = await supabase.storage.from("bill-attachments").upload(path, receiptFile, { contentType: receiptFile.type });
        if (!upErr) {
          receiptUrl = path; // Store path only; generate signed URL on view
        }
      }
      const { error } = await supabase.from("expenses").insert({
        user_id: user.id, category: form.category, amount: Number(form.amount),
        description: form.description || null, expense_date: form.expense_date,
        notes: form.notes || null, receipt_url: receiptUrl,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "Expense Added" });
      setIsDialogOpen(false);
      setForm({ category: "", amount: "", description: "", expense_date: new Date().toISOString().split("T")[0], notes: "" });
      setReceiptFile(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("expenses").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["expenses"] }); toast({ title: "Expense Deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const pending = expenses.filter((e) => e.status === "pending").reduce((s, e) => s + e.amount, 0);
  const filtered = expenses.filter((e) => e.category.toLowerCase().includes(search.toLowerCase()) || (e.description ?? "").toLowerCase().includes(search.toLowerCase()));
  const pagination = usePagination(filtered, 10);

  if (isCheckingRole) return null;
  if (!hasFinanceAccess) return <AccessDenied />;

  return (
    <MainLayout title="Expenses" subtitle="Track out-of-pocket expenses and reimbursements">
      <div className="space-y-6">
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Expenses" value={String(expenses.length)} icon={<Wallet className="h-4 w-4" />} />
          <StatCard title="Total Amount" value={formatCurrency(total)} icon={<Wallet className="h-4 w-4" />} />
          <StatCard title="Pending Amount" value={formatCurrency(pending)} icon={<Wallet className="h-4 w-4" />} />
          <StatCard title="Approved" value={String(expenses.filter((e) => e.status === "approved").length)} icon={<Wallet className="h-4 w-4" />} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search expenses..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) setReceiptFile(null); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Expense</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-2">
                <div>
                  <Label>Category *</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value="">Select category</option>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Amount (₹) *</Label><Input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                  <div><Label>Date</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
                </div>
                <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description" /></div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
                <div>
                  <Label>Receipt / Bill *</Label>
                  <label className={`flex items-center gap-2 cursor-pointer border border-dashed rounded-lg p-3 hover:bg-muted/30 transition-colors mt-1 ${receiptFile ? 'border-border' : 'border-destructive/50'}`}>
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{receiptFile ? receiptFile.name : "Upload receipt"}</span>
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Add Expense</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead><TableHead>Description</TableHead>
                <TableHead>Amount</TableHead><TableHead>Date</TableHead>
                <TableHead>Receipt</TableHead><TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
              ) : pagination.paginatedItems.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">{search ? "No expenses match." : "No expenses recorded yet."}</TableCell></TableRow>
              ) : pagination.paginatedItems.map((e) => (
                <TableRow key={e.id}>
                  <TableCell><Badge variant="outline">{e.category}</Badge></TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{e.description || "—"}</TableCell>
                  <TableCell className="font-semibold">{formatCurrency(e.amount)}</TableCell>
                  <TableCell className="text-sm">{new Date(e.expense_date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell>
                    {e.receipt_url ? (
                      <button
                        onClick={async () => {
                          const storedPath = e.receipt_url!;
                          // Handle legacy full URLs: extract path after /bill-attachments/
                          const pathOnly = storedPath.includes("/bill-attachments/")
                            ? storedPath.split("/bill-attachments/").pop()!
                            : storedPath;
                          const { data } = await supabase.storage.from("bill-attachments").createSignedUrl(pathOnly, 3600);
                          if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                          else toast({ title: "Error", description: "Could not load receipt", variant: "destructive" });
                        }}
                        className="flex items-center gap-1 text-primary text-xs hover:underline cursor-pointer"
                      ><Paperclip className="h-3 w-3" />View</button>
                    ) : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                  <TableCell><Badge variant="outline" className={statusColors[e.status] ?? ""}>{e.status}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(e.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
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
