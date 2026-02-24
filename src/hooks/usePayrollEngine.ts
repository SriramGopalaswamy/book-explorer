import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
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
  return useQuery({
    queryKey: ["payroll-runs"],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("payroll_runs")
        .select("*")
        .order("pay_period", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PayrollRun[];
    },
    enabled: !!user,
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
  });
}

export function useGeneratePayroll() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: org } = useUserOrganization();

  return useMutation({
    mutationFn: async (payPeriod: string) => {
      if (!user) throw new Error("Not authenticated");
      const orgId = org?.organizationId;
      if (!orgId) throw new Error("Organization not found");

      // 1. Create payroll run
      const { data: run, error: runErr } = await supabase
        .from("payroll_runs")
        .insert({
          organization_id: orgId,
          pay_period: payPeriod,
          generated_by: user.id,
          status: "processing",
        })
        .select()
        .single();
      if (runErr) throw runErr;

      // 2. Fetch all active compensation structures for this org
      const { data: structures, error: sErr } = await supabase
        .from("compensation_structures")
        .select("*, compensation_components(*)")
        .eq("organization_id", orgId)
        .eq("is_active", true);
      if (sErr) throw sErr;

      if (!structures || structures.length === 0) {
        // Update run to completed with 0 employees
        await supabase.from("payroll_runs").update({ status: "completed", employee_count: 0 }).eq("id", run.id);
        return { run, entriesCount: 0 };
      }

      // 3. Fetch LWP for the period
      const [year, month] = payPeriod.split("-").map(Number);
      const periodStart = `${payPeriod}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const periodEnd = `${payPeriod}-${lastDay}`;
      const workingDays = getWorkingDays(year, month);

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
        const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
        lwpMap.set(l.profile_id, (lwpMap.get(l.profile_id) || 0) + days);
      });

      // 4. Generate entries
      const entries = structures.map((s: any) => {
        const components = s.compensation_components || [];
        const lwpDays = lwpMap.get(s.profile_id) || 0;
        const paidDays = workingDays - lwpDays;
        const payRatio = paidDays / workingDays;

        const earningsBreakdown: any[] = [];
        const deductionsBreakdown: any[] = [];
        let grossEarnings = 0;
        let totalDeductions = 0;

        components
          .sort((a: any, b: any) => a.display_order - b.display_order)
          .forEach((c: any) => {
            const monthlyAmount = Math.round((Number(c.annual_amount) / 12) * payRatio);
            const item = {
              name: c.component_name,
              annual: Number(c.annual_amount),
              monthly: monthlyAmount,
              is_taxable: c.is_taxable,
            };
            if (c.component_type === "earning") {
              earningsBreakdown.push(item);
              grossEarnings += monthlyAmount;
            } else {
              deductionsBreakdown.push(item);
              totalDeductions += monthlyAmount;
            }
          });

        const lwpDeduction = lwpDays > 0 ? Math.round((grossEarnings / paidDays) * lwpDays * (paidDays < workingDays ? 0 : 1)) : 0;

        return {
          payroll_run_id: run.id,
          profile_id: s.profile_id,
          organization_id: orgId,
          compensation_structure_id: s.id,
          annual_ctc: Number(s.annual_ctc),
          gross_earnings: grossEarnings,
          total_deductions: totalDeductions,
          net_pay: grossEarnings - totalDeductions,
          lwp_days: lwpDays,
          lwp_deduction: lwpDeduction,
          working_days: workingDays,
          paid_days: paidDays,
          earnings_breakdown: earningsBreakdown,
          deductions_breakdown: deductionsBreakdown,
          status: "computed",
        };
      });

      if (entries.length > 0) {
        const { error: eErr } = await supabase.from("payroll_entries").insert(entries);
        if (eErr) throw eErr;
      }

      // 5. Update run totals
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

      return { run, entriesCount: entries.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      toast.success(`Payroll generated for ${data.entriesCount} employees`);
    },
    onError: (err: any) => {
      if (err.message?.includes("duplicate key")) {
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
      const { error } = await supabase
        .from("payroll_runs")
        .update({ status: "locked", locked_at: new Date().toISOString(), locked_by: user.id })
        .eq("id", runId);
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

  return useMutation({
    mutationFn: async (runId: string) => {
      const { error } = await supabase.from("payroll_runs").delete().eq("id", runId);
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

function getWorkingDays(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let working = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0 && day !== 6) working++;
  }
  return working;
}

export function exportPayrollCSV(entries: PayrollEntry[], payPeriod: string) {
  const headers = [
    "Employee Name", "Department", "Job Title", "Annual CTC",
    "Gross Earnings", "Total Deductions", "LWP Days", "LWP Deduction",
    "Working Days", "Paid Days", "Net Pay",
  ];

  const rows = entries.map((e) => [
    e.profiles?.full_name || "",
    e.profiles?.department || "",
    e.profiles?.job_title || "",
    e.annual_ctc,
    e.gross_earnings,
    e.total_deductions,
    e.lwp_days,
    e.lwp_deduction,
    e.working_days,
    e.paid_days,
    e.net_pay,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payroll_${payPeriod}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
