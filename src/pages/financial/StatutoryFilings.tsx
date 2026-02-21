import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { AnimatedPage } from "@/components/layout/AnimatedPage";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { DataTable, Column } from "@/components/ui/data-table";
import {
  FileSpreadsheet,
  Download,
  Calendar,
  IndianRupee,
  Building2,
  Users,
  FileText,
  Shield,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  useGSTR1Data,
  useGSTR3BData,
  useTDS24QData,
  useTDS26QData,
  usePFECRData,
  useESIData,
  useProfTaxData,
  getFinancialYearRange,
  getQuarterRange,
  getMonthRange,
  type GSTR1Row,
  type GSTR3BSummary,
  type TDS24QRow,
  type TDS26QRow,
  type PFECRRow,
  type ESIRow,
  type ProfTaxRow,
} from "@/hooks/useStatutoryData";
import {
  exportGSTR1,
  exportGSTR3B,
  exportTDS24Q,
  exportTDS26Q,
  exportPFECR,
  exportESI,
  exportProfTax,
} from "@/lib/statutory-export";
import { exportReportAsPDF } from "@/lib/pdf-export";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

const currentYear = new Date().getFullYear();
const FY_OPTIONS = Array.from({ length: 5 }, (_, i) => {
  const y = currentYear - i;
  return { value: `${y}-${y + 1}`, label: `FY ${y}-${String(y + 1).slice(2)}` };
});

const QUARTER_OPTIONS = [
  { value: "1", label: "Q1 (Apr-Jun)" },
  { value: "2", label: "Q2 (Jul-Sep)" },
  { value: "3", label: "Q3 (Oct-Dec)" },
  { value: "4", label: "Q4 (Jan-Mar)" },
];

