import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { mockPayrollRecords } from "@/lib/mock-data";
import { toast } from "sonner";
import { createPayrollSchema } from "@/lib/validation-schemas";

export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postal_code: string | null;
  job_title: string | null;
  department: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollRecord {
  id: string;
  user_id: string | null;
  profile_id: string | null;
  pay_period: string;
  basic_salary: number;
  hra: number;
  transport_allowance: number;
  other_allowances: number;
  pf_deduction: number;
  tax_deduction: number;
  other_deductions: number;
  lop_days: number;
  lop_deduction: number;
  working_days: number;
  paid_days: number;
  net_pay: number;
  status: string;
  processed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    full_name: string | null;
    email: string | null;
    department: string | null;
    job_title: string | null;
    employee_id: string | null;
    join_date: string | null;
    location: string | null;
  } | null;
}

export interface CreatePayrollData {
  profile_id: string;
  pay_period: string;
  basic_salary: number;
  hra: number;
  transport_allowance: number;
  other_allowances: number;
  pf_deduction: number;
  tax_deduction: number;
  other_deductions: number;
  lop_days?: number;
  lop_deduction?: number;
  working_days?: number;
  paid_days?: number;
  net_pay: number;
  status?: string;
  notes?: string;
}

export interface UpdatePayrollData extends Partial<CreatePayrollData> {
  id: string;
}

// ── Engine entry → PayrollRecord shape mapper ──────────────────────────────
function engineEntryToPayrollRecord(e: any): PayrollRecord {
  const getComp = (breakdown: any[], ...names: string[]) => {
    for (const n of names) {
      const item = (breakdown ?? []).find((c: any) =>
        c.name?.toLowerCase().includes(n.toLowerCase())
      );
      if (item) return Number(item.monthly ?? 0);
    }
    return 0;
  };
  const run = Array.isArray(e.payroll_runs) ? e.payroll_runs[0] : e.payroll_runs;
  return {
    id: e.id,
    user_id: null,
    profile_id: e.profile_id,
    pay_period: run?.pay_period ?? "",
    basic_salary: getComp(e.earnings_breakdown, "basic"),
    hra: getComp(e.earnings_breakdown, "hra"),
    transport_allowance: getComp(e.earnings_breakdown, "incentiv", "transport"),
    other_allowances: getComp(e.earnings_breakdown, "other allowance"),
    pf_deduction: e.pf_employee ?? getComp(e.deductions_breakdown, "pf"),
    tax_deduction: e.tds_amount ?? getComp(e.deductions_breakdown, "tds", "tax"),
    other_deductions:
      getComp(e.deductions_breakdown, "professional tax") +
      getComp(e.deductions_breakdown, "other deduction"),
    lop_days: e.lwp_days,
    lop_deduction: e.lwp_deduction,
    working_days: e.working_days,
    paid_days: e.paid_days,
    net_pay: e.net_pay,
    status: e.status,
    processed_at: null,
    notes: run?.notes ?? null,
    created_at: e.created_at,
    updated_at: e.updated_at,
    profiles: e.profiles ?? null,
    // engine-path marker (used by PaySlipDialog to choose download path)
    payroll_run_id: run?.id ?? null,
  } as any;
}

