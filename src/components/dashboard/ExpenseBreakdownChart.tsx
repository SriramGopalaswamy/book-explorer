import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useExpenseBreakdown, DateRangeFilter } from "@/hooks/useFinancialData";
import { Skeleton } from "@/components/ui/skeleton";

const formatCurrency = (value: number) => {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(1)}L`;
  }
  return `₹${value.toLocaleString("en-IN")}`;
};

const RADIAN = Math.PI / 180;

const renderCustomizedLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null;

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-xs font-medium"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

interface ExpenseBreakdownChartProps {
  dateRange?: DateRangeFilter;
}

export function ExpenseBreakdownChart({ dateRange }: ExpenseBreakdownChartProps) {
  const { data: expenseData, isLoading } = useExpenseBreakdown(dateRange);

  const subtitleText = dateRange?.from && dateRange?.to
    ? `Spending by category (${dateRange.from.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – ${dateRange.to.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })})`
    : "This month's spending by category";

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-card">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-64 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const total = expenseData?.reduce((sum, item) => sum + item.value, 0) || 0;
  const hasData = expenseData && expenseData.length > 0;

  return (
    <div className="rounded-xl border bg-card p-6 shadow-card">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Expense Breakdown</h3>
        <p className="text-sm text-muted-foreground">{subtitleText}</p>
      </div>
      {!hasData ? (
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No expense data for this period</p>
        </div>
      ) : (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={expenseData || []}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomizedLabel}
              outerRadius={90}
              innerRadius={40}
              paddingAngle={2}
              dataKey="value"
            >
              {(expenseData || []).map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [formatCurrency(value), name]}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                color: "hsl(var(--foreground))",
              }}
              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
              itemStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              content={({ payload }) => (
                <ul className="flex flex-col gap-2 pl-4">
                  {(payload || []).map((entry, index) => (
                    <li key={`legend-${index}`} className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-sm text-muted-foreground">{entry.value}</span>
                    </li>
                  ))}
                </ul>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      )}
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Total Expenses</span>
          <span className="text-lg font-bold text-foreground">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}
