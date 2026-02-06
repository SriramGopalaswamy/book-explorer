import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Building2, ArrowUpRight, ArrowDownLeft, Plus, Search, RefreshCw, CreditCard, Wallet } from "lucide-react";

const bankAccounts = [
  { id: 1, name: "HDFC Business Account", type: "Current", balance: 2450000, accountNo: "****4521", status: "Active" },
  { id: 2, name: "ICICI Savings", type: "Savings", balance: 850000, accountNo: "****7832", status: "Active" },
  { id: 3, name: "SBI Fixed Deposit", type: "FD", balance: 5000000, accountNo: "****1294", status: "Active" },
];

const recentTransactions = [
  { id: 1, date: "2024-01-15", description: "Client Payment - ABC Corp", type: "credit", amount: 250000, account: "HDFC Business" },
  { id: 2, date: "2024-01-14", description: "Salary Disbursement", type: "debit", amount: 450000, account: "HDFC Business" },
  { id: 3, date: "2024-01-14", description: "Vendor Payment - XYZ Ltd", type: "debit", amount: 85000, account: "ICICI Savings" },
  { id: 4, date: "2024-01-13", description: "Invoice #INV-2024-042", type: "credit", amount: 175000, account: "HDFC Business" },
  { id: 5, date: "2024-01-12", description: "Office Rent", type: "debit", amount: 120000, account: "HDFC Business" },
  { id: 6, date: "2024-01-12", description: "Interest Credit", type: "credit", amount: 12500, account: "SBI Fixed Deposit" },
];

const formatCurrency = (value: number) => {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  return `₹${value.toLocaleString("en-IN")}`;
};

export default function Banking() {
  const totalBalance = bankAccounts.reduce((sum, acc) => sum + acc.balance, 0);

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
            <p className="text-xs text-muted-foreground">Across {bankAccounts.length} accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Month Inflow</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(437500)}</div>
            <p className="text-xs text-muted-foreground">+12% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Month Outflow</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(655000)}</div>
            <p className="text-xs text-muted-foreground">-8% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Transfers</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">Worth ₹2.4L</p>
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
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync
            </Button>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {bankAccounts.map((account) => (
              <Card key={account.id} className="border-2 hover:border-primary/50 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                      {account.status}
                    </Badge>
                  </div>
                  <h3 className="font-semibold">{account.name}</h3>
                  <p className="text-sm text-muted-foreground mb-2">{account.type} • {account.accountNo}</p>
                  <p className="text-xl font-bold">{formatCurrency(account.balance)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
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
              <Input placeholder="Search transactions..." className="pl-9 w-64" />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="credit">Credits Only</SelectItem>
                <SelectItem value="debit">Debits Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
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
              {recentTransactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="font-medium">{tx.date}</TableCell>
                  <TableCell>{tx.description}</TableCell>
                  <TableCell>{tx.account}</TableCell>
                  <TableCell>
                    <Badge variant={tx.type === "credit" ? "default" : "secondary"} className={tx.type === "credit" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                      {tx.type === "credit" ? (
                        <ArrowDownLeft className="h-3 w-3 mr-1" />
                      ) : (
                        <ArrowUpRight className="h-3 w-3 mr-1" />
                      )}
                      {tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right font-medium ${tx.type === "credit" ? "text-green-600" : "text-red-600"}`}>
                    {tx.type === "credit" ? "+" : "-"}{formatCurrency(tx.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
