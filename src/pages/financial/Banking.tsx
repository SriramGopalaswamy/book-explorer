import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
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
import { Building2, ArrowUpRight, ArrowDownLeft, Plus, Search, RefreshCw, CreditCard, Wallet, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  useBankAccounts,
  useBankTransactions,
  useMonthlyTransactionStats,
  useCreateBankAccount,
  useCreateTransaction,
  useDeleteBankAccount,
  BankAccount,
} from "@/hooks/useBanking";

const formatCurrency = (value: number) => {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  return `₹${value.toLocaleString("en-IN")}`;
};

export default function Banking() {
  const { data: accounts = [], isLoading: accountsLoading } = useBankAccounts();
  const { data: transactions = [], isLoading: transactionsLoading } = useBankTransactions();
  const { data: monthlyStats } = useMonthlyTransactionStats();
  const createAccount = useCreateBankAccount();
  const createTransaction = useCreateTransaction();
  const deleteAccount = useDeleteBankAccount();

  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

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

  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch = tx.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || tx.transaction_type === typeFilter;
    return matchesSearch && matchesType;
  });

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
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBalance)}</div>
            <p className="text-xs text-muted-foreground">Across {accounts.length} accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Month Inflow</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(monthlyStats?.inflow || 0)}</div>
            <p className="text-xs text-muted-foreground">Credits received</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Month Outflow</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(monthlyStats?.outflow || 0)}</div>
            <p className="text-xs text-muted-foreground">Debits paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Accounts</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accounts.length}</div>
            <p className="text-xs text-muted-foreground">Connected accounts</p>
          </CardContent>
        </Card>
      </div>

      {/* Bank Accounts */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Bank Accounts</CardTitle>
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
            <div className="grid gap-4 md:grid-cols-3">
              {accounts.map((account) => (
                <Card key={account.id} className="border-2 hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
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
                    <Badge variant="outline" className="mt-2 text-green-600 border-green-200 bg-green-50">
                      {account.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Latest banking activity across all accounts</CardDescription>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                className="pl-9 w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="credit">Credits Only</SelectItem>
                <SelectItem value="debit">Debits Only</SelectItem>
              </SelectContent>
            </Select>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-medium">{tx.transaction_date}</TableCell>
                    <TableCell>{tx.description}</TableCell>
                    <TableCell>{tx.bank_accounts?.name || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={tx.transaction_type === "credit" ? "default" : "secondary"}
                        className={tx.transaction_type === "credit" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}
                      >
                        {tx.transaction_type === "credit" ? (
                          <ArrowDownLeft className="h-3 w-3 mr-1" />
                        ) : (
                          <ArrowUpRight className="h-3 w-3 mr-1" />
                        )}
                        {tx.transaction_type}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${tx.transaction_type === "credit" ? "text-green-600" : "text-red-600"}`}>
                      {tx.transaction_type === "credit" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
