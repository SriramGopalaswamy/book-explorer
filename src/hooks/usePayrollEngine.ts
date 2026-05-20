import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { usePayrollFlags, type PayrollFlags } from "@/hooks/usePayrollFlags";
import { useWritePayrollEvent } from "@/hooks/useWritePayrollEvent";
import { captureError } from "@/lib/monitoring";
import { toast } from "sonner";

export interface PayrollRun {
  id: string;
  organization_id: string;
  pay_period: string;
  status: string;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  employee_count: number;
  generated_by: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  locked_at: string | null;
  locked_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollEntry {
  id: string;
  payroll_run_id: string;
  profile_id: string;
  organization_id: string;
  compensation_structure_id: string | null;
  annual_ctc: number;
  gross_earnings: number;
  total_deductions: number;
  net_pay: number;
  lwp_days: number;
  lwp_deduction: number;
  working_days: number;
  paid_days: number;
  earnings_breakdown: any[];
  deductions_breakdown: any[];
  status: string;
  per_day_salary?: number;
  annual_ctc_snapshot?: number;
  tds_amount?: number;
  pf_employee?: number;
  pf_employer?: number;
  esi_employee?: number;
  esi_employer?: number;
  payslip_url?: string | null;
  payslip_generated_at?: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    full_name: string | null;
    email: string | null;
    department: string | null;
    job_title: string | null;
  } | null;
}

