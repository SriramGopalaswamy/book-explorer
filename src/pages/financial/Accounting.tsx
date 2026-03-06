import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Wallet,
  Loader2,
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Undo2,
  Trash2,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { OnboardingBanner } from "@/components/dashboard/OnboardingBanner";
import { useJournalEntries, useGLAccounts, usePostJournal, useReverseJournal } from "@/hooks/useLedger";
import { useProfitLoss } from "@/hooks/useAnalytics";
import {
  useFinancialRecords,
  useAddFinancialRecord,
  useDeleteFinancialRecord,
  type FinancialRecord,
} from "@/hooks/useFinancialData";

function formatAmount(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
  if (amount >= 1000) return `₹${amount.toLocaleString("en-IN")}`;
  return `₹${amount}`;
}

// ─── Transactions Tab ────────────────────────────────────────────────────────

function TransactionsTab() {
  const { data: records = [], isLoading } = useFinancialRecords();
  const addRecord = useAddFinancialRecord();
  const deleteRecord = useDeleteFinancialRecord();

  const [addOpen, setAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [formData, setFormData] = useState({
    type: "revenue" as "revenue" | "expense",
    category: "",
    amount: "",
    description: "",
    record_date: format(new Date(), "yyyy-MM-dd"),
  });

  const resetForm = () => {
    setFormData({
      type: "revenue",
      category: "",
      amount: "",
      description: "",
      record_date: format(new Date(), "yyyy-MM-dd"),
    });
  };

  const handleAdd = () => {
    const amount = parseFloat(formData.amount);
    if (!formData.category || isNaN(amount) || amount <= 0) {
      toast.error("Please fill in category and a valid amount.");
      return;
    }
    addRecord.mutate(
      {
        type: formData.type,
        category: formData.category,
        amount,
        description: formData.description || null,
        record_date: formData.record_date,
      },
      {
        onSuccess: () => {
          setAddOpen(false);
          resetForm();
        },
      }
    );
  };

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        r.category.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q);
      const matchesType = typeFilter === "all" || r.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [records, searchQuery, typeFilter]);

  const pagination = usePagination(filteredRecords, 15);

  const totals = useMemo(() => {
    const revenue = records.filter((r) => r.type === "revenue").reduce((s, r) => s + r.amount, 0);
    const expense = records.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
    return { revenue, expense, net: revenue - expense };
  }, [records]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Revenue"
          value={formatAmount(totals.revenue)}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          title="Total Expenses"
          value={formatAmount(totals.expense)}
          icon={<ArrowDownRight className="h-4 w-4" />}
        />
        <StatCard
          title="Net Income"
          value={formatAmount(totals.net)}
          change={{
            value: totals.revenue > 0 ? `${((totals.net / totals.revenue) * 100).toFixed(1)}% margin` : "0%",
            type: totals.net >= 0 ? "increase" : "decrease",
          }}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          title="Transactions"
          value={String(records.length)}
          icon={<Receipt className="h-4 w-4" />}
        />
      </div>

      {/* Transactions Table */}
      <div className="rounded-xl border bg-card shadow-card">
        <div className="flex flex-col gap-4 border-b p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Transactions</h3>
              <p className="text-sm text-muted-foreground">Revenue and expense records</p>
            </div>
            <Button
              className="bg-gradient-financial text-white hover:opacity-90"
              onClick={() => { resetForm(); setAddOpen(true); }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Transaction
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search category, description…"
                className="pl-9"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); pagination.setPage(1); }}
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); pagination.setPage(1); }}>
              <SelectTrigger className="w-[130px] h-9 text-sm">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
            {(searchQuery || typeFilter !== "all") && (
              <Button variant="ghost" size="sm" className="text-muted-foreground"
                onClick={() => { setSearchQuery(""); setTypeFilter("all"); pagination.setPage(1); }}
              >
                <X className="h-3.5 w-3.5 mr-1" />Clear
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Receipt className="h-10 w-10 mb-2 opacity-40" />
            <p>{records.length === 0 ? 'No transactions yet. Click "Add Transaction" to create one.' : "No transactions match your filters."}</p>
          </div>
        ) : (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map((record) => (
                  <TableRow key={record.id} className="hover:bg-secondary/50">
                    <TableCell className="text-foreground">{record.record_date}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          record.type === "revenue"
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-destructive/30 bg-destructive/10 text-destructive"
                        }
                      >
                        {record.type === "revenue" ? (
                          <ArrowUpRight className="mr-1 h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="mr-1 h-3 w-3" />
                        )}
                        {record.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground font-medium">{record.category}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {record.description || "—"}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${record.type === "revenue" ? "text-success" : "text-destructive"}`}>
                      {record.type === "revenue" ? "+" : "-"}{formatAmount(record.amount)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteRecord.mutate(record.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-6 pb-4">
              <TablePagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                from={pagination.from}
                to={pagination.to}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
              />
            </div>
          </div>
        )}
      </div>

      {/* Add Transaction Dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
            <DialogDescription>Record a new revenue or expense transaction</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as "revenue" | "expense" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">Revenue</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={formData.record_date} onChange={(e) => setFormData({ ...formData, record_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Input placeholder="e.g. Sales, Rent, Marketing..." value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input type="number" placeholder="0.00" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Optional description..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addRecord.isPending} className="bg-gradient-financial text-white hover:opacity-90">
              {addRecord.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Journal Entries Tab ─────────────────────────────────────────────────────

function JournalEntriesTab() {
  const { data: entries = [], isLoading } = useJournalEntries();
  const { data: glAccounts = [] } = useGLAccounts();
  const postJournal = usePostJournal();
  const reverseJournal = useReverseJournal();
  const pl = useProfitLoss();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [memo, setMemo] = useState("");
  const [journalLines, setJournalLines] = useState<
    { gl_account_id: string; debit: string; credit: string; description: string }[]
  >([
    { gl_account_id: "", debit: "", credit: "", description: "" },
    { gl_account_id: "", debit: "", credit: "", description: "" },
  ]);

  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  type SortField = "entry_date" | "source_type" | "total";
  type SortDir = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("entry_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40 inline" />;
    return sortDir === "asc" ? <ArrowUp className="ml-1 h-3 w-3 inline" /> : <ArrowDown className="ml-1 h-3 w-3 inline" />;
  };

  const enrichedEntries = useMemo(() => {
    return entries.map((e) => ({
      ...e,
      totalDebit: e.journal_lines.reduce((s, l) => s + l.debit, 0),
      totalCredit: e.journal_lines.reduce((s, l) => s + l.credit, 0),
    }));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return enrichedEntries
      .filter((e) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch = !q ||
          (e.memo || "").toLowerCase().includes(q) ||
          e.source_type.toLowerCase().includes(q) ||
          (e.document_sequence_number || "").toLowerCase().includes(q);
        const matchesSource = sourceFilter === "all" || e.source_type === sourceFilter;
        const matchesStatus = statusFilter === "all" || e.status === statusFilter;
        return matchesSearch && matchesSource && matchesStatus;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === "entry_date") cmp = a.entry_date.localeCompare(b.entry_date);
        else if (sortField === "source_type") cmp = a.source_type.localeCompare(b.source_type);
        else if (sortField === "total") cmp = a.totalDebit - b.totalDebit;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [enrichedEntries, searchQuery, sourceFilter, statusFilter, sortField, sortDir]);

  const pagination = usePagination(filteredEntries, 15);

  const sourceTypes = useMemo(() => {
    const set = new Set(entries.map((e) => e.source_type));
    return Array.from(set).sort();
  }, [entries]);

  const hasActiveFilters = searchQuery || sourceFilter !== "all" || statusFilter !== "all";

  const resetForm = () => {
    setEntryDate(format(new Date(), "yyyy-MM-dd"));
    setMemo("");
    setJournalLines([
      { gl_account_id: "", debit: "", credit: "", description: "" },
      { gl_account_id: "", debit: "", credit: "", description: "" },
    ]);
  };

  const addLine = () => {
    setJournalLines((prev) => [...prev, { gl_account_id: "", debit: "", credit: "", description: "" }]);
  };

  const removeLine = (index: number) => {
    if (journalLines.length <= 2) return;
    setJournalLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: string, value: string) => {
    setJournalLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  };

  const handlePostJournal = () => {
    const lines = journalLines
      .filter((l) => l.gl_account_id)
      .map((l) => ({
        gl_account_id: l.gl_account_id,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description || undefined,
      }));

    if (lines.length < 2) {
      toast.error("At least 2 journal lines are required.");
      return;
    }

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      toast.error(`Entry must balance. Debit: ${formatAmount(totalDebit)}, Credit: ${formatAmount(totalCredit)}`);
      return;
    }

    postJournal.mutate(
      { date: entryDate, memo, lines },
      { onSuccess: () => { setDialogOpen(false); resetForm(); } }
    );
  };

  const lineTotal = journalLines.reduce(
    (acc, l) => ({
      debit: acc.debit + (parseFloat(l.debit) || 0),
      credit: acc.credit + (parseFloat(l.credit) || 0),
    }),
    { debit: 0, credit: 0 }
  );
  const isBalanced = Math.abs(lineTotal.debit - lineTotal.credit) < 0.01;

  return (
    <div className="space-y-6">
      {/* KPIs from GL */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Revenue (GL)"
          value={formatAmount(pl.totalRevenue)}
          change={{ value: `${pl.revenue.length} accounts`, type: "increase" }}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          title="Total Expenses (GL)"
          value={formatAmount(pl.totalExpenses)}
          change={{ value: `${pl.expenses.length} accounts`, type: "decrease" }}
          icon={<ArrowDownRight className="h-4 w-4" />}
        />
        <StatCard
          title="Net Income (GL)"
          value={formatAmount(pl.netIncome)}
          change={{
            value: pl.totalRevenue > 0 ? `${pl.grossMargin.toFixed(1)}% margin` : "0%",
            type: pl.netIncome >= 0 ? "increase" : "decrease",
          }}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          title="Journal Entries"
          value={String(entries.length)}
          icon={<BookOpen className="h-4 w-4" />}
        />
      </div>

      {/* Journal Entries Table */}
      <div className="rounded-xl border bg-card shadow-card">
        <div className="flex flex-col gap-4 border-b p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Journal Entries</h3>
              <p className="text-sm text-muted-foreground">All GL transactions from invoices, bills, expenses, payroll & manual entries</p>
            </div>
            <Button
              className="bg-gradient-financial text-white hover:opacity-90"
              onClick={() => { resetForm(); setDialogOpen(true); }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Post Journal Entry
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search memo, source, ref…"
                className="pl-9"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); pagination.setPage(1); }}
              />
            </div>
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); pagination.setPage(1); }}>
              <SelectTrigger className="w-[140px] h-9 text-sm">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {sourceTypes.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); pagination.setPage(1); }}>
              <SelectTrigger className="w-[120px] h-9 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="text-muted-foreground"
                onClick={() => { setSearchQuery(""); setSourceFilter("all"); setStatusFilter("all"); pagination.setPage(1); }}
              >
                <X className="h-3.5 w-3.5 mr-1" />Clear
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <BookOpen className="h-10 w-10 mb-2 opacity-40" />
            <p>{entries.length === 0 ? 'No journal entries yet. Click "Post Journal Entry" to create one.' : "No entries match your filters."}</p>
          </div>
        ) : (
          <div className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("entry_date")}>
                    Date <SortIcon field="entry_date" />
                  </TableHead>
                  <TableHead>Ref #</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("source_type")}>
                    Source <SortIcon field="source_type" />
                  </TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("total")}>
                    Debit <SortIcon field="total" />
                  </TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="w-[60px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map((entry) => (
                  <TableRow key={entry.id} className="group hover:bg-secondary/50">
                    <TableCell className="text-foreground">{entry.entry_date}</TableCell>
                    <TableCell className="text-foreground text-xs font-mono">
                      {entry.document_sequence_number || entry.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {entry.source_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-foreground">
                      {entry.memo || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          entry.status === "posted"
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-yellow-500/30 bg-yellow-500/10 text-yellow-600"
                        }
                      >
                        {entry.status}
                      </Badge>
                      {entry.is_reversal && (
                        <Badge variant="outline" className="ml-1 text-xs border-destructive/30 bg-destructive/10 text-destructive">
                          reversal
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-foreground">
                      {formatAmount(entry.totalDebit)}
                    </TableCell>
                    <TableCell className="text-right text-foreground">
                      {formatAmount(entry.totalCredit)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {entry.journal_lines.length}
                    </TableCell>
                    <TableCell>
                      {entry.status === "posted" && !entry.is_reversal && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Reverse"
                          onClick={() => reverseJournal.mutate(entry.id)}
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-6 pb-4">
              <TablePagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                from={pagination.from}
                to={pagination.to}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
              />
            </div>
          </div>
        )}
      </div>

      {/* Post Journal Entry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Post Journal Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Entry Date</Label>
                <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Memo</Label>
                <Input placeholder="Journal memo..." value={memo} onChange={(e) => setMemo(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Journal Lines</Label>
                <Button variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-3 w-3 mr-1" /> Add Line
                </Button>
              </div>

              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">GL Account</TableHead>
                      <TableHead className="w-[20%]">Debit (₹)</TableHead>
                      <TableHead className="w-[20%]">Credit (₹)</TableHead>
                      <TableHead className="w-[15%]">Note</TableHead>
                      <TableHead className="w-[5%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journalLines.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell className="p-1">
                          <Select value={line.gl_account_id} onValueChange={(v) => updateLine(i, "gl_account_id", v)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                            <SelectContent>
                              {glAccounts.map((a) => (
                                <SelectItem key={a.id} value={a.id} className="text-xs">
                                  {a.code} - {a.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1">
                          <Input type="number" className="h-8 text-xs" placeholder="0.00" value={line.debit} onChange={(e) => updateLine(i, "debit", e.target.value)} />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input type="number" className="h-8 text-xs" placeholder="0.00" value={line.credit} onChange={(e) => updateLine(i, "credit", e.target.value)} />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input className="h-8 text-xs" placeholder="Note" value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} />
                        </TableCell>
                        <TableCell className="p-1">
                          {journalLines.length > 2 && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLine(i)}>
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-medium">
                      <TableCell className="p-1 text-xs text-right">Totals</TableCell>
                      <TableCell className="p-1 text-xs">{formatAmount(lineTotal.debit)}</TableCell>
                      <TableCell className="p-1 text-xs">{formatAmount(lineTotal.credit)}</TableCell>
                      <TableCell colSpan={2} className="p-1">
                        <Badge variant="outline" className={isBalanced ? "border-success/30 bg-success/10 text-success text-xs" : "border-destructive/30 bg-destructive/10 text-destructive text-xs"}>
                          {isBalanced ? "Balanced ✓" : `Diff: ${formatAmount(Math.abs(lineTotal.debit - lineTotal.credit))}`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handlePostJournal}
              disabled={postJournal.isPending || !isBalanced}
              className="bg-gradient-financial text-white hover:opacity-90"
            >
              {postJournal.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Post Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Accounting() {
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();

  if (isCheckingRole) {
    return (
      <MainLayout title="Accounting">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="text-muted-foreground">Checking permissions...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!hasFinanceAccess) {
    return (
      <AccessDenied
        message="Finance Access Required"
        description="You need finance or admin role to access the Accounting module."
      />
    );
  }

  return (
    <MainLayout title="Accounting" subtitle="Manage transactions and general ledger entries">
      <div className="space-y-6 animate-fade-in">
        <OnboardingBanner />

        <Tabs defaultValue="transactions" className="w-full">
          <TabsList className="w-full max-w-md">
            <TabsTrigger value="transactions" className="flex-1 flex items-center justify-center gap-1.5">
              <Receipt className="h-4 w-4 hidden sm:block flex-shrink-0" />
              <span>Transactions</span>
            </TabsTrigger>
            <TabsTrigger value="journal" className="flex-1 flex items-center justify-center gap-1.5">
              <BookOpen className="h-4 w-4 hidden sm:block flex-shrink-0" />
              <span>Journal Entries</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="mt-6">
            <TransactionsTab />
          </TabsContent>

          <TabsContent value="journal" className="mt-6">
            <JournalEntriesTab />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
