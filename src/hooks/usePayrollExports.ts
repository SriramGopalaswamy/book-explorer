import { supabase } from "@/integrations/supabase/client";
import type { PayrollEntry } from "@/hooks/usePayrollEngine";

async function logExport(action: string, metadata: Record<string, unknown>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await (supabase.from("audit_logs") as any).insert({
      actor_id: user.id,
      action,
      entity_type: "payroll_export",
      metadata,
    });
  } catch {
    // Audit logging is best-effort — a failure must never block the export itself.
    console.error("payroll export audit log failed", action, metadata);
  }
}

/**
 * PF ECR Export — generates EPFO ECR V2 tilde-delimited text file from locked payroll entries.
 *
 * Format: EPFO ECR V2 (Electronic Challan cum Return)
 *   Line 1: #~#  (mandatory format marker)
 *   Data rows: UAN~Name~Gross~EPFWages~EPSWages~EDLIWages~EEContri~ERContri~EPFerContri~EDLIContri~NCPDays~Refund
 *
 * Uses stored pf_employee / pf_employer columns — never re-derives from gross (FMEA 6.1).
 * Basic Salary is read from earnings_breakdown "Basic Salary" component.
 * A secondary CSV download is also triggered for human review.
 */
export async function exportPFECR(entries: PayrollEntry[], payPeriod: string) {
  const profileIds = entries.map((e) => e.profile_id);
  const { data: empDetails } = await supabase
    .from("employee_details")
    .select("profile_id, uan_number")
    .in("profile_id", profileIds);

  const uanMap = new Map((empDetails ?? []).map((d: any) => [d.profile_id, d.uan_number || ""]));

  const dataRows = entries.map((e) => {
    const grossWages = e.gross_earnings;
    const storedBasic = (e.earnings_breakdown as any[])?.find(
      (c: any) => c.name?.toLowerCase().includes("basic")
    )?.monthly ?? null;
    const epfWages = storedBasic !== null ? Math.min(storedBasic, 15000) : 0;
    const epsWages = Math.min(epfWages, 15000);
    // Use authoritative stored columns; fallback to statutory calculation only if absent.
    const pfEE  = e.pf_employee  ?? Math.round(epfWages * 0.12);
    const pfER  = e.pf_employer  ?? Math.round(epfWages * 0.12);
    const epsER = Math.round(epsWages * 0.0833);
    const epfER = Math.max(0, pfER - epsER);  // EPF ER = total ER − EPS ER
    const edli  = Math.round(epsWages * 0.005);

    return [
      uanMap.get(e.profile_id) || "",
      (e.profiles?.full_name || "").replace(/~/g, " "), // tilde not allowed in name
      grossWages,
      epfWages,
      epsWages,
      epsWages,  // EDLI wages = EPS wages
      pfEE,
      epsER,
      epfER,
      edli,
      e.lwp_days,
      0,         // Refund of Advances (always 0 unless specifically required)
    ];
  });

  // ── EPFO V2 primary output: tilde-delimited .txt ─────────────────────────
  const ecrLines = ["#~#", ...dataRows.map((r) => r.join("~"))];
  const ecrText = ecrLines.join("\r\n");
  const ecrBlob = new Blob([ecrText], { type: "text/plain" });
  const ecrUrl = URL.createObjectURL(ecrBlob);
  const ecrLink = document.createElement("a");
  ecrLink.href = ecrUrl;
  ecrLink.download = `PF_ECR_${payPeriod}.txt`;
  ecrLink.click();
  URL.revokeObjectURL(ecrUrl);

  // ── Secondary: comma-separated CSV for human review ───────────────────────
  const csvHeaders = [
    "UAN", "Member Name", "Gross Wages", "EPF Wages", "EPS Wages",
    "EDLI Wages", "EPF Contribution (EE)", "EPS Contribution (ER)",
    "EPF Contribution (ER)", "EDLI Contribution", "NCP Days", "Refund of Advances",
  ];
  const csv = [csvHeaders.join(","), ...dataRows.map((r) => r.join(","))].join("\n");
  downloadCSV(csv, `PF_ECR_${payPeriod}_review.csv`);

  await logExport("payroll_export_pf_ecr", { employee_count: entries.length, pay_period: payPeriod, format: "epfo_v2" });
}

/**
 * Bank Transfer File — generates NEFT-format CSV from locked payroll entries.
 * Pulls bank account details from employee_details.
 * Entries with no bank account number are included with a blank field and
 * reported back as warnings so the caller can surface them to the user (FMEA 6.2).
 */
export async function exportBankTransferFile(
  entries: PayrollEntry[],
  payPeriod: string,
  format: string = "generic_neft"
): Promise<{ warnings: string[] }> {
  // Fetch bank details
  const profileIds = entries.map((e) => e.profile_id);
  const { data: empDetails } = await supabase
    .from("employee_details")
    .select("profile_id, bank_account_number, bank_ifsc, bank_name")
    .in("profile_id", profileIds);

  const bankMap = new Map(
    (empDetails ?? []).map((d: any) => [d.profile_id, d])
  );

  const warnings: string[] = [];
  const headers = [
    "Beneficiary Name", "Account Number", "IFSC Code", "Bank Name", "Amount", "Remarks",
  ];

  const rows = entries.map((e) => {
    const bank = bankMap.get(e.profile_id) || {};
    if (!bank.bank_account_number) {
      warnings.push(`${e.profiles?.full_name || e.profile_id}: missing bank account — row included with blank account number.`);
    }
    return [
      e.profiles?.full_name || "",
      bank.bank_account_number || "",
      bank.bank_ifsc || "",
      bank.bank_name || "",
      e.net_pay,
      `Salary ${e.payroll_run_id?.slice(0, 8) || ""}`,
    ];
  });

  await logExport("payroll_export_bank_transfer", {
    employee_count: entries.length,
    pay_period: payPeriod,
    format,
    missing_accounts: warnings.length,
  });
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadCSV(csv, `Bank_Transfer_${format}.csv`);
  return { warnings };
}

/**
 * Payroll Master CSV — comprehensive export.
 */
export async function exportPayrollMasterCSV(entries: PayrollEntry[], payPeriod: string) {
  const headers = [
    "Employee Name", "Department", "Job Title", "Annual CTC",
    "Gross Earnings", "PF (Employee)", "PF (Employer)", "TDS",
    "ESI (Employee)", "Professional Tax", "Incentive", "Bonus",
    "Total Deductions", "LWP Days", "Working Days",
    "Paid Days", "Net Pay",
  ];

  const getComp = (breakdown: any[], name: string): number => {
    const item = (breakdown ?? []).find((c: any) => c.name === name);
    return item ? Number(item.amount ?? item.monthly ?? 0) : 0;
  };

  const rows = entries.map((e) => [
    e.profiles?.full_name || "",
    e.profiles?.department || "",
    e.profiles?.job_title || "",
    e.annual_ctc,
    e.gross_earnings,
    e.pf_employee ?? 0,
    e.pf_employer ?? 0,
    e.tds_amount ?? 0,
    e.esi_employee ?? 0,
    getComp(e.deductions_breakdown, "Professional Tax"),
    getComp(e.earnings_breakdown, "Incentive"),
    getComp(e.earnings_breakdown, "Bonus"),
    e.total_deductions,
    e.lwp_days,
    e.working_days,
    e.paid_days,
    e.net_pay,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  await logExport("payroll_export_master_csv", { employee_count: entries.length, pay_period: payPeriod });
  downloadCSV(csv, `Payroll_Master_${payPeriod}.csv`);
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
