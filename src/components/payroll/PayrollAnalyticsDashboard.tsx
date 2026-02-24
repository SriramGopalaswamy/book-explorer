import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, Users, IndianRupee, FileSpreadsheet, ArrowUpRight,
} from "lucide-react";
import { usePayrollAnalytics } from "@/hooks/usePayrollAnalytics";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";

const formatCurrency = (v: number) => `₹${(v / 100000).toFixed(1)}L`;
const formatK = (v: number) => `₹${(v / 1000).toFixed(0)}K`;

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(142 76% 36%)",
  "hsl(var(--accent))",
  "hsl(38 92% 50%)",
  "hsl(262 83% 58%)",
];

const periodLabel = (p: string) => {
  const [y, m] = p.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m) - 1]}`;
};

export function PayrollAnalyticsDashboard() {
  const { data, isLoading } = usePayrollAnalytics();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass-card glow-on-hover">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Payroll Cost</CardTitle>
            <IndianRupee className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.totalPayrollCost)}</div>
            <p className="text-xs text-muted-foreground">Across all locked runs</p>
          </CardContent>
        </Card>
        <Card className="glass-card glow-on-hover">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalEmployees}</div>
            <p className="text-xs text-muted-foreground">In payroll system</p>
          </CardContent>
        </Card>
        <Card className="glass-card glow-on-hover">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average CTC</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.avgCTC)}</div>
            <p className="text-xs text-muted-foreground">Per employee annually</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Cost Trend */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm">Monthly Payroll Cost Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {data.monthlyCostTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.monthlyCostTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tickFormatter={periodLabel} className="text-xs" />
                  <YAxis tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} className="text-xs" />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="gross" fill="hsl(var(--primary))" name="Gross" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="deductions" fill="hsl(var(--destructive))" name="Deductions" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="net" fill="hsl(142 76% 36%)" name="Net" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-16">No payroll data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Department-wise Cost */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm">Department-wise Payroll Cost</CardTitle>
          </CardHeader>
          <CardContent>
            {data.departmentCosts.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={data.departmentCosts}
                    dataKey="total"
                    nameKey="department"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ department, total }) => `${department}: ${formatK(total)}`}
                  >
                    {data.departmentCosts.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-16">No data</p>
            )}
          </CardContent>
        </Card>

        {/* TDS Trend */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm">TDS Collected Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {data.tdsCollectedTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.tdsCollectedTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tickFormatter={periodLabel} className="text-xs" />
                  <YAxis tickFormatter={formatK} className="text-xs" />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Line type="monotone" dataKey="tds" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-16">No TDS data yet</p>
            )}
          </CardContent>
        </Card>

        {/* PF Contribution Trend */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm">PF Contribution Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {data.pfContributionTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.pfContributionTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tickFormatter={periodLabel} className="text-xs" />
                  <YAxis tickFormatter={formatK} className="text-xs" />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="employee_pf" fill="hsl(var(--primary))" name="Employee PF" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="employer_pf" fill="hsl(262 83% 58%)" name="Employer PF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-16">No PF data yet</p>
            )}
          </CardContent>
        </Card>

        {/* LWP Impact */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm">LWP Impact Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            {data.lwpImpact.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.lwpImpact}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tickFormatter={periodLabel} className="text-xs" />
                  <YAxis yAxisId="days" orientation="left" />
                  <YAxis yAxisId="amount" orientation="right" tickFormatter={formatK} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="days" dataKey="lwp_days" fill="hsl(38 92% 50%)" name="LWP Days" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="amount" dataKey="lwp_deduction" fill="hsl(var(--destructive))" name="LWP Deduction" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-16">No LWP data</p>
            )}
          </CardContent>
        </Card>

        {/* Average Salary by Role */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm">Average Salary by Role</CardTitle>
          </CardHeader>
          <CardContent>
            {data.averageSalaryByRole.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.averageSalaryByRole} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tickFormatter={formatK} />
                  <YAxis type="category" dataKey="role" width={100} className="text-xs" />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="avg_salary" fill="hsl(var(--primary))" name="Avg Salary" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-16">No data</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
