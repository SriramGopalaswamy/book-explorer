/**
 * Unified payslip data normalizer.
 * 
 * Two payroll paths exist:
 * 1. Legacy: `payroll_records` with hardcoded columns (basic_salary, hra, etc.)
 * 2. Engine: `payroll_entries` with dynamic earnings_breakdown/deductions_breakdown JSON
 *
 * This module normalizes both into a single shape for PaySlipDialog and MyPayslips.
 */

export interface PayslipLineItem {
  label: string;
  amount: number;
  statutory?: boolean;
}

export interface NormalizedPayslip {
  earnings: PayslipLineItem[];
  deductions: PayslipLineItem[];
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  lopDays: number;
  lopDeduction: number;
  workingDays: number;
  paidDays: number;
  isEnginePath: boolean;
}

/**
 * Detect whether a record comes from the engine path (payroll_entries)
 * or the legacy path (payroll_records).
 */
function hasEngineBreakdown(record: any): boolean {
  const eb = record.earnings_breakdown;
  return Array.isArray(eb) && eb.length > 0;
}

/**
 * Normalize any payroll record shape into a unified PayslipLineItem structure.
 */
export function normalizePayslip(record: any): NormalizedPayslip {
  if (hasEngineBreakdown(record)) {
    return normalizeEngineRecord(record);
  }
  return normalizeLegacyRecord(record);
}

function normalizeEngineRecord(record: any): NormalizedPayslip {
  const earningsRaw: any[] = record.earnings_breakdown || [];
  const deductionsRaw: any[] = record.deductions_breakdown || [];

  const earnings: PayslipLineItem[] = earningsRaw.map((e: any) => ({
    label: e.name,
    amount: Number(e.monthly) || 0,
    statutory: !!e.statutory,
  }));

  const deductions: PayslipLineItem[] = deductionsRaw.map((d: any) => ({
    label: d.name,
    amount: Number(d.monthly) || 0,
    statutory: !!d.statutory,
  }));

  const totalEarnings = earnings.reduce((s, e) => s + e.amount, 0);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);

  return {
    earnings,
    deductions,
    totalEarnings,
    totalDeductions,
    netPay: Number(record.net_pay) || (totalEarnings - totalDeductions),
    lopDays: Number(record.lwp_days) || 0,
    lopDeduction: Number(record.lwp_deduction) || 0,
    workingDays: Number(record.working_days) || 0,
    paidDays: Number(record.paid_days) || 0,
    isEnginePath: true,
  };
}

function normalizeLegacyRecord(record: any): NormalizedPayslip {
  const basic        = Number(record.basic_salary) || 0;
  const hra          = Number(record.hra) || 0;
  // transport_allowance is repurposed for variable pay (Incentives) in bulk-uploaded records.
  // Legacy records that stored actual transport amount will display it under "Incentives" —
  // the amount is small and these records were historically incorrect anyway.
  const incentives   = Number(record.transport_allowance) || 0;
  const otherAllow   = Number(record.other_allowances) || 0;

  // Earnings: match company payslip layout — Basic, HRA, Other Allowances, Incentives
  const earnings: PayslipLineItem[] = [
    { label: "Basic", amount: basic },
    { label: "HRA", amount: hra },
    ...(otherAllow > 0 ? [{ label: "Other Allowances", amount: otherAllow }] : []),
    ...(incentives > 0 ? [{ label: "Incentives", amount: incentives }] : []),
  ];

  // Professional Tax is stored in other_deductions; TDS is stored in tax_deduction.
  const profTax = Number(record.other_deductions) || 0;
  const tds     = Number(record.tax_deduction) || 0;
  const pf      = Number(record.pf_deduction) || 0;

  // Deductions: match company payslip layout — Professional Tax, TDS, PF Contribution, LOP
  const deductions: PayslipLineItem[] = [
    ...(profTax > 0 ? [{ label: "Professional Tax", amount: profTax, statutory: true }] : []),
    ...(tds > 0     ? [{ label: "TDS", amount: tds, statutory: true }] : []),
    ...(pf > 0      ? [{ label: "PF Contribution", amount: pf, statutory: true }] : []),
  ];

  const lopDays = Number(record.lop_days) || 0;
  let lopDeduction = Number(record.lop_deduction) || 0;

  // If LOP days were recorded but the deduction amount wasn't stored, derive it
  if (lopDays > 0 && lopDeduction === 0) {
    const grossFixed = basic + hra + otherAllow;
    const wd = Number(record.working_days) || 0;
    if (wd > 0) {
      lopDeduction = Math.round((grossFixed / wd) * lopDays);
    }
  }

  if (lopDays > 0) {
    deductions.push({ label: `LOP (${lopDays} days)`, amount: lopDeduction, statutory: false });
  }

  const totalEarnings = earnings.reduce((s, e) => s + e.amount, 0);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);

  return {
    earnings,
    deductions,
    totalEarnings,
    totalDeductions,
    netPay: Number(record.net_pay) || (totalEarnings - totalDeductions),
    lopDays,
    lopDeduction,
    workingDays: Number(record.working_days) || 0,
    paidDays: Number(record.paid_days) || 0,
    isEnginePath: false,
  };
}
