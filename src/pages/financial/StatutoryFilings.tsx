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
  AlertTriangle,
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
import { useOnboardingCompliance } from "@/hooks/useOnboardingCompliance";
import { usePayrollFlags } from "@/hooks/usePayrollFlags";
import { useGSTFilingStatus, useUpdateFilingStatus } from "@/hooks/useCurrencyAndFiling";
import { useITCReconciliation, useForm16Data, useForm16AData } from "@/hooks/useGSTReconciliation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

// ─── Statutory Due Date Configuration ─────────────────────────────────────────

interface DueDateInfo {
  dueDate: Date;
  label: string;
  daysRemaining: number;
  urgency: "safe" | "warning" | "urgent" | "overdue";
}

const STATUTORY_DUE_RULES: Record<string, { description: string; computeDueDate: (now: Date) => { date: Date; label: string } }> = {
  gstr1: {
    description: "11th of the following month",
    computeDueDate: (now) => {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 11);
      return { date: next, label: `Due by 11th ${next.toLocaleString("en-IN", { month: "short", year: "numeric" })}` };
    },
  },
  gstr3b: {
    description: "20th of the following month",
    computeDueDate: (now) => {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 20);
      return { date: next, label: `Due by 20th ${next.toLocaleString("en-IN", { month: "short", year: "numeric" })}` };
    },
  },
  tds24q: {
    description: "31st of month following quarter-end (Jul, Oct, Jan, May for Q4)",
    computeDueDate: (now) => {
      const m = now.getMonth();
      const y = now.getFullYear();
      const quarterDues = [
        new Date(y, 6, 31),      // Q1: Jul 31
        new Date(y, 9, 31),      // Q2: Oct 31
        new Date(y + 1, 0, 31),  // Q3: Jan 31
        new Date(m < 3 ? y : y + 1, 4, 31), // Q4: May 31
      ];
      const upcoming = quarterDues.filter(d => d >= now).sort((a, b) => a.getTime() - b.getTime());
      const next = upcoming[0] || new Date(y + 1, 6, 31);
      return { date: next, label: `Due by ${next.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` };
    },
  },
  tds26q: {
    description: "31st of month following quarter-end",
    computeDueDate: (now) => STATUTORY_DUE_RULES.tds24q.computeDueDate(now),
  },
  pf: {
    description: "15th of the following month",
    computeDueDate: (now) => {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 15);
      return { date: next, label: `Due by 15th ${next.toLocaleString("en-IN", { month: "short", year: "numeric" })}` };
    },
  },
  esi: {
    description: "15th of the following month",
    computeDueDate: (now) => {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 15);
      return { date: next, label: `Due by 15th ${next.toLocaleString("en-IN", { month: "short", year: "numeric" })}` };
    },
  },
  pt: {
    description: "Varies by state — typically by 20th of the following month",
    computeDueDate: (now) => {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 20);
      return { date: next, label: `Due by 20th ${next.toLocaleString("en-IN", { month: "short", year: "numeric" })}` };
    },
  },
};

function getFilingDueDate(filingId: string): DueDateInfo | null {
  const rule = STATUTORY_DUE_RULES[filingId];
  if (!rule) return null;
  const now = new Date();
  const { date, label } = rule.computeDueDate(now);
  const diffMs = date.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  let urgency: DueDateInfo["urgency"] = "safe";
  if (daysRemaining < 0) urgency = "overdue";
  else if (daysRemaining <= 3) urgency = "urgent";
  else if (daysRemaining <= 7) urgency = "warning";
  return { dueDate: date, label, daysRemaining, urgency };
}

const URGENCY_STYLES: Record<DueDateInfo["urgency"], { bg: string; text: string; border: string; icon: typeof CheckCircle2 }> = {
  safe: { bg: "bg-secondary/10", text: "text-secondary-foreground", border: "border-secondary/30", icon: CheckCircle2 },
  warning: { bg: "bg-accent/20", text: "text-accent-foreground", border: "border-accent/40", icon: Clock },
  urgent: { bg: "bg-destructive/15", text: "text-destructive", border: "border-destructive/30", icon: AlertTriangle },
  overdue: { bg: "bg-destructive/20", text: "text-destructive", border: "border-destructive/40", icon: AlertCircle },
};

