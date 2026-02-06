import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProfitLoss } from "@/hooks/useAnalytics";

const formatCurrency = (v: number) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
};

export function ProfitLossStatement() {
  const pl = useProfitLoss();

  return (
    <Card className="col-span-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Profit & Loss Statement</CardTitle>
        <Badge variant="outline" className={pl.netIncome >= 0 ? "bg-green-500/10 text-green-600 border-green-500/30" : "bg-red-500/10 text-red-600 border-red-500/30"}>
          {pl.grossMargin.toFixed(1)}% Margin
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Revenue */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Revenue</h4>
            <div className="space-y-2">
              {pl.revenue.map((r) => (
                <div key={r.name} className="flex justify-between items-center py-1.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className="text-sm">{r.name}</span>
                  <span className="text-sm font-medium text-green-600">{formatCurrency(r.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-green-500/10 border border-green-500/20 mt-2">
                <span className="font-semibold">Total Revenue</span>
                <span className="font-bold text-green-600">{formatCurrency(pl.totalRevenue)}</span>
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Expenses</h4>
            <div className="space-y-2">
              {pl.expenses.map((e) => (
                <div key={e.name} className="flex justify-between items-center py-1.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className="text-sm">{e.name}</span>
                  <span className="text-sm font-medium text-red-600">{formatCurrency(e.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-red-500/10 border border-red-500/20 mt-2">
                <span className="font-semibold">Total Expenses</span>
                <span className="font-bold text-red-600">{formatCurrency(pl.totalExpenses)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Net Income */}
        <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-muted-foreground">Net Income</p>
              <p className="text-2xl font-bold">{formatCurrency(pl.netIncome)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Gross Margin</p>
              <p className="text-2xl font-bold">{pl.grossMargin.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