export function usePayrollRuns() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["payroll-runs", orgId],
    queryFn: async () => {
      if (!user) return [];
      let query = supabase
        .from("payroll_runs")
        .select("*")
        .order("pay_period", { ascending: false });
      if (orgId) query = query.eq("organization_id", orgId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as PayrollRun[];
    },
    enabled: !!user && !!orgId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function usePayrollRunEntries(runId: string | null) {
  return useQuery({
    queryKey: ["payroll-entries", runId],
    queryFn: async () => {
      if (!runId) return [];
      const { data, error } = await supabase
        .from("payroll_entries")
        .select("*, profiles!profile_id(full_name, email, department, job_title)")
        .eq("payroll_run_id", runId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PayrollEntry[];
    },
    enabled: !!runId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useGeneratePayroll() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const { data: flags } = usePayrollFlags();
  const { writeEvent } = useWritePayrollEvent();

  return useMutation({
    mutationFn: async (payPeriod: string) => {
      if (!user) throw new Error("Not authenticated");
      const orgId = org?.organizationId;
      if (!orgId) throw new Error("Organization not found");
      const f = flags || { pf_applicable: false, esi_applicable: false, professional_tax_applicable: false, gratuity_applicable: false } as PayrollFlags;

      // 1+2. Atomically claim the run via server-side RPC. Prevents duplicate
      //      runs when the button is double-clicked or the page is refreshed.
      const { data: claim, error: claimErr } = await supabase.rpc("start_payroll_run", {
        org_id: orgId,
        p_pay_period: payPeriod,
        initiated_by: user.id,
      });
      if (claimErr) throw claimErr;
      const claimRow = Array.isArray(claim) ? claim[0] : claim;
      if (!claimRow) throw new Error("Failed to claim payroll run");

      if (claimRow.status === "invalid_period") {
        throw new Error(`Invalid pay period format: ${payPeriod}`);
      }
      if (claimRow.status === "future_period") {
        throw new Error("Cannot generate payroll for a future period");
      }
      if (claimRow.status === "already_completed") {
        return {
          run: { id: claimRow.payroll_run_id } as any,
          entriesCount: 0,
          warnings: [`Payroll for ${payPeriod} is already completed.`],
          claimStatus: "already_completed" as const,
        };
      }
      if (claimRow.status === "already_processing") {
        return {
          run: { id: claimRow.payroll_run_id } as any,
          entriesCount: 0,
          warnings: [`Payroll for ${payPeriod} is already being generated. Watching progress…`],
          claimStatus: "already_processing" as const,
        };
      }

      // claimRow.status === "started" — fetch the freshly-created run
      const { data: run, error: runErr } = await supabase
        .from("payroll_runs")
        .select("*")
        .eq("id", claimRow.payroll_run_id)
        .single();
      if (runErr) throw runErr;

      // Append-only audit event. Fire-and-forget: errors are logged, never thrown.
      writeEvent({
        eventType: "payroll_run_started",
        payrollRunId: run.id,
        afterState: { pay_period: payPeriod, status: run.status },
      });

      // 3. Fetch active compensation structures effective during this pay period.
      //    A structure is included when its window overlaps the period month:
      //      effective_from <= last day of period  (or null → no start bound)
      //      effective_to   >= first day of period (or null → no end bound)
      const payPeriodStart = `${payPeriod}-01`;
      const [pyStr, pmStr] = payPeriod.split("-").map(Number);
      // Use getDate() on a local Date and format directly — toISOString() would
      // convert local midnight to UTC and shift the day back in UTC+ timezones.
      const lastDay = new Date(pyStr, pmStr, 0).getDate();
      const payPeriodEnd = `${pyStr}-${String(pmStr).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const { data: structures, error: sErr } = await supabase
        .from("compensation_structures")
        .select("*, compensation_components(*)")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .or(`effective_from.is.null,effective_from.lte.${payPeriodEnd}`)
        .or(`effective_to.is.null,effective_to.gte.${payPeriodStart}`);
      if (sErr) throw sErr;

      // Filter out inactive/terminated employees
      let eligibleStructures = structures || [];
      if (eligibleStructures.length > 0) {
        const profileIds = eligibleStructures.map((s: any) => s.profile_id);
        const { data: activeProfiles } = await supabase
          .from("profiles")
          .select("id, status")
          .in("id", profileIds)
          .eq("status", "active");
        
        const activeProfileIds = new Set((activeProfiles || []).map((p: any) => p.id));
        eligibleStructures = eligibleStructures.filter((s: any) => activeProfileIds.has(s.profile_id));
      }

      if (!eligibleStructures || eligibleStructures.length === 0) {
        // Phase 4 (2026-05-15): legacy payroll_records fallback retired.
        // The engine now requires compensation_structures as the source of truth.
        await supabase.from("payroll_runs").update({ status: "completed", employee_count: 0 }).eq("id", run.id);
        return {
          run,
          entriesCount: 0,
          warnings: [
            `No active compensation structures found for ${payPeriod}. ` +
              `Define compensation for active employees, or use Bulk Upload to seed entries directly.`,
          ],
        };
      }

      // 4. Fetch LWP for the period from leave_requests AND attendance_daily
      // Parse period: "2026-03", "2026-03-H1", "2026-03-W2"
      const periodParts = payPeriod.split("-");
      const year = parseInt(periodParts[0]);
      const month = parseInt(periodParts[1]);
      const periodSuffix = periodParts.length === 3 ? periodParts[2] : undefined;

      const daysInMonth = new Date(year, month, 0).getDate();
      let periodStartDay = 1;
      let periodEndDay = daysInMonth;
      if (periodSuffix === "H1") { periodEndDay = 15; }
      else if (periodSuffix === "H2") { periodStartDay = 16; }
      else if (periodSuffix?.startsWith("W")) {
        const weekNum = parseInt(periodSuffix.replace("W", ""));
        periodStartDay = (weekNum - 1) * 7 + 1;
        periodEndDay = weekNum === 4 ? daysInMonth : Math.min(weekNum * 7, daysInMonth);
      }

      const periodStart = `${year}-${String(month).padStart(2, "0")}-${String(periodStartDay).padStart(2, "0")}`;
      const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(periodEndDay).padStart(2, "0")}`;

      // Fetch company holidays and org weekend policy for this period
      const [holidaysRes, orgPolicyRes] = await Promise.all([
        supabase
          .from("holidays")
          .select("date")
          .eq("organization_id", orgId)
          .gte("date", periodStart)
          .lte("date", periodEnd),
        supabase
          .from("organizations")
          .select("weekend_policy")
          .eq("id", orgId)
          .maybeSingle(),
      ]);

      const weekendPolicy: string = (orgPolicyRes.data as any)?.weekend_policy || "sat_sun";

      // Exclude holidays that fall on weekends (they don't reduce working days)
      const holidayDates = new Set(
        (holidaysRes.data ?? [])
          .map((h: any) => h.date)
          .filter((dateStr: string) => {
            const dow = new Date(dateStr).getDay();
            if (weekendPolicy === "sat_sun" && (dow === 0 || dow === 6)) return false;
            if (weekendPolicy === "sun_only" && dow === 0) return false;
            return true;
          })
      );
      const workingDays = getWorkingDays(year, month, holidayDates, periodSuffix, weekendPolicy);

      // Source 1: Approved unpaid leaves
      const { data: leaves } = await supabase
        .from("leave_requests")
        .select("profile_id, start_date, end_date")
        .eq("organization_id", orgId)
        .eq("status", "approved")
        .eq("leave_type", "unpaid")
        .gte("end_date", periodStart)
        .lte("start_date", periodEnd);

      const lwpMap = new Map<string, number>();
      (leaves ?? []).forEach((l: any) => {
        const start = new Date(Math.max(new Date(l.start_date).getTime(), new Date(periodStart).getTime()));
        const end = new Date(Math.min(new Date(l.end_date).getTime(), new Date(periodEnd).getTime()));
        // Count only working days (skip weekends based on policy)
        let days = 0;
        const cur = new Date(start);
        while (cur <= end) {
          const dow = cur.getDay();
          const isWeekend =
            (weekendPolicy === "sat_sun" && (dow === 0 || dow === 6)) ||
            (weekendPolicy === "sun_only" && dow === 0);
          if (!isWeekend) days++;
          cur.setDate(cur.getDate() + 1);
        }
        lwpMap.set(l.profile_id, (lwpMap.get(l.profile_id) || 0) + days);
      });

      // Source 2: Attendance absences (status = 'A') from attendance_daily
      const { data: absences } = await supabase
        .from("attendance_daily")
        .select("profile_id, attendance_date")
        .eq("organization_id", orgId)
        .eq("status", "A")
        .gte("attendance_date", periodStart)
        .lte("attendance_date", periodEnd);

      // Merge absence days (avoid double-counting with leave days)
      const leaveProfileDates = new Set<string>();
      (leaves ?? []).forEach((l: any) => {
        const start = new Date(Math.max(new Date(l.start_date).getTime(), new Date(periodStart).getTime()));
        const end = new Date(Math.min(new Date(l.end_date).getTime(), new Date(periodEnd).getTime()));
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          leaveProfileDates.add(`${l.profile_id}:${d.toISOString().slice(0, 10)}`);
        }
      });

      (absences ?? []).forEach((a: any) => {
        const key = `${a.profile_id}:${a.attendance_date}`;
        if (!leaveProfileDates.has(key)) {
          // Skip absences on weekends — they're not working days
          const dow = new Date(a.attendance_date).getDay();
          const isWeekend =
            (weekendPolicy === "sat_sun" && (dow === 0 || dow === 6)) ||
            (weekendPolicy === "sun_only" && dow === 0);
          if (!isWeekend) {
            lwpMap.set(a.profile_id, (lwpMap.get(a.profile_id) || 0) + 1);
          }
        }
      });

      // Determine the divisor based on frequency
      // Monthly = 12, Biweekly = 24, Weekly = 52
      const periodsPerYear = periodSuffix?.startsWith("W") ? 52
        : periodSuffix?.startsWith("H") ? 24
        : 12;

      // 5. Generate entries
      const entries = eligibleStructures.map((s: any) => {
        const components = s.compensation_components || [];
        const lwpDays = lwpMap.get(s.profile_id) || 0;
        const paidDays = Math.max(0, workingDays - lwpDays);
        const payRatio = workingDays > 0 ? paidDays / workingDays : 1;

        const earningsBreakdown: any[] = [];
        const deductionsBreakdown: any[] = [];
        let grossEarnings = 0;
        let totalDeductions = 0;

        components
          .sort((a: any, b: any) => a.display_order - b.display_order)
          .forEach((c: any) => {
            const periodAmount = Math.round((Number(c.annual_amount) / periodsPerYear) * payRatio);
            const item = {
              name: c.component_name,
              annual: Number(c.annual_amount),
              monthly: periodAmount,
              is_taxable: c.is_taxable,
            };
            if (c.component_type === "earning") {
              earningsBreakdown.push(item);
              grossEarnings += periodAmount;
            } else if (c.component_type === "employer_contribution") {
              // Employer contributions (e.g. Employer PF) are part of CTC but NOT
              // the employee's gross salary — show in breakdown only.
              earningsBreakdown.push({ ...item, employer_contribution: true });
            } else {
              deductionsBreakdown.push(item);
              totalDeductions += periodAmount;
            }
          });

        // ── Statutory deductions based on org payroll flags ──
        // Find basic salary component for PF wage base
        const basicComponent = earningsBreakdown.find(
          (e: any) => e.name.toLowerCase().includes("basic")
        );
        const basicMonthly = basicComponent?.monthly || 0;

        let pfEmployee = 0;
        let pfEmployer = 0;
        let esiEmployee = 0;
        let esiEmployer = 0;
        let ptAmount = 0;

        // PF: 12% employee + 12% employer on basic (capped at ₹15,000 wage ceiling)
        // Skip if a PF/provident deduction is already present via compensation component.
        const alreadyHasPF = deductionsBreakdown.some(
          (d: any) => d.name?.toLowerCase().includes("pf") || d.name?.toLowerCase().includes("provident")
        );
        if (f.pf_applicable && !alreadyHasPF && basicMonthly > 0) {
          const pfWage = Math.min(basicMonthly, 15000);
          pfEmployee = Math.round(pfWage * 0.12);
          pfEmployer = Math.round(pfWage * 0.12);
          deductionsBreakdown.push({
            name: "PF (Employee 12%)",
            annual: pfEmployee * 12,
            monthly: pfEmployee,
            is_taxable: false,
            statutory: true,
          });
          totalDeductions += pfEmployee;
        }

        // ESI not applicable — no ESI deduction for any employee.


        // Professional Tax: Karnataka slab (common)
        // Skip if PT is already present via compensation component.
        const alreadyHasPT = deductionsBreakdown.some(
          (d: any) => d.name?.toLowerCase().includes("professional tax")
        );
        if (f.professional_tax_applicable && !alreadyHasPT && grossEarnings > 0) {
          if (grossEarnings > 15000) ptAmount = 200;
          else if (grossEarnings > 10000) ptAmount = 150;
          else ptAmount = 0;

          if (ptAmount > 0) {
            deductionsBreakdown.push({
              name: "Professional Tax",
              annual: ptAmount * 12,
              monthly: ptAmount,
              is_taxable: false,
              statutory: true,
            });
            totalDeductions += ptAmount;
          }
        }

        const perDaySalary = workingDays > 0 ? Math.round(grossEarnings / workingDays) : 0;
        const lwpDeduction = lwpDays > 0 ? perDaySalary * lwpDays : 0;

        // Ensure net pay is never negative — cap deductions at gross
        const rawNetPay = grossEarnings - totalDeductions;
        const netPay = Math.max(rawNetPay, 0);
        if (rawNetPay < 0) {
          captureError(
            new Error(`Negative net pay clamped to 0`),
            { context: "usePayrollEngine.processRun", profile_id: s.profile_id, gross: grossEarnings, deductions: totalDeductions },
          );
        }

        return {
          payroll_run_id: run.id,
          profile_id: s.profile_id,
          organization_id: orgId,
          compensation_structure_id: s.id,
          annual_ctc: Number(s.annual_ctc),
          gross_earnings: grossEarnings,
          total_deductions: totalDeductions,
          net_pay: netPay,
          lwp_days: lwpDays,
          lwp_deduction: lwpDeduction,
          working_days: workingDays,
          paid_days: paidDays,
          earnings_breakdown: earningsBreakdown,
          deductions_breakdown: deductionsBreakdown,
          pf_employee: pfEmployee,
          pf_employer: pfEmployer,
          esi_employee: esiEmployee,
          esi_employer: esiEmployer,
          status: "computed",
        };
      });

      if (entries.length > 0) {
        const { error: eErr } = await supabase.from("payroll_entries").insert(entries);
        if (eErr) {
          // Rollback: delete orphan run
          await supabase.from("payroll_runs").delete().eq("id", run.id);
          throw eErr;
        }
      }

      // 6. Update run totals
      const totalGross = entries.reduce((s: number, e: any) => s + e.gross_earnings, 0);
      const totalDed = entries.reduce((s: number, e: any) => s + e.total_deductions, 0);
      const totalNet = entries.reduce((s: number, e: any) => s + e.net_pay, 0);

      await supabase.from("payroll_runs").update({
        status: "completed",
        employee_count: entries.length,
        total_gross: totalGross,
        total_deductions: totalDed,
        total_net: totalNet,
      }).eq("id", run.id);

      return { run, entriesCount: entries.length, warnings: [] as string[] };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      if (data.claimStatus === "already_completed") {
        toast.info(data.warnings?.[0] || "Payroll already completed for this period.");
        return;
      }
      if (data.claimStatus === "already_processing") {
        toast.info(data.warnings?.[0] || "Payroll generation already in progress.");
        return;
      }
      toast.success(`Payroll generated for ${data.entriesCount} employees`);
      data.warnings?.forEach((w: string) => toast.warning(w));
    },
    onError: (err: any) => {
      if (err.message?.includes("duplicate key") || err.message?.includes("already exists")) {
        toast.error("Payroll already exists for this period");
      } else {
        toast.error("Failed to generate payroll: " + err.message);
      }
    },
  });
}

export function useLockPayrollRun() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (runId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Only approved runs can be locked
      const { data: run } = await supabase
        .from("payroll_runs")
        .select("status")
        .eq("id", runId)
        .single();
      if (!run) throw new Error("Payroll run not found");
      if (!["approved", "completed"].includes(run.status)) {
        throw new Error(`Cannot lock a payroll run with status '${run.status}'. Must be approved first.`);
      }

      // Resolve caller org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      const { error } = await supabase
        .from("payroll_runs")
        .update({ status: "locked", locked_at: new Date().toISOString(), locked_by: user.id })
        .eq("id", runId)
        .eq("organization_id", callerProfile.organization_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Payroll run locked successfully");
    },
    onError: (err: any) => {
      toast.error("Failed to lock: " + err.message);
    },
  });
}

export function useDeletePayrollRun() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (runId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Only draft/completed runs can be deleted — locked/approved cannot
      const { data: run } = await supabase
        .from("payroll_runs")
        .select("status")
        .eq("id", runId)
        .single();
      if (!run) throw new Error("Payroll run not found");
      if (["locked", "approved", "under_review"].includes(run.status)) {
        throw new Error(`Cannot delete a payroll run with status '${run.status}'`);
      }

      // Resolve caller org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      const { error } = await supabase.from("payroll_runs").delete().eq("id", runId).eq("organization_id", callerProfile.organization_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      toast.success("Payroll run deleted");
    },
    onError: (err: any) => {
      toast.error("Delete failed: " + err.message);
    },
  });
}