export function usePayrollRecords(payPeriod?: string) {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["payroll", user?.id, payPeriod, orgId, isDevMode],
    queryFn: async () => {
      if (isDevMode) {
        if (payPeriod) return mockPayrollRecords.filter(r => r.pay_period === payPeriod);
        return mockPayrollRecords;
      }
      if (!user || !orgId) return [];

      // ── Engine entries (primary, canonical) ──────────────────────────────
      let engineQ = supabase
        .from("payroll_entries")
        .select("id, profile_id, organization_id, gross_earnings, total_deductions, net_pay, annual_ctc, lwp_days, lwp_deduction, working_days, paid_days, status, earnings_breakdown, deductions_breakdown, pf_employee, pf_employer, tds_amount, created_at, updated_at, payroll_runs!inner(id, pay_period, status, notes), profiles!profile_id(full_name, email, department, job_title, employee_id, join_date, location)")
        .eq("organization_id", orgId)
        .not("payroll_runs.pay_period", "is", null)
        .order("created_at", { ascending: false });
      if (payPeriod) engineQ = engineQ.eq("payroll_runs.pay_period", payPeriod);
      const { data: engineData, error: engineErr } = await engineQ;
      if (engineErr) throw engineErr;

      // ── Legacy records (historical, from payroll_records still in use) ───
      let legacyQ = supabase
        .from("payroll_records")
        .select("*, profiles!profile_id(full_name, email, department, job_title, employee_id, join_date, location)")
        .eq("organization_id", orgId)
        .eq("is_superseded", false)
        .order("created_at", { ascending: false });
      if (payPeriod) legacyQ = legacyQ.eq("pay_period", payPeriod);
      const { data: legacyData, error: legacyErr } = await legacyQ;
      if (legacyErr) throw legacyErr;

      // De-duplicate: engine record wins when same (profile_id, pay_period) exists in both
      const engineKeys = new Set(
        (engineData ?? []).map((e: any) => {
          const run = Array.isArray(e.payroll_runs) ? e.payroll_runs[0] : e.payroll_runs;
          return `${e.profile_id}:${run?.pay_period}`;
        })
      );
      const filteredLegacy = (legacyData ?? []).filter(
        (r: any) => !engineKeys.has(`${r.profile_id}:${r.pay_period}`)
      );

      const engineRecords = (engineData ?? []).map(engineEntryToPayrollRecord);
      return [...engineRecords, ...filteredLegacy] as PayrollRecord[];
    },
    enabled: (!!user && !!orgId) || isDevMode,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function usePayrollOrgRecordCount() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["payroll-org-count", orgId],
    queryFn: async () => {
      if (!user || !orgId) return 0;
      // Server-side UNION de-dup — O(1) network transfer regardless of row count.
      // Migration 20260429060300 defines get_payroll_unique_record_count().
      const { data, error } = await (supabase as any).rpc(
        "get_payroll_unique_record_count",
        { p_org_id: orgId }
      );
      if (error) throw error;
      return Number(data ?? 0);
    },
    enabled: !!user && !!orgId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useMyPayrollRecords() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-payroll", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile) return [];

      // Fetch from both engine and legacy in parallel
      const [engineRes, legacyRes] = await Promise.all([
        supabase
          .from("payroll_entries")
          .select("id, profile_id, organization_id, gross_earnings, total_deductions, net_pay, annual_ctc, lwp_days, lwp_deduction, working_days, paid_days, status, earnings_breakdown, deductions_breakdown, pf_employee, tds_amount, created_at, updated_at, payroll_runs!inner(id, pay_period, status, notes), profiles!profile_id(full_name, email, department, job_title, employee_id, join_date, location)")
          .eq("profile_id", profile.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("payroll_records")
          .select("*, profiles!profile_id(full_name, email, department, job_title, employee_id, join_date, location)")
          .eq("profile_id", profile.id)
          .order("pay_period", { ascending: false }),
      ]);

      const engineKeys = new Set(
        (engineRes.data ?? []).map((e: any) => {
          const run = Array.isArray(e.payroll_runs) ? e.payroll_runs[0] : e.payroll_runs;
          return `${e.profile_id}:${run?.pay_period}`;
        })
      );
      const filteredLegacy = (legacyRes.data ?? []).filter(
        (r: any) => !engineKeys.has(`${r.profile_id}:${r.pay_period}`)
      );

      const engineRecords = (engineRes.data ?? []).map(engineEntryToPayrollRecord);
      return [...engineRecords, ...filteredLegacy] as PayrollRecord[];
    },
    enabled: !!user,
  });
}

export function usePayrollStats(payPeriod?: string) {
  const { data: allRecords = [] } = usePayrollRecords(payPeriod);

  // Exclude superseded records from all stats
  const records = allRecords.filter((r) => r.status !== "superseded");

  return {
    totalPayroll: records.reduce((sum, r) => sum + Number(r.net_pay), 0),
    totalEmployees: records.length,
    processed: records.filter((r) => r.status === "locked" || r.status === "processed").length,
    pending: records.filter((r) => r.status === "under_review" || r.status === "approved" || r.status === "pending" || r.status === "draft").length,
    totalBasic: records.reduce((sum, r) => sum + Number(r.basic_salary), 0),
    totalAllowances: records.reduce((sum, r) => sum + Number(r.hra) + Number(r.transport_allowance) + Number(r.other_allowances), 0),
    totalDeductions: records.reduce((sum, r) => sum + Number(r.pf_deduction) + Number(r.tax_deduction) + Number(r.other_deductions) + (Number(r.lop_deduction) || 0), 0),
  };
}

