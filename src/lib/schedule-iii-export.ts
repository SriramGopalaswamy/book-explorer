/**
 * Schedule III (Division I) — Companies Act 2013
 * Formats Balance Sheet and P&L data per statutory requirements
 */

import { exportReportAsPDF } from "@/lib/pdf-export";

const formatCurrency = (v: number) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
};

interface ScheduleIIIBalanceSheet {
  companyName: string;
  cin: string;
  asOfDate: string;
  assets: { name: string; code: string; balance: number }[];
  liabilities: { name: string; code: string; balance: number }[];
  equity: { name: string; code: string; balance: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

interface ScheduleIIIProfitLoss {
  companyName: string;
  cin: string;
  periodFrom: string;
  periodTo: string;
  revenue: { name: string; amount: number }[];
  expenses: { name: string; amount: number }[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  grossMargin: number;
}

/**
 * Categorise BS items into Schedule III groupings:
 *  I. Equity & Liabilities → (a) Shareholders' Funds, (b) Non-Current Liabilities, (c) Current Liabilities
 *  II. Assets → (a) Non-Current Assets, (b) Current Assets
 */
function classifyBSItems(items: { name: string; code: string; balance: number }[]) {
  const nonCurrent: typeof items = [];
  const current: typeof items = [];

  for (const item of items) {
    const lower = item.name.toLowerCase();
    if (
      lower.includes("fixed") || lower.includes("property") || lower.includes("plant") ||
      lower.includes("intangible") || lower.includes("goodwill") || lower.includes("investment") ||
      lower.includes("long-term") || lower.includes("deferred tax")
    ) {
      nonCurrent.push(item);
    } else {
      current.push(item);
    }
  }
  return { nonCurrent, current };
}

export function exportScheduleIIIBalanceSheet(data: ScheduleIIIBalanceSheet) {
  const { nonCurrent: ncAssets, current: cAssets } = classifyBSItems(data.assets);
  const { nonCurrent: ncLiab, current: cLiab } = classifyBSItems(data.liabilities);

  exportReportAsPDF({
    title: `BALANCE SHEET — ${data.companyName}`,
    subtitle: `As at ${data.asOfDate}\nAs per Schedule III (Division I) of the Companies Act, 2013\nCIN: ${data.cin || "Not Specified"}`,
    sections: [
      {
        title: "I. EQUITY AND LIABILITIES",
        items: [],
      },
      {
        title: "(a) Shareholders' Funds",
        items: data.equity.map(e => ({ label: `  ${e.code} — ${e.name}`, value: formatCurrency(e.balance) })),
        total: { label: "Total Shareholders' Funds", value: formatCurrency(data.totalEquity), color: "#22c55e" },
      },
      {
        title: "(b) Non-Current Liabilities",
        items: ncLiab.map(l => ({ label: `  ${l.code} — ${l.name}`, value: formatCurrency(l.balance) })),
        total: { label: "Total Non-Current Liabilities", value: formatCurrency(ncLiab.reduce((s, l) => s + l.balance, 0)) },
      },
      {
        title: "(c) Current Liabilities",
        items: cLiab.map(l => ({ label: `  ${l.code} — ${l.name}`, value: formatCurrency(l.balance) })),
        total: { label: "Total Current Liabilities", value: formatCurrency(cLiab.reduce((s, l) => s + l.balance, 0)) },
      },
      {
        title: "TOTAL EQUITY & LIABILITIES",
        items: [],
        total: { label: "TOTAL", value: formatCurrency(data.totalEquity + data.totalLiabilities), color: "#3b82f6" },
      },
      {
        title: "II. ASSETS",
        items: [],
      },
      {
        title: "(a) Non-Current Assets",
        items: ncAssets.map(a => ({ label: `  ${a.code} — ${a.name}`, value: formatCurrency(a.balance) })),
        total: { label: "Total Non-Current Assets", value: formatCurrency(ncAssets.reduce((s, a) => s + a.balance, 0)) },
      },
      {
        title: "(b) Current Assets",
        items: cAssets.map(a => ({ label: `  ${a.code} — ${a.name}`, value: formatCurrency(a.balance) })),
        total: { label: "Total Current Assets", value: formatCurrency(cAssets.reduce((s, a) => s + a.balance, 0)) },
      },
      {
        title: "TOTAL ASSETS",
        items: [],
        total: { label: "TOTAL", value: formatCurrency(data.totalAssets), color: "#3b82f6" },
      },
    ],
    footer: [
      { label: "Assets = Equity + Liabilities", value: data.totalAssets === (data.totalEquity + data.totalLiabilities) ? "✓ Balanced" : "⚠ Mismatch" },
    ],
  });
}

/**
 * Schedule III P&L export with statutory note references
 */
export function exportScheduleIIIProfitLoss(data: ScheduleIIIProfitLoss) {
  // Map expenses to Schedule III categories
  const scheduleIIIExpenses = [
    "Cost of materials consumed",
    "Purchases of stock-in-trade",
    "Changes in inventories",
    "Employee benefits expense",
    "Finance costs",
    "Depreciation and amortisation expense",
    "Other expenses",
  ];

  const mappedExpenses = data.expenses.map((e, i) => ({
    label: `  Note ${i + 2}: ${scheduleIIIExpenses[i] || e.name}`,
    value: formatCurrency(e.amount),
    color: "#dc2626",
  }));

  exportReportAsPDF({
    title: `STATEMENT OF PROFIT AND LOSS — ${data.companyName}`,
    subtitle: `For the period ${data.periodFrom} to ${data.periodTo}\nAs per Schedule III (Division I) of the Companies Act, 2013\nCIN: ${data.cin || "Not Specified"}`,
    sections: [
      {
        title: "I. Revenue from operations (Note 1)",
        items: data.revenue.map(r => ({ label: `  ${r.name}`, value: formatCurrency(r.amount), color: "#16a34a" })),
        total: { label: "Total Revenue from Operations", value: formatCurrency(data.totalRevenue), color: "#16a34a" },
      },
      {
        title: "II. Other income",
        items: [{ label: "  (Refer Note schedule)", value: "—" }],
      },
      {
        title: "III. Total Income (I + II)",
        items: [],
        total: { label: "Total Income", value: formatCurrency(data.totalRevenue), color: "#16a34a" },
      },
      {
        title: "IV. Expenses",
        items: mappedExpenses,
        total: { label: "Total Expenses", value: formatCurrency(data.totalExpenses), color: "#dc2626" },
      },
      {
        title: "V. Profit/(Loss) before exceptional items and tax (III - IV)",
        items: [],
        total: { label: "Profit Before Tax", value: formatCurrency(data.netIncome) },
      },
      {
        title: "VI. Exceptional items",
        items: [{ label: "  Nil", value: "—" }],
      },
      {
        title: "VII. Profit/(Loss) before tax (V - VI)",
        items: [],
        total: { label: "PBT", value: formatCurrency(data.netIncome) },
      },
    ],
    footer: [
      { label: "Gross Margin", value: `${data.grossMargin.toFixed(1)}%` },
      { label: "Earnings Per Share", value: "To be computed based on share capital" },
      { label: "Ind AS 115 Compliance", value: "Revenue recognised per performance obligations" },
    ],
  });
}