export function useUpdateEntryLWP() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ entryId, lwpDays, runId }: { entryId: string; lwpDays: number; runId: string }) => {
      if (lwpDays < 0) throw new Error("LWP days cannot be negative");

      // Ensure run is not locked
      const { data: run } = await supabase
        .from("payroll_runs")
        .select("status")
        .eq("id", runId)
        .single();
      if (run?.status === "locked") throw new Error("Cannot modify entries on a locked payroll run");

      // Fetch the current entry to recalculate
      const { data: entry, error: fetchErr } = await supabase
        .from("payroll_entries")
        .select("*, profiles!profile_id(full_name)")
        .eq("id", entryId)
        .single();
      if (fetchErr) throw fetchErr;

      const workingDays = entry.working_days;
      const paidDays = Math.max(0, workingDays - lwpDays);
      const payRatio = workingDays > 0 ? paidDays / workingDays : 1;

      // Recalculate earnings from breakdown
      const earningsBreakdown = ((entry.earnings_breakdown as any[]) || []).map((c: any) => ({
        ...c,
        monthly: Math.round((Number(c.annual) / 12) * payRatio),
      }));
      const deductionsBreakdown = ((entry.deductions_breakdown as any[]) || []).map((c: any) => ({
        ...c,
        monthly: Math.round((Number(c.annual) / 12) * payRatio),
      }));

      const grossEarnings = earningsBreakdown.reduce((s: number, c: any) => s + c.monthly, 0);
      const totalDeductions = deductionsBreakdown.reduce((s: number, c: any) => s + c.monthly, 0);
      const perDaySalary = workingDays > 0 ? Math.round((Number(entry.annual_ctc) / 12) / workingDays) : 0;
      const lwpDeduction = lwpDays * perDaySalary;
      const netPay = Math.max(grossEarnings - totalDeductions, 0);

      const { error: updateErr } = await supabase
        .from("payroll_entries")
        .update({
          lwp_days: lwpDays,
          lwp_deduction: lwpDeduction,
          paid_days: paidDays,
          gross_earnings: grossEarnings,
          total_deductions: totalDeductions,
          net_pay: netPay,
          per_day_salary: perDaySalary,
          earnings_breakdown: earningsBreakdown,
          deductions_breakdown: deductionsBreakdown,
        })
        .eq("id", entryId);
      if (updateErr) throw updateErr;

      // Update run totals
      const { data: allEntries } = await supabase
        .from("payroll_entries")
        .select("gross_earnings, total_deductions, net_pay")
        .eq("payroll_run_id", runId);

      if (allEntries) {
        // Apply the current update to the entry we just changed
        const totals = allEntries.reduce(
          (acc, e) => ({
            gross: acc.gross + Number(e.gross_earnings),
            ded: acc.ded + Number(e.total_deductions),
            net: acc.net + Number(e.net_pay),
          }),
          { gross: 0, ded: 0, net: 0 }
        );

        await supabase.from("payroll_runs").update({
          total_gross: totals.gross,
          total_deductions: totals.ded,
          total_net: totals.net,
        }).eq("id", runId);
      }

      return { entryId, lwpDays };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success(`Leave adjustment updated: ${data.lwpDays} LWP days`);
    },
    onError: (err: any) => {
      toast.error("Failed to update LWP: " + err.message);
    },
  });
}

