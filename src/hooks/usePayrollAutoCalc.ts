import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";

interface AutoCalcResult {
  workingDays: number;
  lopDays: number;
  lopBreakdown: { type: string; days: number }[];
  holidays: number;
  weekendDays: number;
  totalCalendarDays: number;
  isLoading: boolean;
}

/**
 * Counts weekend days in a month based on org policy.
 * policy: 'sat_sun' | 'sun_only' | 'none'
 */
function countWeekendDays(year: number, month: number, policy: string): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Sun, 6=Sat
    if (policy === "sat_sun" && (dow === 0 || dow === 6)) count++;
    else if (policy === "sun_only" && dow === 0) count++;
    // 'none' = no weekends
  }
  return count;
}

/**
 * Auto-calculates working days and LOP days for a given employee + pay period.
 * 
 * Working Days = Calendar days - Weekend days - Holidays
 * LOP Days = Total approved leaves (within period)
 */
export function usePayrollAutoCalc(profileId: string | null, payPeriod: string): AutoCalcResult {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();

  const { data, isLoading } = useQuery({
    queryKey: ["payroll-auto-calc", profileId, payPeriod, org?.organizationId],
    queryFn: async () => {
      if (!profileId || !payPeriod || !org?.organizationId) {
        return null;
      }

      const [yearStr, monthStr] = payPeriod.split("-");
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const totalCalendarDays = new Date(year, month, 0).getDate();
      const periodStart = `${payPeriod}-01`;
      const periodEnd = `${payPeriod}-${String(totalCalendarDays).padStart(2, "0")}`;

      // Fetch org weekend policy, holidays, and leave requests in parallel
      const [orgRes, holidaysRes, approvedLeavesRes] = await Promise.all([
        // 1. Get weekend policy from organizations table
        supabase
          .from("organizations")
          .select("weekend_policy")
          .eq("id", org.organizationId)
          .maybeSingle(),

        // 2. Get holidays in this month
        supabase
          .from("holidays")
          .select("date")
          .gte("date", periodStart)
          .lte("date", periodEnd),

        // 3. Get all approved leave requests for this employee in this period
        supabase
          .from("leave_requests")
          .select("leave_type, days, from_date, to_date")
          .eq("profile_id", profileId)
          .eq("status", "approved")
          .lte("from_date", periodEnd)
          .gte("to_date", periodStart),
      ]);

      const weekendPolicy = (orgRes.data as any)?.weekend_policy || "sat_sun";
      const weekendDays = countWeekendDays(year, month, weekendPolicy);

      // Count unique holiday dates (exclude those falling on weekends)
      const holidayDates = (holidaysRes.data || [])
        .map((h: any) => h.date)
        .filter((dateStr: string) => {
          const dow = new Date(dateStr).getDay();
          if (weekendPolicy === "sat_sun" && (dow === 0 || dow === 6)) return false;
          if (weekendPolicy === "sun_only" && dow === 0) return false;
          return true;
        });
      const uniqueHolidays = new Set(holidayDates).size;

      const workingDays = totalCalendarDays - weekendDays - uniqueHolidays;

      // Calculate LOP days from all approved leaves
      const lopBreakdown: { type: string; days: number }[] = [];

      // Helper: calculate overlapping WORKING days within the pay period (skip weekends)
      const overlapDays = (fromDate: string, toDate: string): number => {
        const start = new Date(Math.max(new Date(fromDate).getTime(), new Date(periodStart).getTime()));
        const end = new Date(Math.min(new Date(toDate).getTime(), new Date(periodEnd).getTime()));
        if (end < start) return 0;
        let count = 0;
        const cur = new Date(start);
        while (cur <= end) {
          const dow = cur.getDay(); // 0=Sun, 6=Sat
          const isWeekend =
            (weekendPolicy === "sat_sun" && (dow === 0 || dow === 6)) ||
            (weekendPolicy === "sun_only" && dow === 0);
          if (!isWeekend) count++;
          cur.setDate(cur.getDate() + 1);
        }
        return count;
      };

      // All approved leaves → LOP
      let totalApprovedLeaveDays = 0;
      (approvedLeavesRes.data || []).forEach((lr: any) => {
        const days = overlapDays(lr.from_date, lr.to_date);
        totalApprovedLeaveDays += days;
      });
      if (totalApprovedLeaveDays > 0) {
        lopBreakdown.push({ type: "Approved leaves", days: totalApprovedLeaveDays });
      }

      const totalLopDays = totalApprovedLeaveDays;

      return {
        workingDays,
        lopDays: totalLopDays,
        lopBreakdown,
        holidays: uniqueHolidays,
        weekendDays,
        totalCalendarDays,
      };
    },
    enabled: !!profileId && !!payPeriod && !!org?.organizationId && !!user,
    staleTime: 1000 * 60 * 5,
  });

  return {
    workingDays: data?.workingDays ?? 0,
    lopDays: data?.lopDays ?? 0,
    lopBreakdown: data?.lopBreakdown ?? [],
    holidays: data?.holidays ?? 0,
    weekendDays: data?.weekendDays ?? 0,
    totalCalendarDays: data?.totalCalendarDays ?? 0,
    isLoading,
  };
}
