import { supabase } from "@/integrations/supabase/client";
import type { PayrollEntry } from "@/hooks/usePayrollEngine";

async function logExport(action: string, metadata: Record<string, unknown>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("audit_logs").insert({
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
 * PF ECR Export — generates EPFO-compliant CSV from locked payroll entries.
 * Pulls UAN from employee_details.
 * Basic is read from earnings_breakdown "Basic Salary" — never re-derived
 * from gross (FMEA 6.1): a re-derived basic would diverge from the locked payslip.
 */
export async function exportPFECR(entries: PayrollEntry[], payPeriod: string) {
  // Fetch UAN data
  const profileIds = entries.map((e) => e.profile_id);
  const { data: empDetails } = await supabase
    .from("employee_details")
    .select("profile_id, uan_number")
    .in("profile_id", profileIds);

  const uanMap = new Map((empDetails ?? []).map((d: any) => [d.profile_id, d.uan_number || ""]));

  const headers = [
    "UAN", "Member Name", "Gross Wages", "EPF Wages", "EPS Wages",
    "EDLI Wages", "EPF Contribution (EE)", "EPS Contribution (ER)",
    "EPF Contribution (ER)", "EDLI Contribution", "NCP Days", "Refund of Advances",
  ];

  const rows = entries.map((e) => {
    const grossWages = e.gross_earnings;
    // Use stored Basic Salary from the locked breakdown — do NOT re-derive from gross.
    const storedBasic = (e.earnings_breakdown as any[])?.find(
      (c: any) => c.name?.toLowerCase().includes("basic")
    )?.monthly ?? null;
    // If basic is absent from the breakdown, epfWages cannot be calculated reliably;
    // fall back to 0 so the ECR is visibly incomplete rather than silently wrong.
    const epfWages = storedBasic !== null ? Math.min(storedBasic, 15000) : 0;
    const epsWages = Math.min(epfWages, 15000);
    // pf_employee column is the authoritative stored value; never re-derive (FMEA 6.1).
    const pfEE = e.pf_employee ?? 0;
    const epsER = Math.round(epsWages * 0.0833);
    const epfER = Math.round(epfWages * 0.0367);
    const edli = Math.round(epsWages * 0.005);

    return [
      uanMap.get(e.profile_id) || "",
      e.profiles?.full_name || "",
      grossWages,
      epfWages,
      epsWages,
      epsWages,
      pfEE,
      epsER,
      epfER,
      edli,
      e.lwp_days,
      0,
    ];
  });

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  await logExport("payroll_export_pf_ecr", { employee_count: entries.length, pay_period: payPeriod });
  downloadCSV(csv, "PF_ECR_Export.csv");
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
