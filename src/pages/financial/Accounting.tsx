import { MainLayout } from "@/components/layout/MainLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Wallet,
} from "lucide-react";

const transactions = [
  {
    id: "TXN-001",
    date: "2024-01-15",
    description: "Client Payment - Acme Corp",
    type: "credit",
    amount: "₹2,50,000",
    category: "Revenue",
    status: "completed",
  },
  {
    id: "TXN-002",
    date: "2024-01-14",
    description: "Office Rent Payment",
    type: "debit",
    amount: "₹75,000",
    category: "Expense",
    status: "completed",
  },
  {
    id: "TXN-003",
    date: "2024-01-13",
    description: "Software Subscription",
    type: "debit",
    amount: "₹15,000",
    category: "Expense",
    status: "pending",
  },
  {
    id: "TXN-004",
    date: "2024-01-12",
    description: "Consulting Fee - XYZ Ltd",
    type: "credit",
    amount: "₹1,80,000",
    category: "Revenue",
    status: "completed",
  },
  {
    id: "TXN-005",
    date: "2024-01-11",
    description: "Employee Reimbursement",
    type: "debit",
    amount: "₹8,500",
    category: "Expense",
    status: "completed",
  },
];

export default function Accounting() {
  return (
    <MainLayout
      title="Accounting"
      subtitle="Manage your financial transactions and ledgers"
    >
      <div className="space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Assets"
            value="₹1.2Cr"
            change={{ value: "5.2%", type: "increase" }}
            icon={<Wallet className="h-4 w-4" />}
          />
          <StatCard
            title="Total Liabilities"
            value="₹45L"
            change={{ value: "2.1%", type: "decrease" }}
            icon={<ArrowDownRight className="h-4 w-4" />}
          />
          <StatCard
            title="Net Income"
            value="₹28.5L"
            change={{ value: "12.3%", type: "increase" }}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            title="Pending Entries"
            value="12"
            icon={<BookOpen className="h-4 w-4" />}
          />
        </div>

        {/* Transactions Table */}
        <div className="rounded-xl border bg-card shadow-card">
          <div className="flex items-center justify-between border-b p-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Recent Transactions
              </h3>
              <p className="text-sm text-muted-foreground">
                View and manage all financial transactions
              </p>
            </div>
            <Button className="bg-gradient-financial text-white hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" />
              Add Entry
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((txn) => (
                <TableRow key={txn.id} className="cursor-pointer hover:bg-secondary/50">
                  <TableCell className="font-medium">{txn.id}</TableCell>
                  <TableCell>{txn.date}</TableCell>
                  <TableCell>{txn.description}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        txn.type === "credit"
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-destructive/30 bg-destructive/10 text-destructive"
                      }
                    >
                      {txn.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {txn.type === "credit" ? (
                        <ArrowUpRight className="h-4 w-4 text-success" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-destructive" />
                      )}
                      <span
                        className={
                          txn.type === "credit" ? "text-success" : "text-destructive"
                        }
                      >
                        {txn.amount}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={txn.status === "completed" ? "default" : "secondary"}
                    >
                      {txn.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </MainLayout>
  );
}