const MONTH_OPTIONS = [
  { value: "4", label: "April" }, { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" }, { value: "9", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
  { value: "1", label: "January" }, { value: "2", label: "February" }, { value: "3", label: "March" },
];

export default function StatutoryFilings() {
  const [activeTab, setActiveTab] = useState("gstr1");
  const [fy, setFy] = useState(FY_OPTIONS[0].value);
  const [quarter, setQuarter] = useState("1");
  const [month, setMonth] = useState("4");

  // Compute date ranges
  const fyRange = useMemo(() => getFinancialYearRange(fy), [fy]);
  const qRange = useMemo(() => getQuarterRange(fy, parseInt(quarter)), [fy, quarter]);
  const mRange = useMemo(() => getMonthRange(fy, parseInt(month)), [fy, month]);

  // Select period based on filing type
  const gstPeriod = activeTab === "gstr1" ? mRange : mRange; // Monthly for GSTR-1 and GSTR-3B
  const tdsPeriod = qRange; // Quarterly for TDS
  const pfPeriod = mRange; // Monthly for PF/ESI

  // Queries
  const gstr1 = useGSTR1Data(gstPeriod.from, gstPeriod.to);
  const gstr3b = useGSTR3BData(gstPeriod.from, gstPeriod.to);
  const tds24q = useTDS24QData(tdsPeriod.from, tdsPeriod.to);
  const tds26q = useTDS26QData(tdsPeriod.from, tdsPeriod.to);
  const pfEcr = usePFECRData(pfPeriod.from, pfPeriod.to);
  const esiData = useESIData(pfPeriod.from, pfPeriod.to);
  const profTax = useProfTaxData(pfPeriod.from, pfPeriod.to);

  const periodLabel = `${MONTH_OPTIONS.find(m => m.value === month)?.label || ""} ${fy}`;
  const quarterLabel = `${QUARTER_OPTIONS.find(q => q.value === quarter)?.label || ""} ${fy}`;

  const handleDownload = (type: string) => {
    try {
      switch (type) {
        case "gstr1":
          if (!gstr1.data?.length) { toast.error("No GSTR-1 data for this period"); return; }
          exportGSTR1(gstr1.data, periodLabel.replace(/\s+/g, "_"));
          break;
        case "gstr3b":
          if (!gstr3b.data) { toast.error("No GSTR-3B data for this period"); return; }
          exportGSTR3B(gstr3b.data, periodLabel.replace(/\s+/g, "_"));
          break;
        case "tds24q":
          if (!tds24q.data?.length) { toast.error("No TDS 24Q data for this period"); return; }
          exportTDS24Q(tds24q.data, quarterLabel.replace(/\s+/g, "_"));
          break;
        case "tds26q":
          if (!tds26q.data?.length) { toast.error("No TDS 26Q data for this period"); return; }
          exportTDS26Q(tds26q.data, quarterLabel.replace(/\s+/g, "_"));
          break;
        case "pf":
          if (!pfEcr.data?.length) { toast.error("No PF data for this period"); return; }
          exportPFECR(pfEcr.data, periodLabel.replace(/\s+/g, "_"));
          break;
        case "esi":
          if (!esiData.data?.length) { toast.error("No ESI data for this period"); return; }
          exportESI(esiData.data, periodLabel.replace(/\s+/g, "_"));
          break;
        case "pt":
          if (!profTax.data?.length) { toast.error("No Professional Tax data for this period"); return; }
          exportProfTax(profTax.data, periodLabel.replace(/\s+/g, "_"));
          break;
      }
      toast.success("Report downloaded successfully");
    } catch (e: any) {
      toast.error("Download failed: " + e.message);
    }
  };

  const handlePrintPDF = (type: string) => {
    if (type === "gstr3b" && gstr3b.data) {
      const s = gstr3b.data;
      exportReportAsPDF({
        title: "GSTR-3B Summary Return",
        subtitle: periodLabel,
        sections: [
          {
            title: "Outward Supplies",
            items: [
              { label: "Taxable Supplies", value: formatCurrency(s.outward_taxable) },
              { label: "CGST Payable", value: formatCurrency(s.cgst_payable) },
              { label: "SGST Payable", value: formatCurrency(s.sgst_payable) },
              { label: "IGST Payable", value: formatCurrency(s.igst_payable) },
            ],
            total: { label: "Total Tax Liability", value: formatCurrency(s.total_tax_payable), color: "#ef4444" },
          },
          {
            title: "Input Tax Credit",
            items: [
              { label: "ITC - CGST", value: formatCurrency(s.itc_cgst) },
              { label: "ITC - SGST", value: formatCurrency(s.itc_sgst) },
              { label: "ITC - IGST", value: formatCurrency(s.itc_igst) },
            ],
            total: { label: "Total ITC", value: formatCurrency(s.total_itc), color: "#22c55e" },
          },
          {
            title: "Net Tax Payable",
            items: [
              { label: "Net CGST", value: formatCurrency(s.net_cgst) },
              { label: "Net SGST", value: formatCurrency(s.net_sgst) },
              { label: "Net IGST", value: formatCurrency(s.net_igst) },
            ],
            total: { label: "Total Net Payable", value: formatCurrency(s.net_payable), color: "#6366f1" },
          },
        ],
      });
    }
  };

  // ── GSTR-1 Columns ──
  const gstr1Cols: Column<GSTR1Row>[] = [
    { key: "invoice_number", header: "Invoice #", render: (r) => <span className="font-mono text-xs text-primary">{r.invoice_number}</span> },
    { key: "invoice_date", header: "Date" },
    { key: "customer_name", header: "Customer" },
    { key: "invoice_type", header: "Type", render: (r) => <Badge variant="outline" className={r.invoice_type === "B2B" ? "border-blue-500/30 text-blue-400" : "border-amber-500/30 text-amber-400"}>{r.invoice_type}</Badge> },
    { key: "hsn_sac", header: "HSN/SAC", render: (r) => <span className="font-mono text-xs">{r.hsn_sac || "—"}</span> },
    { key: "taxable_value", header: "Taxable", render: (r) => formatCurrency(r.taxable_value), className: "text-right", headerClassName: "text-right" },
    { key: "cgst_amount", header: "CGST", render: (r) => formatCurrency(r.cgst_amount), className: "text-right", headerClassName: "text-right" },
    { key: "sgst_amount", header: "SGST", render: (r) => formatCurrency(r.sgst_amount), className: "text-right", headerClassName: "text-right" },
    { key: "igst_amount", header: "IGST", render: (r) => formatCurrency(r.igst_amount), className: "text-right", headerClassName: "text-right" },
    { key: "total_amount", header: "Total", render: (r) => <span className="font-semibold">{formatCurrency(r.total_amount)}</span>, className: "text-right", headerClassName: "text-right" },
  ];

  // ── TDS 24Q Columns ──
  const tds24qCols: Column<TDS24QRow>[] = [
    { key: "employee_name", header: "Employee" },
    { key: "pay_period", header: "Period" },
    { key: "gross_salary", header: "Gross", render: (r) => formatCurrency(r.gross_salary), className: "text-right", headerClassName: "text-right" },
    { key: "taxable_income", header: "Taxable", render: (r) => formatCurrency(r.taxable_income), className: "text-right", headerClassName: "text-right" },
    { key: "tds_deducted", header: "TDS", render: (r) => formatCurrency(r.tds_deducted), className: "text-right", headerClassName: "text-right" },
    { key: "cess", header: "Cess (4%)", render: (r) => formatCurrency(r.cess), className: "text-right", headerClassName: "text-right" },
    { key: "total_tds", header: "Total TDS", render: (r) => <span className="font-semibold">{formatCurrency(r.total_tds)}</span>, className: "text-right", headerClassName: "text-right" },
  ];

  // ── TDS 26Q Columns ──
  const tds26qCols: Column<TDS26QRow>[] = [
    { key: "deductee_name", header: "Deductee" },
    { key: "section_code", header: "Section", render: (r) => <Badge variant="outline">{r.section_code}</Badge> },
    { key: "payment_date", header: "Date" },
    { key: "amount_paid", header: "Amount", render: (r) => formatCurrency(r.amount_paid), className: "text-right", headerClassName: "text-right" },
    { key: "tds_rate", header: "Rate (%)", render: (r) => `${r.tds_rate}%`, className: "text-right", headerClassName: "text-right" },
    { key: "tds_amount", header: "TDS Amount", render: (r) => <span className="font-semibold">{formatCurrency(r.tds_amount)}</span>, className: "text-right", headerClassName: "text-right" },
    { key: "description", header: "Reference" },
  ];

  // ── PF ECR Columns ──
  const pfCols: Column<PFECRRow>[] = [
    { key: "employee_name", header: "Employee" },
    { key: "gross_wages", header: "Gross", render: (r) => formatCurrency(r.gross_wages), className: "text-right", headerClassName: "text-right" },
    { key: "epf_wages", header: "EPF Wages", render: (r) => formatCurrency(r.epf_wages), className: "text-right", headerClassName: "text-right" },
    { key: "epf_employee", header: "EPF (Emp)", render: (r) => formatCurrency(r.epf_employee), className: "text-right", headerClassName: "text-right" },
    { key: "eps_employer", header: "EPS (Er)", render: (r) => formatCurrency(r.eps_employer), className: "text-right", headerClassName: "text-right" },
    { key: "epf_employer", header: "EPF Diff", render: (r) => formatCurrency(r.epf_employer), className: "text-right", headerClassName: "text-right" },
    { key: "edli_contribution", header: "EDLI", render: (r) => formatCurrency(r.edli_contribution), className: "text-right", headerClassName: "text-right" },
  ];

  // ── ESI Columns ──
  const esiCols: Column<ESIRow>[] = [
    { key: "employee_name", header: "Employee" },
    { key: "gross_wages", header: "Gross Wages", render: (r) => formatCurrency(r.gross_wages), className: "text-right", headerClassName: "text-right" },
    { key: "days_worked", header: "Days", className: "text-right", headerClassName: "text-right" },
    { key: "employee_contribution", header: "Emp (0.75%)", render: (r) => formatCurrency(r.employee_contribution), className: "text-right", headerClassName: "text-right" },
    { key: "employer_contribution", header: "Er (3.25%)", render: (r) => formatCurrency(r.employer_contribution), className: "text-right", headerClassName: "text-right" },
    { key: "total_contribution", header: "Total", render: (r) => <span className="font-semibold">{formatCurrency(r.total_contribution)}</span>, className: "text-right", headerClassName: "text-right" },
  ];

  // ── Prof Tax Columns ──
  const ptCols: Column<ProfTaxRow>[] = [
    { key: "employee_name", header: "Employee" },
    { key: "month", header: "Month" },
    { key: "gross_salary", header: "Gross Salary", render: (r) => formatCurrency(r.gross_salary), className: "text-right", headerClassName: "text-right" },
    { key: "state", header: "State" },
    { key: "pt_amount", header: "PT Amount", render: (r) => <span className="font-semibold">{formatCurrency(r.pt_amount)}</span>, className: "text-right", headerClassName: "text-right" },
  ];

  const filingTypes = [
    { id: "gstr1", label: "GSTR-1", icon: FileSpreadsheet, desc: "Outward Supplies", frequency: "Monthly", portal: "gst.gov.in" },
    { id: "gstr3b", label: "GSTR-3B", icon: IndianRupee, desc: "Summary Return", frequency: "Monthly", portal: "gst.gov.in" },
    { id: "tds24q", label: "TDS 24Q", icon: Users, desc: "Salary TDS", frequency: "Quarterly", portal: "incometax.gov.in" },
    { id: "tds26q", label: "TDS 26Q", icon: Building2, desc: "Non-Salary TDS", frequency: "Quarterly", portal: "incometax.gov.in" },
    { id: "pf", label: "PF ECR", icon: Shield, desc: "PF Contribution", frequency: "Monthly", portal: "epfindia.gov.in" },
    { id: "esi", label: "ESI", icon: Shield, desc: "ESI Return", frequency: "Half-Yearly", portal: "esic.gov.in" },
    { id: "pt", label: "Prof Tax", icon: TrendingDown, desc: "Professional Tax", frequency: "Monthly", portal: "State Portal" },
  ];

  const isGST = activeTab === "gstr1" || activeTab === "gstr3b";
  const isTDS = activeTab === "tds24q" || activeTab === "tds26q";

  return (
    <MainLayout title="Statutory Filings">
      <AnimatedPage>
        <div className="space-y-6 p-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-foreground">Statutory Filings</h1>
            <p className="text-sm text-muted-foreground">Generate and download GST, TDS, PF, ESI, and Professional Tax reports for government portal upload</p>
          </div>

          {/* Filing Type Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {filingTypes.map((f) => {
              const Icon = f.icon;
              const isActive = activeTab === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveTab(f.id)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all text-center ${
                    isActive
                      ? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`text-xs font-semibold ${isActive ? "text-primary" : "text-foreground"}`}>{f.label}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">{f.desc}</span>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">{f.frequency}</Badge>
                </button>
              );
            })}
          </div>

          {/* Period Selector */}
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Period:</span>
                </div>
                <Select value={fy} onValueChange={setFy}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {isTDS && (
                  <Select value={quarter} onValueChange={setQuarter}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QUARTER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {(isGST || activeTab === "pf" || activeTab === "esi" || activeTab === "pt") && (
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTH_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => handleDownload(activeTab)}>
                    <Download className="h-4 w-4" /> Download Excel
                  </Button>
                  {activeTab === "gstr3b" && (
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => handlePrintPDF(activeTab)}>
                      <FileText className="h-4 w-4" /> Print PDF
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Content */}
          {activeTab === "gstr1" && (
            <div className="space-y-4">
              <FilingHeader title="GSTR-1 — Outward Supplies" desc="Details of outward supplies of goods/services. Upload to GST Portal → Returns → GSTR-1." portal="gst.gov.in" />
              {gstr1.data && gstr1.data.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <SummaryCard label="Total Invoices" value={String(new Set(gstr1.data.map(r => r.invoice_number)).size)} />
                  <SummaryCard label="B2B Invoices" value={String(gstr1.data.filter(r => r.invoice_type === "B2B").length)} />
                  <SummaryCard label="Total Taxable" value={formatCurrency(gstr1.data.reduce((s, r) => s + r.taxable_value, 0))} />
                </div>
              )}
              <DataTable columns={gstr1Cols} data={gstr1.data || []} isLoading={gstr1.isLoading} emptyMessage="No outward supplies found for this period" />
            </div>
          )}

          {activeTab === "gstr3b" && (
            <div className="space-y-4">
              <FilingHeader title="GSTR-3B — Summary Return" desc="Monthly summary of outward/inward supplies and tax liability. Upload to GST Portal → Returns → GSTR-3B." portal="gst.gov.in" />
              {gstr3b.data && <GSTR3BSummaryCards data={gstr3b.data} />}
            </div>
          )}

          {activeTab === "tds24q" && (
            <div className="space-y-4">
              <FilingHeader title="TDS Form 24Q — Salary" desc="Quarterly statement of TDS deducted from employee salaries. Upload to TRACES Portal." portal="tdscpc.gov.in" />
              {tds24q.data && tds24q.data.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <SummaryCard label="Employees" value={String(tds24q.data.length)} />
                  <SummaryCard label="Total Gross Salary" value={formatCurrency(tds24q.data.reduce((s, r) => s + r.gross_salary, 0))} />
                  <SummaryCard label="Total TDS" value={formatCurrency(tds24q.data.reduce((s, r) => s + r.total_tds, 0))} />
                </div>
              )}
              <DataTable columns={tds24qCols} data={tds24q.data || []} isLoading={tds24q.isLoading} emptyMessage="No salary TDS data for this quarter" />
            </div>
          )}

          {activeTab === "tds26q" && (
            <div className="space-y-4">
              <FilingHeader title="TDS Form 26Q — Non-Salary" desc="Quarterly statement of TDS on payments other than salary (contractor, professional fees, rent, etc.). Upload to TRACES Portal." portal="tdscpc.gov.in" />
              {tds26q.data && tds26q.data.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <SummaryCard label="Deductees" value={String(tds26q.data.length)} />
                  <SummaryCard label="Total Payments" value={formatCurrency(tds26q.data.reduce((s, r) => s + r.amount_paid, 0))} />
                  <SummaryCard label="Total TDS" value={formatCurrency(tds26q.data.reduce((s, r) => s + r.tds_amount, 0))} />
                </div>
              )}
              <DataTable columns={tds26qCols} data={tds26q.data || []} isLoading={tds26q.isLoading} emptyMessage="No non-salary TDS data for this quarter" />
            </div>
          )}

          {activeTab === "pf" && (
            <div className="space-y-4">
              <FilingHeader title="PF ECR — Electronic Challan cum Return" desc="Monthly PF contribution details. Upload to EPFO Unified Portal → ECR Filing." portal="unifiedportal-emp.epfindia.gov.in" />
              {pfEcr.data && pfEcr.data.length > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  <SummaryCard label="Employees" value={String(pfEcr.data.length)} />
                  <SummaryCard label="Total EPF (Emp)" value={formatCurrency(pfEcr.data.reduce((s, r) => s + r.epf_employee, 0))} />
                  <SummaryCard label="Total EPS (Er)" value={formatCurrency(pfEcr.data.reduce((s, r) => s + r.eps_employer, 0))} />
                  <SummaryCard label="Total EPF Diff" value={formatCurrency(pfEcr.data.reduce((s, r) => s + r.epf_employer, 0))} />
                </div>
              )}
              <DataTable columns={pfCols} data={pfEcr.data || []} isLoading={pfEcr.isLoading} emptyMessage="No PF data for this period" />
            </div>
          )}

          {activeTab === "esi" && (
            <div className="space-y-4">
              <FilingHeader title="ESI Return — Employee State Insurance" desc="Half-yearly ESI contribution details for employees earning ≤ ₹21,000/month. Upload to ESIC Portal." portal="esic.gov.in" />
              {esiData.data && esiData.data.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <SummaryCard label="Covered Employees" value={String(esiData.data.length)} />
                  <SummaryCard label="Employee Share" value={formatCurrency(esiData.data.reduce((s, r) => s + r.employee_contribution, 0))} />
                  <SummaryCard label="Employer Share" value={formatCurrency(esiData.data.reduce((s, r) => s + r.employer_contribution, 0))} />
                </div>
              )}
              <DataTable columns={esiCols} data={esiData.data || []} isLoading={esiData.isLoading} emptyMessage="No ESI-eligible employees for this period" />
            </div>
          )}

          {activeTab === "pt" && (
            <div className="space-y-4">
              <FilingHeader title="Professional Tax" desc="Monthly Professional Tax deduction as per state slabs. Upload to respective State Commercial Tax Portal." portal="State Portal" />
              {profTax.data && profTax.data.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <SummaryCard label="Employees" value={String(profTax.data.length)} />
                  <SummaryCard label="Total PT Collected" value={formatCurrency(profTax.data.reduce((s, r) => s + r.pt_amount, 0))} />
                  <SummaryCard label="Applicable State" value="Karnataka" />
                </div>
              )}
              <DataTable columns={ptCols} data={profTax.data || []} isLoading={profTax.isLoading} emptyMessage="No Professional Tax data for this period" />
            </div>
          )}
        </div>
      </AnimatedPage>
    </MainLayout>
  );
}

