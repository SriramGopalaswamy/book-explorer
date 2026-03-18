import { useExpenseBreakdown, DateRangeFilter } from "@/hooks/useFinancialData";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";

const formatCurrency = (value: number) => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
};

interface ExpenseBreakdownChartProps {
  dateRange?: DateRangeFilter;
}

export function ExpenseBreakdownChart({ dateRange }: ExpenseBreakdownChartProps) {
  const { data: expenseData, isLoading } = useExpenseBreakdown(dateRange);

  const isFiltered = !!(dateRange?.from || dateRange?.to);
  const subtitleText = isFiltered
    ? `Spending by category (${dateRange!.from?.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – ${dateRange!.to?.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })})`
    : "Spending by category";

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
  const sorted = [...(expenseData || [])].sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-xl border bg-card p-6 shadow-card">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-foreground">Expense Breakdown</h3>
        <p className="text-sm text-muted-foreground">{subtitleText}</p>
      </div>

      {!hasData ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2">
          <p className="text-sm text-muted-foreground">No approved or paid expenses found</p>
          {isFiltered && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
              <Info className="h-3.5 w-3.5" />
              <span>Try adjusting the date range to see more categories</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((item) => {
            const pct = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <div key={item.name} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{item.name}</span>
                  <span className="text-sm font-medium text-muted-foreground tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(pct, 1)}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{formatCurrency(item.value)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5 pt-4 border-t flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Total Expenses</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {sorted.length} {sorted.length === 1 ? "category" : "categories"}
          </Badge>
        </div>
        <span className="text-lg font-bold text-foreground">{formatCurrency(total)}</span>
      </div>

      {isFiltered && sorted.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
          <Info className="h-3 w-3 shrink-0" />
          <span>Showing only categories with approved/paid expenses in the selected range</span>
        </div>
      )}
    </div>
  );
}