/**
 * Calculate working days for a pay period.
 * Supports: "2026-03" (full month), "2026-03-H1" / "H2" (biweekly), "2026-03-W1..W4" (weekly)
 */
function getWorkingDays(year: number, month: number, holidayDates?: Set<string>, periodSuffix?: string, weekendPolicy: string = "sat_sun"): number {
  const daysInMonth = new Date(year, month, 0).getDate();

  let startDay = 1;
  let endDay = daysInMonth;

  if (periodSuffix === "H1") {
    endDay = 15;
  } else if (periodSuffix === "H2") {
    startDay = 16;
  } else if (periodSuffix?.startsWith("W")) {
    const weekNum = parseInt(periodSuffix.replace("W", ""));
    startDay = (weekNum - 1) * 7 + 1;
    endDay = weekNum === 4 ? daysInMonth : Math.min(weekNum * 7, daysInMonth);
  }

  let working = 0;
  for (let d = startDay; d <= endDay; d++) {
    const date = new Date(year, month - 1, d);
    const day = date.getDay();
    // Skip weekends based on org policy
    if (weekendPolicy === "sat_sun" && (day === 0 || day === 6)) continue;
    if (weekendPolicy === "sun_only" && day === 0) continue;
    // 'none' = no weekends, all days are working days
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (holidayDates?.has(dateStr)) continue; // skip holidays
    working++;
  }
  return working;
}

