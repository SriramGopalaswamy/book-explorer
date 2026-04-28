import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch the payslip display record for a dispute review dialog.
 *
 * Strategy (two-path, engine wins):
 *  1. If payroll_record_id given → try payroll_records (legacy FK constraint requires this)
 *  2. If profile_id + pay_period given → also probe payroll_entries (engine path);
 *     the engine entry is preferred because it carries richer breakdown JSON.
 *
 * Returns a flat PayrollRecord-shaped object (as `any`) with `profiles` nested,
 * suitable for the PayslipSummarySection / dispute review inline summary.
 */
export async function fetchPayslipForDispute(dispute: {
  payroll_record_id?: string | null;
  profile_id?: string | null;
  pay_period?: string | null;
}): Promise<any> {
  const profileSelect = "full_name, department, job_title";

  // ── Try engine path first if we have profile+period ──────────────────────
  if (dispute.profile_id && dispute.pay_period) {
    const { data: entry } = await supabase
      .from("payroll_entries")
      .select(
        "id, profile_id, gross_earnings, total_deductions, net_pay, lwp_days, lwp_deduction, working_days, paid_days, status, earnings_breakdown, deductions_breakdown, pf_employee, tds_amount, created_at, updated_at, payroll_runs!inner(pay_period), profiles!profile_id(" + profileSelect + ")"
      )
      .eq("profile_id", dispute.profile_id)
      .eq("payroll_runs.pay_period", dispute.pay_period)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (entry) {
      return normalizeEngineForDisplay(entry);
    }
  }

  // ── Fall back to payroll_records (legacy + all existing disputes) ─────────
  if (dispute.payroll_record_id) {
    const { data, error } = await supabase
      .from("payroll_records")
      .select("*, profiles:profile_id(" + profileSelect + ")")
      .eq("id", dispute.payroll_record_id)
      .maybeSingle();
    if (!error && data) return data;
  }

  if (dispute.profile_id && dispute.pay_period) {
    const { data } = await supabase
      .from("payroll_records")
      .select("*, profiles:profile_id(" + profileSelect + ")")
      .eq("profile_id", dispute.profile_id)
      .eq("pay_period", dispute.pay_period)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

function normalizeEngineForDisplay(e: any): any {
  const getComp = (breakdown: any[], ...names: string[]) => {
    for (const n of names) {
      const item = (breakdown ?? []).find((c: any) =>
        c.name?.toLowerCase().includes(n.toLowerCase())
      );
      if (item) return Number(item.monthly ?? 0);
    }
    return 0;
  };

  return {
    id: e.id,
    profile_id: e.profile_id,
    pay_period: e.payroll_runs?.pay_period ?? "",
    basic_salary: getComp(e.earnings_breakdown, "basic"),
    hra: getComp(e.earnings_breakdown, "hra"),
    transport_allowance: getComp(e.earnings_breakdown, "incentiv", "transport"),
    other_allowances: getComp(e.earnings_breakdown, "other allowance"),
    pf_deduction: e.pf_employee ?? getComp(e.deductions_breakdown, "pf"),
    tax_deduction: e.tds_amount ?? getComp(e.deductions_breakdown, "tds", "tax"),
    other_deductions:
      getComp(e.deductions_breakdown, "professional tax") +
      getComp(e.deductions_breakdown, "other deduction"),
    lop_days: e.lwp_days ?? 0,
    lop_deduction: e.lwp_deduction ?? 0,
    working_days: e.working_days ?? 0,
    paid_days: e.paid_days ?? 0,
    net_pay: e.net_pay,
    status: e.status,
    profiles: e.profiles ?? null,
  };
}