function FilingHeader({ title, desc, portal }: { title: string; desc: string; portal: string }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <Badge variant="outline" className="gap-1 text-xs">
        <AlertCircle className="h-3 w-3" /> Upload to {portal}
      </Badge>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function GSTR3BSummaryCards({ data }: { data: GSTR3BSummary }) {
  return (
    <div className="space-y-4">
      {/* Table 3.1 - Outward */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            3.1 — Details of Outward Supplies and Inward Supplies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="px-4 py-2 text-left">Nature of Supplies</th>
                  <th className="px-4 py-2 text-right">Taxable Value</th>
                  <th className="px-4 py-2 text-right">CGST</th>
                  <th className="px-4 py-2 text-right">SGST</th>
                  <th className="px-4 py-2 text-right">IGST</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-4 py-2 text-foreground">Outward Taxable (other than zero/nil rated)</td>
                  <td className="px-4 py-2 text-right font-medium text-foreground">{formatCurrency(data.outward_taxable)}</td>
                  <td className="px-4 py-2 text-right text-foreground">{formatCurrency(data.cgst_payable)}</td>
                  <td className="px-4 py-2 text-right text-foreground">{formatCurrency(data.sgst_payable)}</td>
                  <td className="px-4 py-2 text-right text-foreground">{formatCurrency(data.igst_payable)}</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-4 py-2 text-foreground">Outward Exempt</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{formatCurrency(data.outward_exempt)}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">—</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">—</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">—</td>
                </tr>
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td className="px-4 py-2 text-foreground">Total Tax Liability</td>
                  <td className="px-4 py-2 text-right text-foreground">{formatCurrency(data.outward_taxable)}</td>
                  <td className="px-4 py-2 text-right text-foreground">{formatCurrency(data.cgst_payable)}</td>
                  <td className="px-4 py-2 text-right text-foreground">{formatCurrency(data.sgst_payable)}</td>
                  <td className="px-4 py-2 text-right text-foreground">{formatCurrency(data.igst_payable)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Table 4 - ITC */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            4 — Eligible Input Tax Credit (ITC)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="px-4 py-2 text-left">Details</th>
                  <th className="px-4 py-2 text-right">CGST</th>
                  <th className="px-4 py-2 text-right">SGST</th>
                  <th className="px-4 py-2 text-right">IGST</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-4 py-2 text-foreground">ITC Available (from Inward Supplies)</td>
                  <td className="px-4 py-2 text-right text-emerald-400">{formatCurrency(data.itc_cgst)}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">{formatCurrency(data.itc_sgst)}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">{formatCurrency(data.itc_igst)}</td>
                </tr>
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td className="px-4 py-2 text-foreground">Total ITC</td>
                  <td className="px-4 py-2 text-right text-emerald-400" colSpan={3}>{formatCurrency(data.total_itc)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Table 6.1 - Net */}
      <Card className="bg-card border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-primary" />
            6.1 — Payment of Tax
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2 text-right">Tax Payable</th>
                  <th className="px-4 py-2 text-right">Paid through ITC</th>
                  <th className="px-4 py-2 text-right">Net Cash Payable</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-4 py-2 text-foreground">CGST</td>
                  <td className="px-4 py-2 text-right text-foreground">{formatCurrency(data.cgst_payable)}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">{formatCurrency(data.itc_cgst)}</td>
                  <td className="px-4 py-2 text-right font-medium text-foreground">{formatCurrency(data.net_cgst)}</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-4 py-2 text-foreground">SGST</td>
                  <td className="px-4 py-2 text-right text-foreground">{formatCurrency(data.sgst_payable)}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">{formatCurrency(data.itc_sgst)}</td>
                  <td className="px-4 py-2 text-right font-medium text-foreground">{formatCurrency(data.net_sgst)}</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-4 py-2 text-foreground">IGST</td>
                  <td className="px-4 py-2 text-right text-foreground">{formatCurrency(data.igst_payable)}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">{formatCurrency(data.itc_igst)}</td>
                  <td className="px-4 py-2 text-right font-medium text-foreground">{formatCurrency(data.net_igst)}</td>
                </tr>
                <tr className="border-t border-border bg-primary/5 font-bold">
                  <td className="px-4 py-2 text-primary">TOTAL NET PAYABLE</td>
                  <td className="px-4 py-2 text-right text-foreground">{formatCurrency(data.total_tax_payable)}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">{formatCurrency(data.total_itc)}</td>
                  <td className="px-4 py-2 text-right text-primary text-lg">{formatCurrency(data.net_payable)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
