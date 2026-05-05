import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";

export interface HRAnalytics {
  totalEmployees: number;
  activeEmployees: number;
  onLeave: number;
  departments: { name: string; count: number; cost: number }[];
  avgTenureMonths: number;
  newHiresLast90Days: number;
  attritionLast90Days: number;
}

export interface PayrollSummary {
  totalPayrollCost: number;
  avgCTC: number;
  costPerEmployee: number;
  totalEmployeesOnPayroll: number;
  monthlyCostTrend: { month: string; gross: number; net: number }[];
  departmentCosts: { department: string; total: number; count: number; avgPerHead: number }[];
}

export interface AttendanceSummary {
  avgAttendanceRate: number;
  totalLateMinutesThisMonth: number;
  totalOTMinutesThisMonth: number;
  absentToday: number;
}

export interface CrossModuleInsight {
  id: string;
  type: "info" | "warning" | "success" | "critical";
  module: string;
  title: string;
  description: string;
  metric?: string;
}

export function useHRAnalytics() {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["hr-analytics-cross", orgId],
    queryFn: async (): Promise<HRAnalytics> => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, status, department, join_date")
        .eq("organization_id", orgId!);

      const all = profiles || [];

      // Use approved leave_requests for today to determine on-leave count accurately,
      // rather than relying on the profile.status field which may be stale.
      const today = new Date().toISOString().split("T")[0];
      const { data: activeLeaves } = await supabase
        .from("leave_requests")
        .select("user_id, profile_id")
        .eq("status", "approved")
        .eq("organization_id", orgId!)
        .lte("from_date", today)
        .gte("to_date", today);

      const leaveProfileIds = new Set((activeLeaves || []).map((l) => l.profile_id).filter(Boolean));
      const leaveUserIds = new Set((activeLeaves || []).map((l) => l.user_id).filter(Boolean));

      const onLeaveCount = all.filter(
        (p) => leaveProfileIds.has(p.id) || leaveUserIds.has(p.user_id)
      ).length;

      const nonInactive = all.filter((p) => p.status !== "inactive" && p.status !== "exited");
      const active = nonInactive.filter(
        (p) => !leaveProfileIds.has(p.id) && !leaveUserIds.has(p.user_id)
      );

      const deptMap = new Map<string, number>();
      active.forEach((p) => {
        const dept = p.department || "Unassigned";
        deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
      });
      const departments = Array.from(deptMap.entries()).map(([name, count]) => ({
        name, count, cost: 0,
      }));

      const now = new Date();
      const tenures = active
        .filter((p) => p.join_date)
        .map((p) => (now.getTime() - new Date(p.join_date!).getTime()) / (1000 * 60 * 60 * 24 * 30));
      const avgTenureMonths = tenures.length > 0
        ? Math.round(tenures.reduce((a, b) => a + b, 0) / tenures.length) : 0;

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const newHires = all.filter(
        (p) => p.join_date && new Date(p.join_date) >= ninetyDaysAgo && p.status === "active"
      ).length;
      const inactive = all.filter((p) => p.status === "inactive" || p.status === "exited").length;

      return {
        totalEmployees: all.length,
        activeEmployees: active.length,
        onLeave: onLeaveCount,
        departments,
        avgTenureMonths,
        newHiresLast90Days: newHires,
        attritionLast90Days: inactive,
      };
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 5,
  });
}