export async function exportPayrollCSV(
  entries: PayrollEntry[],
  payPeriod: string,
  orgId?: string,
) {
  const headers = [
    "Employee Name", "Department", "Job Title", "Annual CTC",
    "Gross Earnings", "PF (Employee)", "PF (Employer)", "TDS",
    "Professional Tax", "Incentive", "Bonus",
    "Total Deductions", "LWP Days", "LWP Deduction",
    "Working Days", "Paid Days", "Net Pay",
  ];

  const escapeCSV = (val: string | number): string => {
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

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
    getComp(e.deductions_breakdown, "Professional Tax"),
    getComp(e.earnings_breakdown, "Incentive"),
    getComp(e.earnings_breakdown, "Bonus"),
    e.total_deductions,
    e.lwp_days,
    e.lwp_deduction,
    e.working_days,
    e.paid_days,
    e.net_pay,
  ]);

  const csv = [headers.map(escapeCSV).join(","), ...rows.map((r) => r.map(escapeCSV).join(","))].join("\n");
  const fileName = `payroll_${payPeriod}.csv`;

  // GBC-13: server-side audit BEFORE download — block on failure.
  if (orgId) {
    const { logExportEvent } = await import("@/lib/log-export");
    await logExportEvent({
      organizationId: orgId,
      exportType: "payroll_csv",
      fileName,
      rowCount: entries.length,
    });
  } else if (typeof window !== "undefined") {
    console.warn("[audit] exportPayrollCSV called without orgId — export not logged.");
  }

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