export function useCreatePayroll() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreatePayrollData) => {
      if (!user) throw new Error("Not authenticated");

      const validated = createPayrollSchema.parse(data);

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("user_id, organization_id")
        .eq("id", validated.profile_id)
        .single();

      const orgId = profileRow?.organization_id;

      // ── Engine path: create payroll_run + payroll_entry ──────────────────
      // This is the canonical record going forward. The payroll_records write
      // below is kept for UI backwards-compat while the Register tab still reads
      // from payroll_records. Remove payroll_records write when Register migrates.
      if (orgId) {
        const grossEarnings =
          Number(validated.basic_salary) +
          Number(validated.hra) +
          Number(validated.transport_allowance) +
          Number(validated.other_allowances);
        const totalDeductions =
          Number(validated.pf_deduction) +
          Number(validated.tax_deduction) +
          Number(validated.other_deductions) +
          Number(validated.lop_deduction ?? 0);
        const netPay = Number(validated.net_pay);

        const { data: runRow, error: runErr } = await supabase
          .from("payroll_runs")
          .insert({
            organization_id: orgId,
            pay_period: validated.pay_period,
            generated_by: user.id,
            status: "draft",
            employee_count: 1,
            total_gross: grossEarnings,
            total_deductions: totalDeductions,
            total_net: netPay,
          })
          .select("id")
          .single();
        if (runErr) throw runErr;

        const earningsBreakdown = [
          { name: "Basic Salary", monthly: Number(validated.basic_salary) },
          { name: "HRA", monthly: Number(validated.hra) },
          { name: "Incentives", monthly: Number(validated.transport_allowance) },
          { name: "Other Allowances", monthly: Number(validated.other_allowances) },
        ].filter((e) => e.monthly > 0);

        const deductionsBreakdown = [
          { name: "PF Contribution", monthly: Number(validated.pf_deduction) },
          { name: "TDS", monthly: Number(validated.tax_deduction) },
          { name: "Other Deductions", monthly: Number(validated.other_deductions) + Number(validated.lop_deduction ?? 0) },
        ].filter((d) => d.monthly > 0);

        const { error: entryErr } = await supabase.from("payroll_entries").insert({
          payroll_run_id: runRow.id,
          profile_id: validated.profile_id,
          organization_id: orgId,
          gross_earnings: grossEarnings,
          total_deductions: totalDeductions,
          net_pay: netPay,
          annual_ctc: grossEarnings * 12,
          lwp_days: validated.lop_days ?? 0,
          lwp_deduction: validated.lop_deduction ?? 0,
          working_days: validated.working_days ?? 0,
          paid_days: validated.paid_days ?? 0,
          earnings_breakdown: earningsBreakdown,
          deductions_breakdown: deductionsBreakdown,
          status: "computed",
        });
        if (entryErr) {
          // Best-effort rollback: delete orphaned run; log if it fails so the
          // dangling row is detectable in Supabase logs (no DB transaction here).
          const { error: rbErr } = await supabase
            .from("payroll_runs").delete().eq("id", runRow.id);
          if (rbErr) console.error("Failed to rollback orphaned payroll_run", runRow.id, rbErr);
          throw entryErr;
        }
      }

      // payroll_records write removed (item 46): new manual entries now live only
      // in payroll_runs + payroll_entries (engine path above). The legacy Register
      // tab (Payroll.tsx) still reads payroll_records for historical data; bulk-upload
      // continues writing payroll_records until the Register UI migrates to engine.
      return { profile_id: validated.profile_id, pay_period: validated.pay_period };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

// ── Payroll lifecycle state-machine ──────────────────────────
const PAYROLL_TRANSITIONS: Record<string, string[]> = {
  // "computed" is the engine-only initial status for auto-generated entries.
  // Finance/admin can promote directly to "processed" without going through the
  // HR approval cycle when the engine run has already been reviewed at the run level.
  computed: ["draft", "pending", "processed", "cancelled"],
  draft: ["under_review", "cancelled"],
  under_review: ["approved", "draft", "cancelled"],
  approved: ["pending", "cancelled"],
  pending: ["processed"],
  processed: ["locked"],
  locked: [],      // terminal
  cancelled: [],   // terminal
  superseded: [],  // terminal
};
const PAYROLL_TERMINAL = ["locked", "cancelled", "superseded"];

export function useUpdatePayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdatePayrollData) => {
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      const callerOrgId = callerProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization context required");

      // Check if this id belongs to payroll_entries (engine path) or payroll_records (legacy)
      const { data: engineCheck } = await supabase
        .from("payroll_entries")
        .select("id, status, payroll_run_id")
        .eq("id", id)
        .eq("organization_id", callerOrgId)
        .maybeSingle();

      if (engineCheck) {
        // ── Engine path: update payroll_entries ─────────────────────────────
        if (PAYROLL_TERMINAL.includes(engineCheck.status)) {
          throw new Error(`Cannot modify a "${engineCheck.status}" payroll record.`);
        }
        // Enforce state machine for status transitions (same rules as legacy path)
        if (data.status && data.status !== engineCheck.status) {
          const allowed = PAYROLL_TRANSITIONS[engineCheck.status];
          if (allowed && !allowed.includes(data.status)) {
            throw new Error(`Cannot transition payroll from "${engineCheck.status}" to "${data.status}".`);
          }
        }
        const gross =
          Number(data.basic_salary ?? 0) + Number(data.hra ?? 0) +
          Number(data.transport_allowance ?? 0) + Number(data.other_allowances ?? 0);
        const totalDed =
          Number(data.pf_deduction ?? 0) + Number(data.tax_deduction ?? 0) +
          Number(data.other_deductions ?? 0) + Number(data.lop_deduction ?? 0);

        const earningsBreakdown = [
          { name: "Basic Salary", monthly: Number(data.basic_salary ?? 0) },
          { name: "HRA", monthly: Number(data.hra ?? 0) },
          { name: "Incentives", monthly: Number(data.transport_allowance ?? 0) },
          { name: "Other Allowances", monthly: Number(data.other_allowances ?? 0) },
        ].filter((e) => e.monthly > 0);
        // deductionsBreakdown is derived from the same data fields as pf_employee/tds_amount
        // below — both written in one update call, so they can never drift.
        const deductionsBreakdown = [
          { name: "PF Contribution", monthly: Number(data.pf_deduction ?? 0) },
          { name: "TDS", monthly: Number(data.tax_deduction ?? 0) },
          { name: "Other Deductions", monthly: Number(data.other_deductions ?? 0) + Number(data.lop_deduction ?? 0) },
        ].filter((d) => d.monthly > 0);

        const { error } = await supabase
          .from("payroll_entries")
          .update({
            gross_earnings: gross,
            total_deductions: totalDed,
            net_pay: data.net_pay ?? gross - totalDed,
            annual_ctc: gross * 12,
            lwp_days: data.lop_days ?? 0,
            lwp_deduction: data.lop_deduction ?? 0,
            working_days: data.working_days ?? 0,
            paid_days: data.paid_days ?? 0,
            earnings_breakdown: earningsBreakdown,
            deductions_breakdown: deductionsBreakdown,
            // Keep denormalized columns in sync so statutory hooks don't read stale values
            pf_employee: Number(data.pf_deduction ?? 0),
            tds_amount: Number(data.tax_deduction ?? 0),
            ...(data.status ? { status: data.status } : {}),
          })
          .eq("id", id)
          .eq("organization_id", callerOrgId);
        if (error) throw error;
        return { id };
      }

      // ── Legacy path: update payroll_records ─────────────────────────────
      if (data.status) {
        const { data: current, error: fetchErr } = await supabase
          .from("payroll_records")
          .select("status, organization_id")
          .eq("id", id)
          .eq("organization_id", callerOrgId)
          .single();
        if (fetchErr) throw fetchErr;
        if (!current) throw new Error("Payroll record not found in your organization.");
        const currentStatus = current?.status as string;
        if (PAYROLL_TERMINAL.includes(currentStatus)) {
          throw new Error(`Cannot modify a "${currentStatus}" payroll record.`);
        }
        const allowed = PAYROLL_TRANSITIONS[currentStatus];
        if (allowed && !allowed.includes(data.status)) {
          throw new Error(`Cannot transition payroll from "${currentStatus}" to "${data.status}".`);
        }
      }
      const updateData: Record<string, unknown> = { ...data };
      if (data.status === "processed") updateData.processed_at = new Date().toISOString();
      const { data: record, error } = await supabase
        .from("payroll_records")
        .update(updateData as any)
        .eq("id", id)
        .eq("organization_id", callerOrgId)
        .select("*, profiles!profile_id(full_name, email, department, job_title, employee_id, join_date, location)")
        .single();
      if (error) throw error;
      return record;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useDeletePayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      const callerOrgId = callerProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization context required");

      // Check which table owns this id
      const { data: engineEntry } = await supabase
        .from("payroll_entries")
        .select("id, status, payroll_run_id")
        .eq("id", id)
        .eq("organization_id", callerOrgId)
        .maybeSingle();

      if (engineEntry) {
        const deletableStatuses = ["computed", "draft", "cancelled"];
        if (!deletableStatuses.includes(engineEntry.status)) {
          throw new Error(`Cannot delete a "${engineEntry.status}" payroll record. Only draft/computed records can be deleted.`);
        }
        const { error } = await supabase.from("payroll_entries").delete().eq("id", id).eq("organization_id", callerOrgId);
        if (error) throw error;
        // Clean up orphaned payroll_run if this was the only entry
        if (engineEntry.payroll_run_id) {
          const { count } = await supabase.from("payroll_entries").select("id", { count: "exact", head: true }).eq("payroll_run_id", engineEntry.payroll_run_id);
          if ((count ?? 0) === 0) {
            await supabase.from("payroll_runs").delete().eq("id", engineEntry.payroll_run_id);
          }
        }
        return;
      }

      // Legacy path
      const { data: check, error: checkErr } = await supabase
        .from("payroll_records").select("status").eq("id", id).eq("organization_id", callerOrgId).single();
      if (checkErr) throw checkErr;
      const status = check?.status as string;
      if (status && !["draft", "cancelled"].includes(status)) {
        throw new Error(`Cannot delete a "${status}" payroll record. Only draft or cancelled records can be deleted.`);
      }
      const { error } = await supabase.from("payroll_records").delete().eq("id", id).eq("organization_id", callerOrgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useBulkDeletePayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return { deleted: 0, skipped: 0 };

      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      const callerOrgId = callerProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization context required");

      // Split ids by source table
      const { data: engineChecks } = await supabase
        .from("payroll_entries").select("id, status, payroll_run_id").in("id", ids).eq("organization_id", callerOrgId);
      const engineIds = new Set((engineChecks ?? []).map((e: any) => e.id));
      const legacyIds = ids.filter((id) => !engineIds.has(id));

      // Engine deletions
      const deletableEngine = (engineChecks ?? [])
        .filter((e: any) => ["computed", "draft", "cancelled"].includes(e.status))
        .map((e: any) => e);
      if (deletableEngine.length > 0) {
        const { error: delErr } = await supabase.from("payroll_entries").delete().in("id", deletableEngine.map((e: any) => e.id)).eq("organization_id", callerOrgId);
        if (delErr) throw delErr;

        // Batch orphan-run cleanup: collect distinct run ids, check remaining
        // entries once per run (not once per entry) to avoid N+1 queries.
        const runIds = [...new Set(deletableEngine.map((e: any) => e.payroll_run_id).filter(Boolean))];
        if (runIds.length > 0) {
          const { data: remaining } = await supabase
            .from("payroll_entries")
            .select("payroll_run_id")
            .in("payroll_run_id", runIds);
          const stillUsed = new Set((remaining ?? []).map((r: any) => r.payroll_run_id));
          const orphanRunIds = runIds.filter((rid) => !stillUsed.has(rid));
          if (orphanRunIds.length > 0) {
            await supabase.from("payroll_runs").delete().in("id", orphanRunIds);
          }
        }
      }

      // Legacy deletions
      let legacyDeleted = 0;
      if (legacyIds.length > 0) {
        const { data: legacyChecks } = await supabase
          .from("payroll_records").select("id, status").in("id", legacyIds).eq("organization_id", callerOrgId);
        const deletableLegacy = (legacyChecks ?? [])
          .filter((r: any) => ["draft", "cancelled"].includes(r.status)).map((r: any) => r.id);
        if (deletableLegacy.length > 0) {
          const { error: legDelErr } = await supabase.from("payroll_records").delete().in("id", deletableLegacy).eq("organization_id", callerOrgId);
          if (legDelErr) throw legDelErr;
          legacyDeleted = deletableLegacy.length;
        }
      }

      const deleted = deletableEngine.length + legacyDeleted;
      const skipped = ids.length - deleted;
      return { deleted, skipped };
    },
    onSuccess: ({ deleted, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      if (skipped > 0) {
        toast.warning(`Deleted ${deleted} record(s). ${skipped} skipped (only draft/cancelled records can be deleted).`);
      } else {
        toast.success(`${deleted} payroll record(s) deleted.`);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useProcessPayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return { processed: 0, skipped: 0, total: 0 };

      // Cross-org guard and state-machine transition handled server-side by the RPC.
      // Use process_payroll_entries_batch which handles both engine (payroll_entries)
      // and legacy (payroll_records) ids in a single atomic call.
      const { data, error } = await (supabase as any).rpc(
        "process_payroll_entries_batch",
        { p_payroll_ids: ids }
      );

      if (error) {
        if (error.message.includes("already processed")) {
          throw new Error(
            "Some payroll records have already been processed. Please refresh and try again."
          );
        } else if (error.message.includes("currently being processed")) {
          throw new Error(
            "Payroll is being processed by another user. Please wait and try again."
          );
        }
        throw error;
      }

      if (data?.processed === 0 && data?.skipped > 0) {
        throw new Error("All selected records were already processed.");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