export function usePayrollSummary() {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["payroll-summary-cross", orgId],
    queryFn: async (): Promise<PayrollSummary> => {
      let runsQ = supabase
        .from("payroll_runs")
        .select("id, pay_period, total_gross, total_net, total_deductions, employee_count, status")
        .in("status", ["locked", "approved", "completed"])
        .order("pay_period", { ascending: true })
        .limit(12);
      if (!orgId) return { periods: [], avgGross: 0, avgNet: 0, totalEmployees: 0, deptBreakdown: [] } as any;
      runsQ = runsQ.eq("organization_id", orgId);

      const { data: runs } = await runsQ;
      const allRuns = runs || [];
      const runIds = allRuns.map((r) => r.id);

      const { data: entries } = await supabase
        .from("payroll_entries")
        .select("profile_id, gross_earnings, net_pay, annual_ctc, profiles!profile_id(department)")
        .in("payroll_run_id", runIds.length > 0 ? runIds : ["none"]);

      const allEntries = entries || [];

      const monthlyCostTrend = allRuns.map((r) => ({
        month: r.pay_period,
        gross: Number(r.total_gross),
        net: Number(r.total_net),
      }));

      const deptMap = new Map<string, { total: number; count: number }>();
      allEntries.forEach((e: any) => {
        const dept = e.profiles?.department || "Unassigned";
        const existing = deptMap.get(dept) || { total: 0, count: 0 };
        existing.total += Number(e.gross_earnings);
        existing.count += 1;
        deptMap.set(dept, existing);
      });

      const departmentCosts = Array.from(deptMap.entries()).map(([department, v]) => ({
        department, total: v.total, count: v.count,
        avgPerHead: v.count > 0 ? Math.round(v.total / v.count) : 0,
      }));

      const totalPayrollCost = allRuns.reduce((s, r) => s + Number(r.total_gross), 0);
      const uniqueEmployees = new Set(allEntries.map((e: any) => e.profile_id)).size;
      const avgCTC = allEntries.length > 0
        ? Math.round(allEntries.reduce((s: number, e: any) => s + Number(e.annual_ctc || 0), 0) / allEntries.length) : 0;

      return {
        totalPayrollCost, avgCTC,
        costPerEmployee: uniqueEmployees > 0 ? Math.round(totalPayrollCost / uniqueEmployees) : 0,
        totalEmployeesOnPayroll: uniqueEmployees,
        monthlyCostTrend, departmentCosts,
      };
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useAttendanceSummary() {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["attendance-summary-cross", orgId],
    queryFn: async (): Promise<AttendanceSummary> => {
      const today = new Date().toISOString().split("T")[0];
      const monthStart = new Date();
      monthStart.setDate(1);

      const { data: todayRecords } = await supabase
        .from("attendance_daily")
        .select("status")
        .eq("organization_id", orgId!)
        .eq("attendance_date", today);

      const { data: monthRecords } = await supabase
        .from("attendance_daily")
        .select("status, late_minutes, ot_minutes")
        .eq("organization_id", orgId!)
        .gte("attendance_date", monthStart.toISOString().split("T")[0]);

      const todayAll = todayRecords || [];
      const monthAll = monthRecords || [];

      const present = todayAll.filter((r) => r.status === "present" || r.status === "half_day").length;
      const total = todayAll.length;
      const absent = todayAll.filter((r) => r.status === "absent").length;

      return {
        avgAttendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
        totalLateMinutesThisMonth: monthAll.reduce((s, r) => s + Number(r.late_minutes || 0), 0),
        totalOTMinutesThisMonth: monthAll.reduce((s, r) => s + Number(r.ot_minutes || 0), 0),
        absentToday: absent,
      };
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 2,
  });
}

/**
 * Generate cross-module insights by analyzing data patterns
 */
export function useCrossModuleInsights() {
  const { data: hr } = useHRAnalytics();
  const { data: payroll } = usePayrollSummary();
  const { data: attendance } = useAttendanceSummary();

  return useQuery({
    queryKey: ["cross-module-insights", hr?.activeEmployees, payroll?.totalPayrollCost, attendance?.avgAttendanceRate],
    queryFn: async (): Promise<CrossModuleInsight[]> => {
      const insights: CrossModuleInsight[] = [];

      if (hr) {
        if (hr.newHiresLast90Days > 0) {
          insights.push({
            id: "new-hires", type: "info", module: "HR",
            title: "Growing Team",
            description: `${hr.newHiresLast90Days} new hires in the last 90 days.`,
            metric: `+${hr.newHiresLast90Days}`,
          });
        }
        if (hr.activeEmployees > 0 && hr.onLeave > hr.activeEmployees * 0.15) {
          insights.push({
            id: "high-leave", type: "warning", module: "HR",
            title: "High Leave Rate",
            description: `${hr.onLeave} employees currently on leave (${Math.round((hr.onLeave / hr.activeEmployees) * 100)}%).`,
            metric: `${hr.onLeave} on leave`,
          });
        }
      }

      if (payroll) {
        if (payroll.costPerEmployee > 0) {
          insights.push({
            id: "cost-per-head", type: "info", module: "Payroll",
            title: "Cost Per Employee",
            description: `Average cost per employee: ₹${(payroll.costPerEmployee / 100000).toFixed(1)}L.`,
            metric: `₹${(payroll.costPerEmployee / 100000).toFixed(1)}L`,
          });
        }
      }

      if (attendance) {
        if (attendance.avgAttendanceRate < 80 && attendance.avgAttendanceRate > 0) {
          insights.push({
            id: "low-attendance", type: "warning", module: "Attendance",
            title: "Low Attendance Rate",
            description: `Today's attendance rate is ${attendance.avgAttendanceRate}%, below the 80% threshold.`,
            metric: `${attendance.avgAttendanceRate}%`,
          });
        }
        if (attendance.totalOTMinutesThisMonth > 1000) {
          insights.push({
            id: "high-ot", type: "warning", module: "Operations",
            title: "High Overtime",
            description: `${Math.round(attendance.totalOTMinutesThisMonth / 60)} overtime hours logged this month.`,
            metric: `${Math.round(attendance.totalOTMinutesThisMonth / 60)}h`,
          });
        }
      }

      return insights;
    },
    enabled: !!(hr || payroll || attendance),
    staleTime: 1000 * 60 * 5,
  });
}
