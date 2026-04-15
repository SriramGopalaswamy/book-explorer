import { useState, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/StatCard";
import { TablePagination } from "@/components/ui/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MoreHorizontal, Trash2, Search, Paperclip, Check, Clock, IndianRupee, CircleDollarSign, Plus, Upload, Loader2, Filter, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { useUserOrganization } from "@/hooks/useUserOrganization";
import { BulkUploadDialog } from "@/components/bulk-upload/BulkUploadDialog";
import { BulkUploadHistory } from "@/components/bulk-upload/BulkUploadHistory";
import { useExpensesBulkUpload } from "@/hooks/useBulkUpload";

interface Expense {
  id: string; category: string; amount: number; description: string | null;
  expense_date: string; receipt_url: string | null; status: string; notes: string | null;
  created_at: string; user_id: string; reviewed_by: string | null; reviewed_at: string | null;
  reviewer_notes: string | null; profile_id: string | null;
  profiles?: { full_name: string | null; email: string | null } | null;
}

const formatCurrency = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${n.toLocaleString("en-IN")}`;
const statusColors: Record<string, string> = {
  pending: "bg-warning/20 text-warning border-warning/30",
  approved: "bg-success/20 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive",
  paid: "bg-primary/10 text-primary",
};
const statusLabels: Record<string, string> = {
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
};

export default function Expenses() {
  
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const expensesBulkConfig = useExpensesBulkUpload();
  const [createOpen, setCreateOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [newNotes, setNewNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // All org expenses (finance/admin view only — this page is behind FinanceRoute)
  const { data: allExpenses = [], isLoading, error: allError } = useQuery({
    queryKey: ["expenses-all", orgId],
    queryFn: async () => {
      if (!user || !orgId) return [];
      const { data, error } = await supabase
        .from("expenses")
        .select("*, profiles:profile_id(full_name, email)")
        .eq("organization_id", orgId)
        .eq("is_deleted", false)
        .order("expense_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as Expense[];
    },
    enabled: !!user && !!orgId,
  });

  // Log any query errors for debugging
  if (allError) console.error("expenses-all query error:", allError);

  const expenses = allExpenses;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { if (!orgId) throw new Error("Organization not found"); const { error } = await supabase.from("expenses").update({ is_deleted: true, deleted_at: new Date().toISOString() } as any).eq("id", id).eq("organization_id", orgId); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["expenses-all"] }); queryClient.invalidateQueries({ queryKey: ["expenses-my"] }); queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }); queryClient.invalidateQueries({ queryKey: ["financial-data"] }); toast({ title: "Expense Deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("Organization not found");
      // Update expense status to paid
      const { error } = await supabase.from("expenses").update({ status: "paid", reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;

      // Fetch the expense details to create a financial_records entry
      const { data: expense, error: fetchErr } = await supabase.from("expenses").select("*").eq("id", id).eq("organization_id", orgId).single();
      if (fetchErr || !expense) {
        console.warn("Could not fetch expense to sync to financial_records:", fetchErr);
        return;
      }

      // Create corresponding entry in financial_records so it shows in Accounting
      const { error: frError } = await supabase.from("financial_records").insert({
        type: "expense",
        category: expense.category,
        amount: Number(expense.amount),
        description: expense.description || `Expense: ${expense.category}`,
        record_date: expense.expense_date,
        user_id: user!.id,
        organization_id: orgId,
      });
      if (frError) console.warn("Failed to sync expense to financial_records:", frError);

      // Auto-create bank transaction (debit/money out)
      const { createBankTransaction } = await import("@/lib/bank-transaction-sync");
      await createBankTransaction({
        userId: user!.id,
        amount: Number(expense.amount),
        type: "debit",
        description: `Expense paid: ${expense.category}${expense.description ? ` — ${expense.description}` : ""}`,
        reference: id.slice(0, 8),
        category: expense.category,
        date: expense.expense_date,
        organizationId: orgId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses-all"] });
      queryClient.invalidateQueries({ queryKey: ["financial-records"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-revenue"] });
      queryClient.invalidateQueries({ queryKey: ["expense-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["financial-data"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast({ title: "Expense marked as Paid" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createExpenseMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!orgId) throw new Error("Organization not found");
      if (!newCategory) throw new Error("Category is required");
      if (!newAmount || Number(newAmount) <= 0) throw new Error("Valid amount is required");
      if (!receiptFile) throw new Error("Receipt/bill upload is mandatory");

      // Get profile_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, organization_id")
        .eq("user_id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");

      // Upload receipt
      let receiptUrl: string | null = null;
      const ext = receiptFile.name.split(".").pop() || "pdf";
      const filePath = `${profile.organization_id}/${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("bill-attachments")
        .upload(filePath, receiptFile);
      if (uploadError) throw new Error(`Receipt upload failed: ${uploadError.message}`);
      receiptUrl = filePath;

      const { error } = await supabase.from("expenses").insert({
        user_id: user.id,
        profile_id: profile.id,
        organization_id: profile.organization_id,
        category: newCategory,
        amount: Number(newAmount),
        description: newDescription || null,
        expense_date: newDate,
        receipt_url: receiptUrl,
        notes: newNotes || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses-all"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-my"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({ title: "Expense Created", description: "Your expense has been submitted for approval." });
      setCreateOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setNewCategory("");
    setNewAmount("");
    setNewDescription("");
    setNewDate(new Date().toISOString().split("T")[0]);
    setNewNotes("");
    setReceiptFile(null);
  };

  const totalExpenses = expenses.filter(e => e.status === "approved" || e.status === "paid").reduce((s, e) => s + e.amount, 0);
  const pendingAmount = expenses.filter(e => e.status === "pending").reduce((s, e) => s + e.amount, 0);
  const approvedAmount = expenses.filter(e => e.status === "approved").reduce((s, e) => s + e.amount, 0);
  const paidAmount = expenses.filter(e => e.status === "paid").reduce((s, e) => s + e.amount, 0);

  const pendingExpenses = expenses.filter(e => e.status === "pending");
  const approvedExpenses = expenses.filter(e => e.status === "approved");
  const paidExpenses = expenses.filter(e => e.status === "paid");

  const allFiltered = expenses.filter((e) => {
    const matchesSearch =
      e.category.toLowerCase().includes(search.toLowerCase()) ||
      (e.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
      ((e.profiles as any)?.full_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const allPagination = usePagination(allFiltered, 10);
  const pendingPagination = usePagination(pendingExpenses, 10);
  const approvedPagination = usePagination(approvedExpenses, 10);
  const paidPagination = usePagination(paidExpenses, 10);

  const renderReceiptButton = (receiptUrl: string | null) => {
    if (!receiptUrl) return <span className="text-muted-foreground text-sm">—</span>;
    return (
      <button
        onClick={async () => {
          const pathOnly = receiptUrl.includes("/bill-attachments/") ? receiptUrl.split("/bill-attachments/").pop()! : receiptUrl;
          const { data } = await supabase.storage.from("bill-attachments").createSignedUrl(pathOnly, 3600);
          if (data?.signedUrl) window.open(data.signedUrl, "_blank");
          else toast({ title: "Error", description: "Could not load receipt", variant: "destructive" });
        }}
        className="flex items-center gap-1 text-primary text-xs hover:underline cursor-pointer"
      ><Paperclip className="h-3 w-3" />View</button>
    );
  };

  if (isCheckingRole) {
    return (
      <MainLayout title="Expenses">
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-muted-foreground text-sm">Loading...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  const pageTitle = true ? "Expenses" : "My Expenses";
  const pageSubtitle = true
    ? "Manage and process organization expenses"
    : "Track your submitted expenses";

  const renderExpenseTable = (items: Expense[], pagination: ReturnType<typeof usePagination<Expense>>) => (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {true && <TableHead>Employee</TableHead>}
            <TableHead>Category</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Receipt</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <TableRow key={i}>{Array.from({ length: true ? 8 : 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
          ) : pagination.paginatedItems.length === 0 ? (
            <TableRow><TableCell colSpan={true ? 8 : 7} className="text-center py-12 text-muted-foreground">{search ? "No expenses match." : "No expenses in this category."}</TableCell></TableRow>
          ) : pagination.paginatedItems.map((e) => (
            <TableRow key={e.id}>
              {true && <TableCell className="text-sm">{(e.profiles as any)?.full_name || "—"}</TableCell>}
              <TableCell><Badge variant="outline">{e.category}</Badge></TableCell>
              <TableCell className="text-sm max-w-[200px] truncate">{e.description || "—"}</TableCell>
              <TableCell className="font-semibold">{formatCurrency(e.amount)}</TableCell>
              <TableCell className="text-sm">{new Date(e.expense_date).toLocaleDateString("en-IN")}</TableCell>
              <TableCell>{renderReceiptButton(e.receipt_url)}</TableCell>
              <TableCell><Badge variant="outline" className={statusColors[e.status] ?? ""}>{statusLabels[e.status] || e.status}</Badge></TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {e.receipt_url ? (
                      <DropdownMenuItem onClick={async () => {
                        const pathOnly = e.receipt_url!.includes("/bill-attachments/") ? e.receipt_url!.split("/bill-attachments/").pop()! : e.receipt_url!;
                        const { data } = await supabase.storage.from("bill-attachments").createSignedUrl(pathOnly, 3600);
                        if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                        else toast({ title: "Error", description: "Could not load receipt", variant: "destructive" });
                      }}><Paperclip className="h-4 w-4 mr-2" />View Receipt</DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem disabled className="text-muted-foreground opacity-60">
                        <Paperclip className="h-4 w-4 mr-2" />No receipt attached
                      </DropdownMenuItem>
                    )}
                    {(e.status === "pending" || e.status === "draft") && e.user_id === user?.id && (
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(e.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                    )}
                    {true && e.status === "pending" && e.user_id !== user?.id && (
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(e.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                    )}
                    {true && e.status === "approved" && (
                      <DropdownMenuItem onClick={() => markPaidMutation.mutate(e.id)}><Check className="h-4 w-4 mr-2" />Mark as Paid</DropdownMenuItem>
                    )}
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
  );

  return (
    <MainLayout title={pageTitle} subtitle={pageSubtitle}>
      <div className="space-y-6">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Approved Expenses" value={formatCurrency(totalExpenses)} icon={<IndianRupee className="h-4 w-4" />} change={totalExpenses > 0 ? { value: "Approved + Paid", type: "neutral" } : undefined} />
          <StatCard title="Pending Approval" value={formatCurrency(pendingAmount)} icon={<Clock className="h-4 w-4" />} />
          <StatCard title={true ? "Approved (Unpaid)" : "Approved"} value={formatCurrency(approvedAmount)} icon={<Check className="h-4 w-4" />} />
          <StatCard title="Paid" value={formatCurrency(paidAmount)} icon={<CircleDollarSign className="h-4 w-4" />} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder={true ? "Search by employee, category..." : "Search by category..."} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending Approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          {(search || statusFilter !== "all") && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {true && <BulkUploadDialog config={expensesBulkConfig} />}
            <Button onClick={() => { resetForm(); setCreateOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Create Expense
            </Button>
          </div>
        </div>

        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All ({expenses.length})</TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              Pending
              {pendingExpenses.length > 0 && <span className="ml-1 rounded-full bg-warning/20 text-warning text-xs px-1.5 py-0.5 font-semibold">{pendingExpenses.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="approved" className="gap-2">
              {true ? "Ready for Payment" : "Approved"}
              {approvedExpenses.length > 0 && <span className="ml-1 rounded-full bg-success/20 text-success text-xs px-1.5 py-0.5 font-semibold">{approvedExpenses.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="paid">Paid ({paidExpenses.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="all">
            {renderExpenseTable(allFiltered, allPagination)}
          </TabsContent>
          <TabsContent value="pending">
            {renderExpenseTable(pendingExpenses, pendingPagination)}
          </TabsContent>
          <TabsContent value="approved">
            {renderExpenseTable(approvedExpenses, approvedPagination)}
          </TabsContent>
          <TabsContent value="paid">
            {renderExpenseTable(paidExpenses, paidPagination)}
          </TabsContent>
        </Tabs>

        {true && <BulkUploadHistory module="expenses" />}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category <span className="text-destructive">*</span></Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {["Travel", "Food & Meals", "Office Supplies", "Software", "Equipment", "Communication", "Transport", "Accommodation", "Training", "Medical", "Miscellaneous"].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount (₹) <span className="text-destructive">*</span></Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={newAmount} onChange={e => setNewAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Brief description of expense" value={newDescription} onChange={e => setNewDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Receipt / Bill <span className="text-destructive">*</span></Label>
              <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
              <Button type="button" variant="outline" className="w-full gap-2 justify-start" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                {receiptFile ? receiptFile.name : "Upload receipt (image or PDF)"}
              </Button>
              {!receiptFile && <p className="text-xs text-muted-foreground">Mandatory: attach a receipt or bill to submit this expense.</p>}
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Additional notes (optional)" value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createExpenseMutation.mutate()} disabled={createExpenseMutation.isPending || !newCategory || !newAmount || !receiptFile}>
              {createExpenseMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this expense. This action cannot be undone.
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
