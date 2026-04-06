import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// Tabs removed – Journal Entries tab moved to standalone page
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
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Wallet,
  Loader2,
  Search,
  X,
  Trash2,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { OnboardingBanner } from "@/components/dashboard/OnboardingBanner";
import {
  useFinancialRecords,
  useAddFinancialRecord,
  useDeleteFinancialRecord,
  type FinancialRecord,
} from "@/hooks/useFinancialData";
import { useCurrencies } from "@/hooks/useCurrencyAndFiling";

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
  const { data: currencies = [] } = useCurrencies();

  const [addOpen, setAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [formData, setFormData] = useState({
    type: "revenue" as "revenue" | "expense",
    category: "",
    amount: "",
    currency_code: "INR",
    exchange_rate: "",
    description: "",
    record_date: format(new Date(), "yyyy-MM-dd"),
  });

  const resetForm = () => {
    setFormData({
      type: "revenue",
      category: "",
      amount: "",
      currency_code: "INR",
      exchange_rate: "",
      description: "",
      record_date: format(new Date(), "yyyy-MM-dd"),
    });
  };

  const handleAdd = async () => {
    const amount = Number(formData.amount);
    if (!formData.category || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Please fill in category and a valid amount.");
      return;
    }

    const isNonINR = formData.currency_code && formData.currency_code !== "INR";
    const exchangeRate = Number(formData.exchange_rate);
    if (isNonINR && (!Number.isFinite(exchangeRate) || exchangeRate <= 0)) {
      toast.error("Please enter a valid exchange rate for the selected currency.");
      return;
    }

    try {
      await addRecord.mutateAsync({
        type: formData.type,
        category: formData.category,
        amount,
        description: formData.description || null,
        record_date: formData.record_date,
        currency_code: formData.currency_code || "INR",
        exchange_rate: isNonINR ? exchangeRate : 1,
      });

      setAddOpen(false);
      resetForm();
    } catch {
      // onError in the mutation handles user-facing error toasts
    }
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
          title="Total Spending"
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={formData.currency_code} onValueChange={(v) => setFormData({ ...formData, currency_code: v, exchange_rate: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR — Indian Rupee</SelectItem>
                    {currencies.filter((c) => c.code !== "INR").map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input type="number" placeholder="0.00" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} />
              </div>
            </div>
            {formData.currency_code && formData.currency_code !== "INR" && (
              <div className="space-y-2">
                <Label>Exchange Rate (1 {formData.currency_code} = ? INR) *</Label>
                <Input type="number" placeholder="e.g. 83.50" value={formData.exchange_rate} onChange={(e) => setFormData({ ...formData, exchange_rate: e.target.value })} />
              </div>
            )}
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
        <TransactionsTab />
      </div>
    </MainLayout>
  );
}
