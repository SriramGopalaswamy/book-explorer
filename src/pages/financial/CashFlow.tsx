import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, ArrowUpRight, ArrowDownLeft, Calendar } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const cashFlowData = [
  { month: "Jul", inflow: 1200000, outflow: 950000 },
  { month: "Aug", inflow: 1350000, outflow: 1100000 },
  { month: "Sep", inflow: 1100000, outflow: 980000 },
  { month: "Oct", inflow: 1450000, outflow: 1200000 },
  { month: "Nov", inflow: 1300000, outflow: 1150000 },
  { month: "Dec", inflow: 1600000, outflow: 1400000 },
  { month: "Jan", inflow: 1250000, outflow: 1050000 },
];

const categoryBreakdown = [
  { category: "Salaries", amount: 450000, percentage: 35 },
  { category: "Rent & Utilities", amount: 180000, percentage: 14 },
  { category: "Vendor Payments", amount: 320000, percentage: 25 },
  { category: "Marketing", amount: 120000, percentage: 9 },
  { category: "Operations", amount: 150000, percentage: 12 },
  { category: "Others", amount: 65000, percentage: 5 },
];

const upcomingPayments = [
  { id: 1, name: "Salary Disbursement", date: "Jan 31, 2024", amount: 450000, status: "scheduled" },
  { id: 2, name: "Office Rent", date: "Feb 1, 2024", amount: 120000, status: "scheduled" },
  { id: 3, name: "Vendor - Tech Solutions", date: "Feb 5, 2024", amount: 85000, status: "pending" },
  { id: 4, name: "Insurance Premium", date: "Feb 10, 2024", amount: 45000, status: "scheduled" },
];

const formatCurrency = (value: number) => {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  return `₹${value.toLocaleString("en-IN")}`;
};

export default function CashFlow() {
  const totalInflow = cashFlowData.reduce((sum, d) => sum + d.inflow, 0);
  const totalOutflow = cashFlowData.reduce((sum, d) => sum + d.outflow, 0);
  const netCashFlow = totalInflow - totalOutflow;

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
            <div className="text-2xl font-bold text-green-600">+{formatCurrency(netCashFlow)}</div>
            <p className="text-xs text-muted-foreground">Last 6 months</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Inflows</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalInflow)}</div>
            <p className="text-xs text-green-600">+18% vs last period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Outflows</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalOutflow)}</div>
            <p className="text-xs text-red-600">+12% vs last period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Runway</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8.5 months</div>
            <p className="text-xs text-muted-foreground">At current burn rate</p>
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
            <Select defaultValue="6m">
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3m">Last 3 months</SelectItem>
                <SelectItem value="6m">Last 6 months</SelectItem>
                <SelectItem value="12m">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlowData}>
                  <defs>
                    <linearGradient id="colorInflow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorOutflow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis tickFormatter={(value) => `₹${value / 100000}L`} className="text-xs" />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Area type="monotone" dataKey="inflow" stroke="#22c55e" fillOpacity={1} fill="url(#colorInflow)" name="Inflow" />
                  <Area type="monotone" dataKey="outflow" stroke="#ef4444" fillOpacity={1} fill="url(#colorOutflow)" name="Outflow" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Breakdown</CardTitle>
            <CardDescription>This month's spending by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categoryBreakdown.map((item) => (
                <div key={item.category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{item.category}</span>
                    <span className="text-sm text-muted-foreground">{item.percentage}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{formatCurrency(item.amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Payments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Upcoming Payments</CardTitle>
            <CardDescription>Scheduled outflows for the next 30 days</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            View Calendar
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {upcomingPayments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between p-4 rounded-lg border hover:bg-secondary/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <ArrowUpRight className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="font-medium">{payment.name}</p>
                    <p className="text-sm text-muted-foreground">{payment.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant={payment.status === "scheduled" ? "default" : "secondary"}>
                    {payment.status}
                  </Badge>
                  <span className="font-semibold text-red-600">-{formatCurrency(payment.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
