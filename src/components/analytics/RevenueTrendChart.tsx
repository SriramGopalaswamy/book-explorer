import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, ComposedChart, Line } from "recharts";
import { useMonthlyTrend } from "@/hooks/useAnalytics";

const formatCurrency = (v: number) => {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  return `₹${(v / 1000).toFixed(0)}K`;
};

export function RevenueTrendChart() {
  const { data: trend = [] } = useMonthlyTrend();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Revenue vs Expenses Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(346, 87%, 43%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(346, 87%, 43%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
              <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
              <Tooltip
                formatter={(value: number, name: string) => [formatCurrency(value), name]}
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }}
              />
              <Legend />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(142, 76%, 36%)" fill="url(#revenueGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke="hsl(346, 87%, 43%)" fill="url(#expenseGrad)" strokeWidth={2} />
              <Line type="monotone" dataKey="profit" name="Net Profit" stroke="hsl(262, 52%, 47%)" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProfitBarChart() {
  const { data: trend = [] } = useMonthlyTrend();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Monthly Profit Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
              <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
              <Tooltip
                formatter={(value: number, name: string) => [formatCurrency(value), name]}
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }}
              />
              <Bar dataKey="revenue" name="Revenue" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} opacity={0.8} />
              <Bar dataKey="expenses" name="Expenses" fill="hsl(346, 87%, 43%)" radius={[4, 4, 0, 0]} opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
