import { useState } from "react";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { MainLayout } from "@/components/layout/MainLayout";
import { BankStatementReconciliation } from "@/components/banking/BankStatementReconciliation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, ArrowUpRight, ArrowDownLeft, Plus, Search, CreditCard, Wallet, MoreHorizontal, Trash2, X, ArrowUpDown, ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const } },
};
import {
  useBankAccounts,
  useBankTransactions,
  useMonthlyTransactionStats,
  useCreateBankAccount,
  useCreateTransaction,
  useDeleteBankAccount,
  BankAccount,
} from "@/hooks/useBanking";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";

const formatCurrency = (value: number) => {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  return `₹${value.toLocaleString("en-IN")}`;
};

export default function Banking() {
  // Role-based access control
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  
  const { data: accounts = [], isLoading: accountsLoading } = useBankAccounts();
  const { data: transactions = [], isLoading: transactionsLoading } = useBankTransactions();
  const { data: monthlyStats } = useMonthlyTransactionStats();
  const createAccount = useCreateBankAccount();
  const createTransaction = useCreateTransaction();
  const deleteAccount = useDeleteBankAccount();

  // All state must be before early returns
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Sort state
  type SortField = "transaction_date" | "category" | "amount";
  type SortDir = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("transaction_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40 inline" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 h-3 w-3 inline" />
      : <ArrowDown className="ml-1 h-3 w-3 inline" />;
  };

  const [accountForm, setAccountForm] = useState({
    name: "",
    account_type: "Current" as BankAccount["account_type"],
    account_number: "",
    balance: "",
    bank_name: "",
  });

  const [transactionForm, setTransactionForm] = useState({
    account_id: "",
    transaction_type: "credit" as "credit" | "debit",
    amount: "",
    description: "",
    category: "",
    transaction_date: new Date().toISOString().split("T")[0],
  });

  const totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance), 0);

  const filteredTransactions = transactions
    .filter((tx) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || tx.description.toLowerCase().includes(q) || (tx.category || "").toLowerCase().includes(q);
      const matchesType = typeFilter === "all" || tx.transaction_type === typeFilter;
      const matchesFrom = !dateFrom || tx.transaction_date >= dateFrom;
      const matchesTo = !dateTo || tx.transaction_date <= dateTo;
      return matchesSearch && matchesType && matchesFrom && matchesTo;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === "transaction_date") cmp = a.transaction_date.localeCompare(b.transaction_date);
      else if (sortField === "category") cmp = (a.category || "").localeCompare(b.category || "");
      else if (sortField === "amount") cmp = Number(a.amount) - Number(b.amount);
      return sortDir === "asc" ? cmp : -cmp;
    });

  const pagination = usePagination(filteredTransactions, 10);

  const hasActiveFilters = searchQuery || typeFilter !== "all" || dateFrom || dateTo;

  // Show loading state while checking permissions
  if (isCheckingRole) {
    return (
      <MainLayout title="Banking">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Checking permissions...</p>
          </div>
        </div>
      </MainLayout>
    );
  }
  
  // Deny access if user doesn't have finance role
  if (!hasFinanceAccess) {
    return (
      <AccessDenied 
        message="Finance Access Required"
        description="You need finance or admin role to access the Banking module. Contact your administrator for access."
      />
    );
  }

  const handleCreateAccount = () => {
    if (!accountForm.name || !accountForm.account_number || !accountForm.balance) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    createAccount.mutate(
      {
        name: accountForm.name,
        account_type: accountForm.account_type,
        account_number: accountForm.account_number,
        balance: parseFloat(accountForm.balance),
        bank_name: accountForm.bank_name || undefined,
      },
      {
        onSuccess: () => {
          setAccountForm({ name: "", account_type: "Current", account_number: "", balance: "", bank_name: "" });
          setIsAccountDialogOpen(false);
        },
      }
    );
  };

  const handleCreateTransaction = () => {
    if (!transactionForm.account_id || !transactionForm.amount || !transactionForm.description) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    createTransaction.mutate(
      {
        account_id: transactionForm.account_id,
        transaction_type: transactionForm.transaction_type,
        amount: parseFloat(transactionForm.amount),
        description: transactionForm.description,
        category: transactionForm.category || undefined,
        transaction_date: transactionForm.transaction_date,
      },
      {
        onSuccess: () => {
          setTransactionForm({
            account_id: "",
            transaction_type: "credit",
            amount: "",
            description: "",
            category: "",
            transaction_date: new Date().toISOString().split("T")[0],
          });
          setIsTransactionDialogOpen(false);
        },
      }
    );
  };

  return (
    <MainLayout title="Banking" subtitle="Manage bank accounts and transactions">
      <Tabs defaultValue="accounts" className="space-y-6">
        <TabsList className="glass-morphism">
          <TabsTrigger value="accounts">Accounts & Transactions</TabsTrigger>
          <TabsTrigger value="reconcile" className="gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            AI Reconciliation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-0">
      {/* Stats Cards */}
      <motion.div
        className="grid gap-4 md:grid-cols-4 mb-6"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {[
          { label: "Total Balance", value: formatCurrency(totalBalance), sub: `Across ${accounts.length} accounts`, icon: Wallet, iconClass: "text-primary" },
          { label: "This Month Inflow", value: formatCurrency(monthlyStats?.inflow || 0), sub: "Credits received", icon: ArrowDownLeft, iconClass: "text-green-500", valueClass: "text-green-500" },
          { label: "This Month Outflow", value: formatCurrency(monthlyStats?.outflow || 0), sub: "Debits paid", icon: ArrowUpRight, iconClass: "text-red-500", valueClass: "text-red-500" },
          { label: "Accounts", value: String(accounts.length), sub: "Connected accounts", icon: CreditCard, iconClass: "text-primary" },
        ].map((stat) => (
          <motion.div key={stat.label} variants={fadeUp}>
            <Card className="glass-card glow-on-hover group transition-all duration-300 hover:-translate-y-1">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:shadow-glow transition-shadow">
                  <stat.icon className={`h-4 w-4 ${stat.iconClass}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stat.valueClass || ""}`}>{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Bank Accounts */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.3 }}>
      <Card className="mb-6 glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-gradient-primary">Bank Accounts</CardTitle>
            <CardDescription>Connected bank accounts and balances</CardDescription>
          </div>
          <div className="flex gap-2">
            <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Account
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Bank Account</DialogTitle>
                  <DialogDescription>Enter the details of your bank account</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Account Name *</Label>
                    <Input
                      placeholder="e.g., HDFC Business Account"
                      value={accountForm.name}
                      onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Account Type *</Label>
                      <Select
                        value={accountForm.account_type}
                        onValueChange={(v) => setAccountForm({ ...accountForm, account_type: v as BankAccount["account_type"] })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Current">Current</SelectItem>
                          <SelectItem value="Savings">Savings</SelectItem>
                          <SelectItem value="FD">Fixed Deposit</SelectItem>
                          <SelectItem value="Credit">Credit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Bank Name</Label>
                      <Input
                        placeholder="e.g., HDFC Bank"
                        value={accountForm.bank_name}
                        onChange={(e) => setAccountForm({ ...accountForm, bank_name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Account Number *</Label>
                      <Input
                        placeholder="Last 4 digits"
                        value={accountForm.account_number}
                        onChange={(e) => setAccountForm({ ...accountForm, account_number: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Current Balance (₹) *</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={accountForm.balance}
                        onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAccountDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateAccount} disabled={createAccount.isPending}>
                    {createAccount.isPending ? "Adding..." : "Add Account"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {accountsLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">No bank accounts added yet</p>
            </div>
          ) : (
            <motion.div className="grid gap-4 md:grid-cols-3" variants={staggerContainer} initial="hidden" animate="show">
              {accounts.map((account) => (
                <motion.div key={account.id} variants={fadeUp}>
                <Card className="glass-morphism glow-on-hover group transition-all duration-300 hover:-translate-y-1 hover:shadow-glow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shimmer group-hover:shadow-glow transition-shadow">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteAccount.mutate(account.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <h3 className="font-semibold">{account.name}</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      {account.account_type} • ****{account.account_number.slice(-4)}
                    </p>
                    <p className="text-xl font-bold">{formatCurrency(Number(account.balance))}</p>
                    <Badge variant="outline" className="mt-2 text-success border-success/30 bg-success/10">
                      {account.status}
                    </Badge>
                  </CardContent>
                </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </CardContent>
      </Card>
      </motion.div>

      {/* Recent Transactions */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.5 }}>
      <Card className="glass-card">
        <CardHeader className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-gradient-primary">Recent Transactions</CardTitle>
              <CardDescription>Latest banking activity across all accounts</CardDescription>
            </div>
            <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Transaction
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Transaction</DialogTitle>
                  <DialogDescription>Add a new transaction to your account</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Account *</Label>
                    <Select
                      value={transactionForm.account_id}
                      onValueChange={(v) => setTransactionForm({ ...transactionForm, account_id: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Type *</Label>
                      <Select
                        value={transactionForm.transaction_type}
                        onValueChange={(v) => setTransactionForm({ ...transactionForm, transaction_type: v as "credit" | "debit" })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="credit">Credit (Inflow)</SelectItem>
                          <SelectItem value="debit">Debit (Outflow)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Amount (₹) *</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={transactionForm.amount}
                        onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Description *</Label>
                    <Input
                      placeholder="e.g., Client payment - ABC Corp"
                      value={transactionForm.description}
                      onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Category</Label>
                      <Input
                        placeholder="e.g., Sales, Rent"
                        value={transactionForm.category}
                        onChange={(e) => setTransactionForm({ ...transactionForm, category: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Date *</Label>
                      <Input
                        type="date"
                        value={transactionForm.transaction_date}
                        onChange={(e) => setTransactionForm({ ...transactionForm, transaction_date: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsTransactionDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateTransaction} disabled={createTransaction.isPending}>
                    {createTransaction.isPending ? "Adding..." : "Add Transaction"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search description, category…"
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="credit">Credits Only</SelectItem>
                <SelectItem value="debit">Debits Only</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">From</span>
              <Input
                type="date"
                className="w-36"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">To</span>
              <Input
                type="date"
                className="w-36"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => { setSearchQuery(""); setTypeFilter("all"); setDateFrom(""); setDateTo(""); pagination.setPage(1); }}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">No transactions found</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort("transaction_date")}>
                      Date <SortIcon field="transaction_date" />
                    </TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort("category")}>
                      Category <SortIcon field="category" />
                    </TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("amount")}>
                      Amount <SortIcon field="amount" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-medium">{tx.transaction_date}</TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell>{tx.bank_accounts?.name || "-"}</TableCell>
                      <TableCell>{tx.category || "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={tx.transaction_type === "credit" ? "default" : "secondary"}
                          className={tx.transaction_type === "credit" ? "bg-success/10 text-success border-success/30" : "bg-destructive/10 text-destructive border-destructive/30"}
                        >
                          {tx.transaction_type === "credit" ? (
                            <ArrowDownLeft className="h-3 w-3 mr-1" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3 mr-1" />
                          )}
                          {tx.transaction_type}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-medium ${tx.transaction_type === "credit" ? "text-success" : "text-destructive"}`}>
                        {tx.transaction_type === "credit" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="pt-4">
                <TablePagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.totalItems}
                  from={pagination.from}
                  to={pagination.to}
                  pageSize={pagination.pageSize}
                  onPageChange={pagination.setPage}
                  onPageSizeChange={(s) => { pagination.setPageSize(s); pagination.setPage(1); }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </motion.div>
        </TabsContent>

        <TabsContent value="reconcile">
          <BankStatementReconciliation accounts={accounts} />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
