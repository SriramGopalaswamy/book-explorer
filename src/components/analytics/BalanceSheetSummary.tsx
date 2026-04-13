import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ChevronRight, FileText, Loader2 } from "lucide-react";
import { useBalanceSheet } from "@/hooks/useAnalytics";
import { exportReportAsPDF } from "@/lib/pdf-export";
import { exportScheduleIIIBalanceSheet } from "@/lib/schedule-iii-export";
import { BSDrillDownDialog } from "./BSDrillDownDialog";
import { format } from "date-fns";
import { toast } from "sonner";
import { useOnboardingCompliance } from "@/hooks/useOnboardingCompliance";

const formatCurrency = (v: number) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
};

interface BalanceSheetSummaryProps {
  asOfDate?: Date;
}

export function BalanceSheetSummary({ asOfDate }: BalanceSheetSummaryProps) {
  const bs = useBalanceSheet();
  const { compliance } = useOnboardingCompliance();

  const [drillDown, setDrillDown] = useState<{ name: string; code: string; type: "asset" | "liability" | "equity"; balance: number } | null>(null);
  const [scheduleIIIExporting, setScheduleIIIExporting] = useState(false);

  const Section = ({ title, items, total, totalLabel, color, type }: {
    title: string;
    items: { name: string; code: string; balance: number }[];
    total: number;
    totalLabel: string;
    color: string;
    type: "asset" | "liability" | "equity";
  }) => (
    <div>
      <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">{title}</h4>
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.code}
            onClick={() => setDrillDown({ name: item.name, code: item.code, type, balance: item.balance })}
            className="w-full flex justify-between items-center py-1.5 px-3 rounded-lg hover:bg-muted/50 transition-colors text-left group"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">{item.code}</span>
              <span className="text-sm">{item.name}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium">{formatCurrency(item.balance)}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
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
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle className="text-lg">
            Balance Sheet
            {asOfDate && <span className="text-sm font-normal text-muted-foreground ml-2">as of {format(asOfDate, "dd MMM yyyy")}</span>}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">As per Companies Act 2013, Schedule III (Division I) • Ind AS Compliant</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportReportAsPDF({
          title: "Balance Sheet",
          subtitle: "Assets = Liabilities + Equity",
          companyName: compliance?.legal_name || undefined,
          sections: [
            {
              title: "Assets",
              items: bs.assets.map(a => ({ label: `${a.code} — ${a.name}`, value: formatCurrency(a.balance) })),
              total: { label: "Total Assets", value: formatCurrency(bs.totalAssets), color: "#3b82f6" },
            },
            {
              title: "Liabilities",
              items: bs.liabilities.map(l => ({ label: `${l.code} — ${l.name}`, value: formatCurrency(l.balance) })),
              total: { label: "Total Liabilities", value: formatCurrency(bs.totalLiabilities), color: "#f59e0b" },
            },
            {
              title: "Equity",
              items: bs.equity.map(e => ({ label: `${e.code} — ${e.name}`, value: formatCurrency(e.balance) })),
              total: { label: "Total Equity", value: formatCurrency(bs.totalEquity), color: "#22c55e" },
            },
          ],
          footer: [
            { label: "Total Assets", value: formatCurrency(bs.totalAssets) },
            { label: "Total Liabilities", value: formatCurrency(bs.totalLiabilities) },
            { label: "Total Equity", value: formatCurrency(bs.totalEquity) },
          ],
        })}>
          <Download className="h-4 w-4 mr-1" /> Export PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={scheduleIIIExporting}
          onClick={() => {
            setScheduleIIIExporting(true);
            toast.info("Opening Schedule III report. A print dialog will appear — please allow popups if prompted.");
            try {
              exportScheduleIIIBalanceSheet({
                companyName: compliance?.legal_name || "",
                cin: compliance?.cin_or_llpin || "",
                asOfDate: asOfDate ? format(asOfDate, "dd MMM yyyy") : format(new Date(), "dd MMM yyyy"),
                assets: bs.assets,
                liabilities: bs.liabilities,
                equity: bs.equity,
                totalAssets: bs.totalAssets,
                totalLiabilities: bs.totalLiabilities,
                totalEquity: bs.totalEquity,
              });
            } finally {
              setTimeout(() => setScheduleIIIExporting(false), 1500);
            }
          }}
        >
          {scheduleIIIExporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
          Schedule III
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-3 gap-6">
          <Section title="I. Assets (Non-Current + Current)" items={bs.assets} total={bs.totalAssets} totalLabel="Total Assets" color="bg-blue-500/10 border border-blue-500/20 text-blue-600" type="asset" />
          <Section title="II. Equity (Share Capital + Reserves)" items={bs.equity} total={bs.totalEquity} totalLabel="Total Equity" color="bg-green-500/10 border border-green-500/20 text-green-600" type="equity" />
          <Section title="III. Liabilities (Non-Current + Current)" items={bs.liabilities} total={bs.totalLiabilities} totalLabel="Total Liabilities" color="bg-amber-500/10 border border-amber-500/20 text-amber-600" type="liability" />
        </div>
        
        {/* Summary totals */}
        <div className="mt-6 p-4 rounded-xl bg-muted/50 border flex items-center justify-center gap-8 text-sm">
          <div className="text-center">
            <p className="text-muted-foreground">Assets</p>
            <p className="text-lg font-bold">{formatCurrency(bs.totalAssets)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">Liabilities</p>
            <p className="text-lg font-bold">{formatCurrency(bs.totalLiabilities)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">Equity</p>
            <p className="text-lg font-bold">{formatCurrency(bs.totalEquity)}</p>
          </div>
        </div>
      </CardContent>

      {drillDown && (
        <BSDrillDownDialog
          open={!!drillDown}
          onOpenChange={(open) => !open && setDrillDown(null)}
          accountName={drillDown.name}
          accountCode={drillDown.code}
          accountType={drillDown.type}
          balance={drillDown.balance}
        />
      )}
    </Card>
  );
}
