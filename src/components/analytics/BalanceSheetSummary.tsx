import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBalanceSheet } from "@/hooks/useAnalytics";

const formatCurrency = (v: number) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
};

export function BalanceSheetSummary() {
  const bs = useBalanceSheet();

  const Section = ({ title, items, total, totalLabel, color }: {
    title: string;
    items: { name: string; code: string; balance: number }[];
    total: number;
    totalLabel: string;
    color: string;
  }) => (
    <div>
      <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">{title}</h4>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.code} className="flex justify-between items-center py-1.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">{item.code}</span>
              <span className="text-sm">{item.name}</span>
            </div>
            <span className="text-sm font-medium">{formatCurrency(item.balance)}</span>
          </div>
        ))}
        <div className={`flex justify-between items-center py-2 px-3 rounded-lg ${color} mt-2`}>
          <span className="font-semibold">{totalLabel}</span>
          <span className="font-bold">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle className="text-lg">Balance Sheet Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-3 gap-6">
          <Section title="Assets" items={bs.assets} total={bs.totalAssets} totalLabel="Total Assets" color="bg-blue-500/10 border border-blue-500/20 text-blue-600" />
          <Section title="Liabilities" items={bs.liabilities} total={bs.totalLiabilities} totalLabel="Total Liabilities" color="bg-amber-500/10 border border-amber-500/20 text-amber-600" />
          <Section title="Equity" items={bs.equity} total={bs.totalEquity} totalLabel="Total Equity" color="bg-green-500/10 border border-green-500/20 text-green-600" />
        </div>
        
        {/* Accounting Equation */}
        <div className="mt-6 p-4 rounded-xl bg-muted/50 border flex items-center justify-center gap-4 text-sm">
          <div className="text-center">
            <p className="text-muted-foreground">Assets</p>
            <p className="text-lg font-bold">{formatCurrency(bs.totalAssets)}</p>
          </div>
          <span className="text-2xl text-muted-foreground">=</span>
          <div className="text-center">
            <p className="text-muted-foreground">Liabilities</p>
            <p className="text-lg font-bold">{formatCurrency(bs.totalLiabilities)}</p>
          </div>
          <span className="text-2xl text-muted-foreground">+</span>
          <div className="text-center">
            <p className="text-muted-foreground">Equity</p>
            <p className="text-lg font-bold">{formatCurrency(bs.totalEquity)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
