import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { useARAging } from "@/hooks/useAnalytics";
import { Skeleton } from "@/components/ui/skeleton";

const formatCurrency = (v: number) => {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
};

const COLORS = [
  "hsl(142, 76%, 36%)",
  "hsl(38, 92%, 50%)",
  "hsl(25, 95%, 53%)",
  "hsl(346, 87%, 53%)",
  "hsl(346, 87%, 38%)",
];

export function AccountsReceivableAging() {
  const { data: aging, isLoading } = useARAging();

  if (isLoading) return <Card><CardContent className="p-6"><Skeleton className="h-[320px]" /></CardContent></Card>;
  if (!aging) return null;

  const chartData = [
    { name: "Current", value: aging.current, color: COLORS[0] },
    { name: "1-30 Days", value: aging.thirtyDays, color: COLORS[1] },
    { name: "31-60 Days", value: aging.sixtyDays, color: COLORS[2] },
    { name: "61-90 Days", value: aging.ninetyDays, color: COLORS[3] },
    { name: "90+ Days", value: aging.overNinety, color: COLORS[4] },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Accounts Receivable Aging</CardTitle>
        <span className="text-sm text-muted-foreground">Total: {formatCurrency(aging.total)}</span>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" width={80} />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), "Outstanding"]}
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))" }}
                labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                itemStyle={{ color: "hsl(var(--popover-foreground))" }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-5 gap-2 mt-4">
          {chartData.map((item) => (
            <div key={item.name} className="text-center p-2 rounded-lg bg-muted/50">
              <div className="h-1.5 rounded-full mb-2 mx-auto w-8" style={{ background: item.color }} />
              <p className="text-xs text-muted-foreground">{item.name}</p>
              <p className="text-sm font-semibold">{formatCurrency(item.value)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
