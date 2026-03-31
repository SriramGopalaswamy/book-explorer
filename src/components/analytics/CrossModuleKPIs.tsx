import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Wallet, Clock, TrendingUp, Building2, UserPlus, UserMinus } from "lucide-react";
import { useHRAnalytics, usePayrollSummary, useAttendanceSummary, useCrossModuleInsights } from "@/hooks/useCrossModuleAnalytics";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

const formatCurrency = (v: number) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
};

const DEPT_COLORS = [
  "hsl(262, 52%, 47%)", "hsl(199, 89%, 48%)", "hsl(38, 92%, 50%)",
  "hsl(142, 76%, 36%)", "hsl(346, 87%, 43%)", "hsl(222, 47%, 41%)",
  "hsl(180, 60%, 40%)", "hsl(30, 80%, 55%)",
];

export function CrossModuleKPIs() {
  const { data: hr, isLoading: hrLoading } = useHRAnalytics();
  const { data: payroll, isLoading: payrollLoading } = usePayrollSummary();
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceSummary();
  const { data: insights = [] } = useCrossModuleInsights();

  const isLoading = hrLoading || payrollLoading || attendanceLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Employees</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hr?.activeEmployees ?? 0}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">{hr?.onLeave ?? 0} on leave</span>
              {(hr?.newHiresLast90Days ?? 0) > 0 && (
                <Badge variant="outline" className="text-xs border-success/30 bg-success/10 text-success">
                  <UserPlus className="h-3 w-3 mr-1" />+{hr?.newHiresLast90Days}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Payroll Cost</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(payroll?.totalPayrollCost ?? 0)}</div>
            <p className="text-xs text-muted-foreground">
              Avg CTC: {formatCurrency(payroll?.avgCTC ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cost Per Employee</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(payroll?.costPerEmployee ?? 0)}</div>
            <p className="text-xs text-muted-foreground">
              {payroll?.totalEmployeesOnPayroll ?? 0} on payroll
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Attendance Today</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {(attendance?.avgAttendanceRate ?? 0) === 0 && (attendance?.absentToday ?? 0) === 0 ? (
              <>
                <div className="text-2xl font-bold text-muted-foreground">—</div>
                <p className="text-xs text-muted-foreground">
                  No attendance records for today. Mark attendance in the Attendance module.
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">{attendance?.avgAttendanceRate ?? 0}%</div>
                <p className="text-xs text-muted-foreground">
                  {attendance?.absentToday ?? 0} absent · {Math.round((attendance?.totalOTMinutesThisMonth ?? 0) / 60)}h OT this month
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Department Headcount */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Department Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {hr && hr.departments.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={hr.departments}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="count"
                      nameKey="name"
                    >
                      {hr.departments.map((_, i) => (
                        <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [value, "Employees"]}
                      contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }}
                      labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600 }}
                      itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                    />
                    <Legend
                      layout="vertical"
                      verticalAlign="middle"
                      align="right"
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => <span className="text-xs">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No department data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Department Payroll Cost */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Payroll by Department
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {payroll && payroll.departmentCosts.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={payroll.departmentCosts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => formatCurrency(v)}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="department"
                      width={100}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), "Total Cost"]}
                      contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))" }}
                    />
                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="total" name="Total Cost" fill="hsl(262, 52%, 47%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No payroll data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Cost Trend */}
      {payroll && payroll.monthlyCostTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monthly Payroll Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={payroll.monthlyCostTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))" }}
                  />
                  <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="gross" name="Gross Pay" fill="hsl(199, 89%, 48%)" radius={[4, 4, 0, 0]} opacity={0.8} />
                  <Bar dataKey="net" name="Net Pay" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cross-Module Insights */}
      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cross-Module Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    insight.type === "warning"
                      ? "border-yellow-500/30 bg-yellow-500/5"
                      : insight.type === "critical"
                      ? "border-destructive/30 bg-destructive/5"
                      : insight.type === "success"
                      ? "border-success/30 bg-success/5"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                    {insight.module}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{insight.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
                  </div>
                  {insight.metric && (
                    <span className="text-sm font-semibold text-foreground shrink-0">{insight.metric}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tenure Info */}
      {hr && hr.avgTenureMonths > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold">{hr.avgTenureMonths} months</div>
                <p className="text-sm text-muted-foreground mt-1">Average Employee Tenure</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-success">{hr.newHiresLast90Days}</div>
                <p className="text-sm text-muted-foreground mt-1">New Hires (90 days)</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold">{hr.departments.length}</div>
                <p className="text-sm text-muted-foreground mt-1">Active Departments</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
