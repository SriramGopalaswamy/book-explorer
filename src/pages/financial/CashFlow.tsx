import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, ArrowUpRight, ArrowDownLeft, Calendar, Plus, MoreHorizontal, Check, Trash2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "@/hooks/use-toast";
import { useCashFlowData } from "@/hooks/useBanking";
import {
  useScheduledPayments,
  useCreateScheduledPayment,
  useUpdatePaymentStatus,
  useDeleteScheduledPayment,
  useCashFlowSummary,
  ScheduledPayment,
} from "@/hooks/useCashFlow";
import { useExpenseBreakdown } from "@/hooks/useFinancialData";
import { useCurrentRole } from "@/hooks/useRoles";


const formatCurrency = (value: number) => {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  return `₹${value.toLocaleString("en-IN")}`;
};

export default function CashFlow() {
  const { data: currentRole, isLoading: isCheckingRole } = useCurrentRole();
  
  const { data: cashFlowData = [], isLoading: cashFlowLoading } = useCashFlowData(6);
  const { data: summary, isLoading: summaryLoading } = useCashFlowSummary();
  const { data: expenseData = [] } = useExpenseBreakdown();
  const { data: payments = [], isLoading: paymentsLoading } = useScheduledPayments();
  const createPayment = useCreateScheduledPayment();
  const updateStatus = useUpdatePaymentStatus();
  const deletePayment = useDeleteScheduledPayment();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    due_date: "",
    payment_type: "outflow" as "inflow" | "outflow",
    category: "",
    recurring: false,
  });

  // Show loading state while checking permissions
  if (isCheckingRole) {
    return (
      <MainLayout title="Cash Flow">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  const handleCreatePayment = () => {
    if (!formData.name || !formData.amount || !formData.due_date) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    createPayment.mutate(
      {
        name: formData.name,
        amount: parseFloat(formData.amount),
        due_date: formData.due_date,
        payment_type: formData.payment_type,
        category: formData.category || undefined,
        recurring: formData.recurring,
      },
      {
        onSuccess: () => {
          setFormData({ name: "", amount: "", due_date: "", payment_type: "outflow", category: "", recurring: false });
          setIsDialogOpen(false);
        },
      }
    );
  };

  return (
    <MainLayout title="Cash Flow" subtitle="Track and forecast your cash position">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Cash Flow</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${(summary?.netCashFlow || 0) >= 0 ? "text-success" : "text-destructive"}`}>
                  {(summary?.netCashFlow || 0) >= 0 ? "+" : ""}{formatCurrency(summary?.netCashFlow || 0)}
                </div>
                <p className="text-xs text-muted-foreground">Last 6 months</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Inflows</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(summary?.totalInflow || 0)}</div>
                <p className="text-xs text-success">Credits received</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Outflows</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(summary?.totalOutflow || 0)}</div>
                <p className="text-xs text-destructive">Debits paid</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Runway</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{summary?.runway || 0} months</div>
                <p className="text-xs text-muted-foreground">At current burn rate</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        {/* Cash Flow Chart */}
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Cash Flow Trend</CardTitle>
              <CardDescription>Monthly inflows vs outflows</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {cashFlowLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashFlowData}>
                    <defs>
                      <linearGradient id="colorInflow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorOutflow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => `₹${value / 100000}L`} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Area type="monotone" dataKey="inflow" stroke="hsl(var(--success))" fillOpacity={1} fill="url(#colorInflow)" name="Inflow" />
                    <Area type="monotone" dataKey="outflow" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#colorOutflow)" name="Outflow" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Breakdown</CardTitle>
            <CardDescription>Spending by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {expenseData.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No expense data</p>
              ) : (
                expenseData.map((item) => {
                  const total = expenseData.reduce((sum, i) => sum + i.value, 0);
                  const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
                  return (
                    <div key={item.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="text-sm text-muted-foreground">{percentage}%</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${percentage}%`, backgroundColor: item.color }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{formatCurrency(item.value)}</p>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Payments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Upcoming Payments</CardTitle>
            <CardDescription>Scheduled inflows and outflows</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Schedule Payment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule Payment</DialogTitle>
                <DialogDescription>Add a scheduled payment or expected income</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Name *</Label>
                  <Input
                    placeholder="e.g., Salary Disbursement"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Type *</Label>
                    <Select
                      value={formData.payment_type}
                      onValueChange={(v) => setFormData({ ...formData, payment_type: v as "inflow" | "outflow" })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outflow">Outflow (Payment)</SelectItem>
                        <SelectItem value="inflow">Inflow (Expected)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Amount (₹) *</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Due Date *</Label>
                    <Input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Category</Label>
                    <Input
                      placeholder="e.g., Salaries, Rent"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreatePayment} disabled={createPayment.isPending}>
                  {createPayment.isPending ? "Adding..." : "Schedule Payment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">No scheduled payments</p>
            </div>
          ) : (
            <div className="space-y-4">
              {payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-4 rounded-lg border hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      payment.payment_type === "outflow" ? "bg-destructive/10" : "bg-success/10"
                    }`}>
                      {payment.payment_type === "outflow" ? (
                        <ArrowUpRight className="h-5 w-5 text-destructive" />
                      ) : (
                        <ArrowDownLeft className="h-5 w-5 text-success" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{payment.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(payment.due_date).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={payment.status === "scheduled" ? "default" : "secondary"}>
                      {payment.status}
                    </Badge>
                    <span className={`font-semibold ${payment.payment_type === "outflow" ? "text-destructive" : "text-success"}`}>
                      {payment.payment_type === "outflow" ? "-" : "+"}{formatCurrency(Number(payment.amount))}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => updateStatus.mutate({ id: payment.id, status: "completed" })}>
                          <Check className="mr-2 h-4 w-4" />
                          Mark Completed
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deletePayment.mutate(payment.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
