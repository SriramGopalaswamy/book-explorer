import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { Plus, RefreshCw, Pause, CheckCircle, XCircle, CalendarClock, Play } from "lucide-react";
import {
  useRecurringTransactions, useCreateRecurringTransaction, useUpdateRecurringTransactionStatus,
  useExecuteRecurringTransactions, RecurringTransaction,
} from "@/hooks/useRecurringTransactions";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  paused: "bg-yellow-500/20 text-yellow-400",
  completed: "bg-blue-500/20 text-blue-400",
  cancelled: "bg-destructive/20 text-destructive",
};

const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "yearly"];

export default function RecurringTransactionsPage() {
  const { data: transactions = [], isLoading } = useRecurringTransactions();
  const createTx = useCreateRecurringTransaction();
  const updateStatus = useUpdateRecurringTransactionStatus();
  const executeTx = useExecuteRecurringTransactions();

  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    frequency: "monthly",
    amount: "",
    currency: "INR",
    start_date: new Date().toISOString().split("T")[0],
    end_date: "",
    notes: "",
  });

  const stats = {
    total: transactions.length,
    active: transactions.filter((t) => t.status === "active").length,
    paused: transactions.filter((t) => t.status === "paused").length,
    monthly: transactions.filter((t) => t.frequency === "monthly" && t.status === "active").length,
  };

  const handleCreate = () => {
    createTx.mutate(
      {
        name: form.name,
        description: form.description || undefined,
        frequency: form.frequency,
        amount: parseFloat(form.amount) || 0,
        currency: form.currency,
        start_date: form.start_date,
        end_date: form.end_date || undefined,
        notes: form.notes || undefined,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setForm({ name: "", description: "", frequency: "monthly", amount: "", currency: "INR", start_date: new Date().toISOString().split("T")[0], end_date: "", notes: "" });
        },
      }
    );
  };

  return (
    <MainLayout title="Recurring Transactions" subtitle="Automate repeating journal entries">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => executeTx.mutate()} disabled={executeTx.isPending}>
              <Play className="h-4 w-4 mr-2" /> {executeTx.isPending ? "Running…" : "Run Due Now"}
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Recurring
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CalendarClock className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.active}</p><p className="text-xs text-muted-foreground">Active</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Pause className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.paused}</p><p className="text-xs text-muted-foreground">Paused</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><RefreshCw className="h-8 w-8 text-blue-500" /><div><p className="text-2xl font-bold text-foreground">{stats.monthly}</p><p className="text-xs text-muted-foreground">Monthly Active</p></div></div></CardContent></Card>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border bg-card">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : transactions.filter(t => statusFilter === "all" || t.status === statusFilter).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No recurring transactions match the filter.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.filter(t => statusFilter === "all" || t.status === statusFilter).map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <div className="font-semibold text-foreground">{tx.name}</div>
                      {tx.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{tx.description}</div>}
                    </TableCell>
                    <TableCell className="capitalize">{tx.frequency}</TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(tx.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="font-mono">{tx.currency}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {tx.next_run_date ? format(new Date(tx.next_run_date), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[tx.status] || ""}>{tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}</Badge>
                    </TableCell>
                    <TableCell>
                      {tx.status === "active" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: tx.id, status: "paused" })}>
                          <Pause className="h-3 w-3 mr-1" /> Pause
                        </Button>
                      )}
                      {tx.status === "paused" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: tx.id, status: "active" })}>
                          <RefreshCw className="h-3 w-3 mr-1" /> Resume
                        </Button>
                      )}
                      {(tx.status === "active" || tx.status === "paused") && (
                        <Button size="sm" variant="ghost" className="text-destructive ml-1" onClick={() => updateStatus.mutate({ id: tx.id, status: "cancelled" })}>
                          <XCircle className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Create Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Recurring Transaction</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Monthly Rent" />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Frequency *</Label>
                  <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => <SelectItem key={f} value={f} className="capitalize">{f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["INR", "USD", "EUR", "GBP"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Amount *</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" min={0} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date *</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div>
                  <Label>End Date (optional)</Label>
                  <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createTx.isPending || !form.name || !form.amount}>
                {createTx.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