const URGENCY_BADGE_STYLES: Record<DueDateInfo["urgency"], string> = {
  safe: "bg-secondary/20 text-secondary-foreground border-secondary/30",
  warning: "bg-accent/20 text-accent-foreground border-accent/40",
  urgent: "bg-destructive/15 text-destructive border-destructive/30",
  overdue: "bg-destructive/25 text-destructive border-destructive/40",
};

// ─── Constants ────────────────────────────────────────────────────────────────

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

// Compute current defaults based on today's date
function getCurrentDefaults() {
  const now = new Date();
  const m = now.getMonth() + 1; // 1-12
  // Indian FY: Apr (month 4) starts new FY. Jan-Mar belongs to previous calendar year's FY.
  const fyStartYear = m >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const currentFy = `${fyStartYear}-${fyStartYear + 1}`;
  // Quarter: Apr-Jun=1, Jul-Sep=2, Oct-Dec=3, Jan-Mar=4
  const currentQuarter = m >= 4 ? String(Math.ceil((m - 3) / 3)) : "4";
  const currentMonth = String(m);
  return { currentFy, currentQuarter, currentMonth };
}

const defaults = getCurrentDefaults();

export default function StatutoryFilings() {
  const [activeTab, setActiveTab] = useState("gstr1");
  const [fy, setFy] = useState(defaults.currentFy);
  const [quarter, setQuarter] = useState(defaults.currentQuarter);
  const [month, setMonth] = useState(defaults.currentMonth);
  const { compliance } = useOnboardingCompliance();
  const { data: payrollFlags } = usePayrollFlags();
  const { data: filingStatuses = [] } = useGSTFilingStatus(fy);
  const updateFiling = useUpdateFilingStatus();
  const [filingDialog, setFilingDialog] = useState<{ type: string; open: boolean }>({ type: "", open: false });
  const [filingForm, setFilingForm] = useState({ status: "not_started", arn_number: "", challan_number: "", filed_date: "" });

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
  const itcRecon = useITCReconciliation(gstPeriod.from, gstPeriod.to);
  const tds24q = useTDS24QData(tdsPeriod.from, tdsPeriod.to);
  const tds26q = useTDS26QData(tdsPeriod.from, tdsPeriod.to);
  const form16 = useForm16Data(fy);
  const form16a = useForm16AData(fy);
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
        companyName: compliance?.legal_name || undefined,
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
    { key: "pay_period" as any, header: "Month", render: (r: any) => {
      if (!r.pay_period) return "—";
      const [y, m] = r.pay_period.split("-");
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `${months[parseInt(m) - 1]} ${y}`;
    }},
    { key: "gross_wages", header: "Gross Wages", render: (r) => formatCurrency(r.gross_wages), className: "text-right", headerClassName: "text-right" },
    { key: "days_worked", header: "Working Days", className: "text-right", headerClassName: "text-right" },
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

  const allFilingTypes = [
    { id: "gstr1", label: "GSTR-1", icon: FileSpreadsheet, desc: "Outward Supplies", frequency: "Monthly", portal: "gst.gov.in" },
    { id: "gstr3b", label: "GSTR-3B", icon: IndianRupee, desc: "Summary Return", frequency: "Monthly", portal: "gst.gov.in" },
    { id: "itc_recon", label: "ITC Recon", icon: FileSpreadsheet, desc: "GSTR-2A Match", frequency: "Monthly", portal: "gst.gov.in" },
    { id: "tds24q", label: "TDS 24Q", icon: Users, desc: "Salary TDS", frequency: "Quarterly", portal: "incometax.gov.in" },
    { id: "tds26q", label: "TDS 26Q", icon: Building2, desc: "Non-Salary TDS", frequency: "Quarterly", portal: "incometax.gov.in" },
    { id: "form16", label: "Form 16", icon: FileText, desc: "TDS Certificates", frequency: "Annual", portal: "incometax.gov.in" },
    { id: "pf", label: "PF ECR", icon: Shield, desc: "PF Contribution", frequency: "Monthly", portal: "epfindia.gov.in" },
    { id: "esi", label: "ESI", icon: Shield, desc: "ESI Return", frequency: "Half-Yearly", portal: "esic.gov.in" },
    { id: "pt", label: "Prof Tax", icon: TrendingDown, desc: "Professional Tax", frequency: "Monthly", portal: "State Portal" },
  ];

  // Filter tabs based on org payroll compliance flags
  const filingTypes = allFilingTypes.filter((f) => {
    if (f.id === "pf") return payrollFlags?.pf_applicable !== false;
    if (f.id === "esi") return payrollFlags?.esi_applicable !== false;
    if (f.id === "pt") return payrollFlags?.professional_tax_applicable !== false;
    return true; // GST, TDS, ITC, Form 16 always shown
  });

  const isGST = activeTab === "gstr1" || activeTab === "gstr3b" || activeTab === "itc_recon";
  const isTDS = activeTab === "tds24q" || activeTab === "tds26q";

  return (
    <MainLayout title="Statutory Filings" subtitle="Generate and download GST, TDS, PF, ESI, and Professional Tax reports for government portal upload">
      <AnimatedPage>
        <div className="space-y-6 p-6">

          {/* Filing Type Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {filingTypes.map((f) => {
              const Icon = f.icon;
              const isActive = activeTab === f.id;
              const dueInfo = getFilingDueDate(f.id);
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
                  {dueInfo && (
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${URGENCY_BADGE_STYLES[dueInfo.urgency]}`}>
                      {dueInfo.daysRemaining < 0
                        ? `${Math.abs(dueInfo.daysRemaining)}d overdue`
                        : dueInfo.daysRemaining === 0
                        ? "Due today"
                        : `${dueInfo.daysRemaining}d left`}
                    </Badge>
                  )}
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
              <FilingHeader filingId="gstr1" title="GSTR-1 — Outward Supplies" desc="Details of outward supplies of goods/services. Upload to GST Portal → Returns → GSTR-1." portal="gst.gov.in" portalUrl="https://www.gst.gov.in" />
              <GSTFilingStatusPanel filingType="gstr1" month={parseInt(month)} fy={fy} statuses={filingStatuses} onUpdate={updateFiling} filingDialog={filingDialog} setFilingDialog={setFilingDialog} filingForm={filingForm} setFilingForm={setFilingForm} />
              {gstr1.data && gstr1.data.length > 0 && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <SummaryCard label="Total Invoices" value={String(new Set(gstr1.data.map(r => r.invoice_number)).size)} />
                    <SummaryCard label="B2B Invoices" value={String(gstr1.data.filter(r => r.invoice_type === "B2B").length)} />
                    <SummaryCard label="Total Taxable" value={formatCurrency(gstr1.data.reduce((s, r) => s + r.taxable_value, 0))} />
                  </div>
                  {/* HSN Summary */}
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">HSN-wise Summary</CardTitle></CardHeader>
                    <CardContent>
                      <div className="rounded-md border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead><tr className="bg-muted/50 text-muted-foreground"><th className="px-4 py-2 text-left">HSN/SAC</th><th className="px-4 py-2 text-right">Count</th><th className="px-4 py-2 text-right">Taxable Value</th><th className="px-4 py-2 text-right">Total Tax</th></tr></thead>
                          <tbody>
                            {Object.entries(gstr1.data.reduce((acc, r) => {
                              const hsn = r.hsn_sac || "N/A";
                              if (!acc[hsn]) acc[hsn] = { count: 0, taxable: 0, tax: 0 };
                              acc[hsn].count++;
                              acc[hsn].taxable += r.taxable_value;
                              acc[hsn].tax += r.cgst_amount + r.sgst_amount + r.igst_amount;
                              return acc;
                            }, {} as Record<string, { count: number; taxable: number; tax: number }>)).map(([hsn, d]) => (
                              <tr key={hsn} className="border-t border-border">
                                <td className="px-4 py-2 font-mono text-foreground">{hsn}</td>
                                <td className="px-4 py-2 text-right text-foreground">{d.count}</td>
                                <td className="px-4 py-2 text-right text-foreground">{formatCurrency(d.taxable)}</td>
                                <td className="px-4 py-2 text-right font-medium text-foreground">{formatCurrency(d.tax)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
              <DataTable columns={gstr1Cols} data={gstr1.data || []} isLoading={gstr1.isLoading} emptyMessage="No outward supplies found for this period" />
            </div>
          )}

          {activeTab === "gstr3b" && (
            <div className="space-y-4">
              <FilingHeader filingId="gstr3b" title="GSTR-3B — Summary Return" desc="Monthly summary of outward/inward supplies and tax liability. Upload to GST Portal → Returns → GSTR-3B." portal="gst.gov.in" portalUrl="https://www.gst.gov.in" />
              <GSTFilingStatusPanel filingType="gstr3b" month={parseInt(month)} fy={fy} statuses={filingStatuses} onUpdate={updateFiling} filingDialog={filingDialog} setFilingDialog={setFilingDialog} filingForm={filingForm} setFilingForm={setFilingForm} />
              {gstr3b.data && <GSTR3BSummaryCards data={gstr3b.data} />}
            </div>
          )}

          {activeTab === "tds24q" && (
            <div className="space-y-4">
              <FilingHeader filingId="tds24q" title="TDS Form 24Q — Salary" desc="Quarterly statement of TDS deducted from employee salaries. Upload to TRACES Portal." portal="www.tdscpc.gov.in" portalUrl="https://www.tdscpc.gov.in" />
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
              <FilingHeader filingId="tds26q" title="TDS Form 26Q — Non-Salary" desc="Quarterly statement of TDS on payments other than salary (contractor, professional fees, rent, etc.). Upload to TRACES Portal." portal="www.tdscpc.gov.in" portalUrl="https://www.tdscpc.gov.in" />
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
              <FilingHeader filingId="pf" title="PF ECR — Electronic Challan cum Return" desc="Monthly PF contribution details. Upload to EPFO Unified Portal → ECR Filing." portal="epfindia.gov.in" portalUrl="https://www.epfindia.gov.in" />
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
              <FilingHeader filingId="esi" title="ESI Return — Employee State Insurance" desc="Half-yearly ESI contribution details for employees earning ≤ ₹21,000/month. Upload to ESIC Portal." portal="esic.gov.in" portalUrl="https://www.esic.gov.in" />
              {esiData.data && esiData.data.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <SummaryCard label="Covered Employees" value={String(esiData.data.length)} />
                  <SummaryCard label="Employee Share" value={formatCurrency(esiData.data.reduce((s, r) => s + r.employee_contribution, 0))} />
                  <SummaryCard label="Employer Share" value={formatCurrency(esiData.data.reduce((s, r) => s + r.employer_contribution, 0))} />
                </div>
              )}
              {!esiData.isLoading && (!esiData.data || esiData.data.length === 0) && (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm font-medium text-foreground mb-2">No ESI-eligible employees found</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    No employees qualify for ESI in this period. Eligibility is determined by:
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li><span className="font-medium text-foreground">Auto-inference:</span> Employees with gross monthly salary <span className="font-medium text-foreground">≤ ₹21,000</span> (Basic + HRA + Transport + Other Allowances) are automatically eligible per ESIC norms.</li>
                    <li><span className="font-medium text-foreground">Manual override:</span> HR admins can explicitly mark employees as ESI-eligible (or ineligible) via the <span className="font-medium text-foreground">Employee Profile → Compensation tab</span>, which overrides the salary-based threshold.</li>
                    <li>Ensure payroll is <span className="font-medium text-foreground">processed</span> for the selected period and the ESI flag is enabled in <span className="font-medium text-foreground">Settings → Payroll</span>.</li>
                  </ul>
                </div>
              )}
              <DataTable columns={esiCols} data={esiData.data || []} isLoading={esiData.isLoading} emptyMessage="No ESI-eligible employees for this period." />
            </div>
          )}

          {activeTab === "itc_recon" && (
            <div className="space-y-4">
              <FilingHeader filingId="gstr3b" title="ITC Reconciliation — GSTR-2A/2B Match" desc="Compare your purchase register against GSTR-2A/2B to identify matched, unmatched, and excess ITC. Helps prevent ITC reversal during GST audit." portal="gst.gov.in" portalUrl="https://www.gst.gov.in" />
              {itcRecon.data && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <SummaryCard label="Total Purchase ITC" value={formatCurrency(itcRecon.data.total_purchase_itc)} />
                  <SummaryCard label="Matched" value={formatCurrency(itcRecon.data.total_matched)} />
                  <SummaryCard label="Unmatched" value={formatCurrency(itcRecon.data.total_unmatched)} />
                  <SummaryCard label="Match Rate" value={`${itcRecon.data.match_rate.toFixed(1)}%`} />
                  <SummaryCard label="Bills" value={String(itcRecon.data.rows.length)} />
                </div>
              )}
              {itcRecon.data && itcRecon.data.rows.length > 0 ? (
                <DataTable
                  columns={[
                    { key: "vendor_name" as any, header: "Vendor" },
                    { key: "vendor_gstin" as any, header: "GSTIN", render: (r: any) => <span className="font-mono text-xs">{r.vendor_gstin}</span> },
                    { key: "bill_number" as any, header: "Bill #", render: (r: any) => <span className="font-mono text-xs text-primary">{r.bill_number}</span> },
                    { key: "bill_date" as any, header: "Date" },
                    { key: "taxable_value" as any, header: "Taxable", render: (r: any) => formatCurrency(r.taxable_value), className: "text-right", headerClassName: "text-right" },
                    { key: "total_itc" as any, header: "ITC Claimed", render: (r: any) => formatCurrency(r.total_itc), className: "text-right", headerClassName: "text-right" },
                    { key: "match_status" as any, header: "Status", render: (r: any) => (
                      <Badge variant="outline" className={r.match_status === "matched" ? "bg-green-500/10 text-green-600 border-green-500/30" : "bg-destructive/10 text-destructive border-destructive/30"}>
                        {r.match_status === "matched" ? "✓ Matched" : "⚠ Unmatched"}
                      </Badge>
                    )},
                  ]}
                  data={itcRecon.data.rows}
                  isLoading={itcRecon.isLoading}
                  emptyMessage="No bills for ITC reconciliation"
                />
              ) : (
                <Card className="bg-card border-border">
                  <CardContent className="p-6 text-center text-muted-foreground">No purchase bills found for this period.</CardContent>
                </Card>
              )}
            </div>
          )}

          {activeTab === "form16" && (
            <div className="space-y-4">
              <FilingHeader filingId="tds24q" title="TDS Certificates — Form 16 & 16A" desc="Generate Form 16 (salary) and Form 16A (non-salary) TDS certificates for employees and vendors. Required under Section 203 of the Income Tax Act." portal="incometax.gov.in" portalUrl="https://www.incometax.gov.in" />
              
              <Tabs defaultValue="form16_salary">
                <TabsList>
                  <TabsTrigger value="form16_salary">Form 16 (Salary)</TabsTrigger>
                  <TabsTrigger value="form16a_nonsalary">Form 16A (Non-Salary)</TabsTrigger>
                </TabsList>
                
                <TabsContent value="form16_salary" className="space-y-4 mt-4">
                  {form16.data && form16.data.length > 0 && (
                    <div className="grid grid-cols-3 gap-3">
                      <SummaryCard label="Employees" value={String(form16.data.length)} />
                      <SummaryCard label="Total Gross Salary" value={formatCurrency(form16.data.reduce((s, r) => s + r.gross_salary, 0))} />
                      <SummaryCard label="Total TDS Deducted" value={formatCurrency(form16.data.reduce((s, r) => s + r.tds_deducted, 0))} />
                    </div>
                  )}
                  <DataTable
                    columns={[
                      { key: "employee_name" as any, header: "Employee" },
                      { key: "employee_pan" as any, header: "PAN", render: (r: any) => <span className="font-mono text-xs">{r.employee_pan || "—"}</span> },
                      { key: "gross_salary" as any, header: "Gross Salary", render: (r: any) => formatCurrency(r.gross_salary), className: "text-right", headerClassName: "text-right" },
                      { key: "standard_deduction" as any, header: "Std Deduction", render: (r: any) => formatCurrency(r.standard_deduction), className: "text-right", headerClassName: "text-right" },
                      { key: "total_income" as any, header: "Taxable Income", render: (r: any) => formatCurrency(r.total_income), className: "text-right", headerClassName: "text-right" },
                      { key: "tds_deducted" as any, header: "TDS", render: (r: any) => <span className="font-semibold">{formatCurrency(r.tds_deducted)}</span>, className: "text-right", headerClassName: "text-right" },
                      { key: "cess" as any, header: "Cess (4%)", render: (r: any) => formatCurrency(r.cess), className: "text-right", headerClassName: "text-right" },
                    ]}
                    data={form16.data || []}
                    isLoading={form16.isLoading}
                    emptyMessage="No Form 16 data for this financial year"
                  />
                </TabsContent>
                
                <TabsContent value="form16a_nonsalary" className="space-y-4 mt-4">
                  {form16a.data && form16a.data.length > 0 && (
                    <div className="grid grid-cols-3 gap-3">
                      <SummaryCard label="Deductees" value={String(form16a.data.length)} />
                      <SummaryCard label="Total Paid" value={formatCurrency(form16a.data.reduce((s, r) => s + r.total_paid, 0))} />
                      <SummaryCard label="Total TDS" value={formatCurrency(form16a.data.reduce((s, r) => s + r.tds_deducted, 0))} />
                    </div>
                  )}
                  <DataTable
                    columns={[
                      { key: "deductee_name" as any, header: "Vendor/Deductee" },
                      { key: "deductee_pan" as any, header: "PAN", render: (r: any) => <span className="font-mono text-xs">{r.deductee_pan || "—"}</span> },
                      { key: "section" as any, header: "Section", render: (r: any) => <Badge variant="outline">{r.section}</Badge> },
                      { key: "total_paid" as any, header: "Amount Paid", render: (r: any) => formatCurrency(r.total_paid), className: "text-right", headerClassName: "text-right" },
                      { key: "tds_rate" as any, header: "Rate (%)", render: (r: any) => `${r.tds_rate}%`, className: "text-right", headerClassName: "text-right" },
                      { key: "tds_deducted" as any, header: "TDS", render: (r: any) => <span className="font-semibold">{formatCurrency(r.tds_deducted)}</span>, className: "text-right", headerClassName: "text-right" },
                      { key: "certificate_number" as any, header: "Certificate #", render: (r: any) => <span className="font-mono text-xs">{r.certificate_number}</span> },
                    ]}
                    data={form16a.data || []}
                    isLoading={form16a.isLoading}
                    emptyMessage="No Form 16A data for this financial year"
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}

          {activeTab === "pt" && (
            <div className="space-y-4">
              <FilingHeader filingId="pt" title="Professional Tax" desc="Monthly Professional Tax deduction as per state slabs. Upload to respective State Commercial Tax Portal." portal="State Portal" />
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

function FilingHeader({ title, desc, portal, portalUrl, filingId }: { title: string; desc: string; portal: string; portalUrl?: string; filingId: string }) {
  const dueInfo = getFilingDueDate(filingId);
  const rule = STATUTORY_DUE_RULES[filingId];
  
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
        {portalUrl ? (
          <a href={portalUrl} target="_blank" rel="noopener noreferrer">
            <Badge variant="outline" className="gap-1 text-xs cursor-pointer hover:bg-accent">
              <AlertCircle className="h-3 w-3" /> Upload to {portal}
            </Badge>
          </a>
        ) : (
          <Badge variant="outline" className="gap-1 text-xs">
            <AlertCircle className="h-3 w-3" /> Upload to {portal}
          </Badge>
        )}
      </div>
      {dueInfo && rule && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${URGENCY_STYLES[dueInfo.urgency].bg} ${URGENCY_STYLES[dueInfo.urgency].border}`}>
          {(() => { const UrgIcon = URGENCY_STYLES[dueInfo.urgency].icon; return <UrgIcon className={`h-4 w-4 shrink-0 ${URGENCY_STYLES[dueInfo.urgency].text}`} />; })()}
          <div className="flex-1 min-w-0">
            <span className={`text-sm font-semibold ${URGENCY_STYLES[dueInfo.urgency].text}`}>
              {dueInfo.daysRemaining < 0
                ? `Overdue by ${Math.abs(dueInfo.daysRemaining)} days`
                : dueInfo.daysRemaining === 0
                ? "Due today!"
                : `${dueInfo.daysRemaining} days remaining`}
            </span>
            <span className="text-sm text-muted-foreground ml-2">
              — {dueInfo.label}
            </span>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            Typical deadline: {rule.description}
          </span>
        </div>
      )}
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

// ─── GST Filing Status Panel ──────────────────────────────────────────────────

const FILING_STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  not_started: { label: "Not Started", variant: "secondary" },
  preparing: { label: "Preparing", variant: "outline" },
  ready: { label: "Ready to File", variant: "default" },
  filed: { label: "Filed", variant: "default" },
  acknowledged: { label: "Acknowledged", variant: "default" },
};

function GSTFilingStatusPanel({ filingType, month, fy, statuses, onUpdate, filingDialog, setFilingDialog, filingForm, setFilingForm }: {
  filingType: string;
  month: number;
  fy: string;
  statuses: any[];
  onUpdate: any;
  filingDialog: { type: string; open: boolean };
  setFilingDialog: (v: { type: string; open: boolean }) => void;
  filingForm: any;
  setFilingForm: (v: any) => void;
}) {
  const fyStartYear = parseInt(fy.split("-")[0]);
  const periodYear = month >= 4 ? fyStartYear : fyStartYear + 1;
  const existing = statuses.find(s => s.filing_type === filingType && s.period_month === month);
  const currentStatus = existing?.status || "not_started";
  const statusInfo = FILING_STATUS_LABELS[currentStatus] || FILING_STATUS_LABELS.not_started;

  const handleUpdate = () => {
    onUpdate.mutate({
      id: existing?.id,
      filing_type: filingType,
      period_month: month,
      period_year: periodYear,
      financial_year: fy,
      status: filingForm.status,
      arn_number: filingForm.arn_number,
      challan_number: filingForm.challan_number,
      filed_date: filingForm.filed_date || undefined,
    });
    setFilingDialog({ type: "", open: false });
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">Filing Status:</span>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            {existing?.arn_number && <span className="text-xs text-muted-foreground">ARN: <span className="font-mono">{existing.arn_number}</span></span>}
            {existing?.filed_date && <span className="text-xs text-muted-foreground">Filed: {existing.filed_date}</span>}
          </div>
          <Dialog open={filingDialog.type === filingType && filingDialog.open} onOpenChange={v => setFilingDialog({ type: filingType, open: v })}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => {
                setFilingForm({ status: currentStatus, arn_number: existing?.arn_number || "", challan_number: existing?.challan_number || "", filed_date: existing?.filed_date || "" });
                setFilingDialog({ type: filingType, open: true });
              }}>
                Update Filing Status
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Update {filingType.toUpperCase()} Filing Status</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Status</Label>
                  <Select value={filingForm.status} onValueChange={(v: string) => setFilingForm((p: any) => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_started">Not Started</SelectItem>
                      <SelectItem value="preparing">Preparing</SelectItem>
                      <SelectItem value="ready">Ready to File</SelectItem>
                      <SelectItem value="filed">Filed</SelectItem>
                      <SelectItem value="acknowledged">Acknowledged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Filed Date</Label><Input type="date" value={filingForm.filed_date} onChange={(e: any) => setFilingForm((p: any) => ({ ...p, filed_date: e.target.value }))} /></div>
                <div><Label>ARN Number</Label><Input value={filingForm.arn_number} onChange={(e: any) => setFilingForm((p: any) => ({ ...p, arn_number: e.target.value }))} placeholder="Acknowledgement Reference Number" /></div>
                <div><Label>Challan Number</Label><Input value={filingForm.challan_number} onChange={(e: any) => setFilingForm((p: any) => ({ ...p, challan_number: e.target.value }))} placeholder="Tax payment challan number" /></div>
                <Button onClick={handleUpdate} disabled={onUpdate.isPending} className="w-full">{onUpdate.isPending ? "Saving..." : "Update Status"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
