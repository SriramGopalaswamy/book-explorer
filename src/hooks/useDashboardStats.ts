import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";

export interface DashboardStats {
  totalRevenue: number;
  revenueChange: number;
  totalExpenses: number;
  expenseChange: number;
  netIncome: number;
  activeEmployees: number;
  employeeChange: number;
  pendingInvoices: number;
  invoiceChange: number;
  goalsAchieved: number;
  goalsChange: number;
}

/**
 * Dashboard stats:
 * - Revenue  = sum of paid invoices issued in the current calendar month.
 *              (invoice payments only write to bank_transactions, never to
 *               journal_lines or financial_records, so invoices is the only
 *               reliable source of truth for paid revenue.)
 * - Pending  = invoices with status sent | overdue | acknowledged | dispute.
 *              draft is excluded (not yet sent); acknowledged/dispute are
 *              included (sent but not yet paid).
 * - Expenses = debits to expense GL accounts in current month via journal_lines
 *              (unchanged — expenses are posted via journal entries).
 */
export function useDashboardStats() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["dashboard-stats", user?.id, orgId, isDevMode],
    queryFn: async (): Promise<DashboardStats> => {
      if (!user && !isDevMode) return getEmptyStats();
      if (isDevMode) return getEmptyStats();

      const now = new Date();
      // timestamptz bounds — use exclusive upper bound (start of next month)
      // so records on the last day of the month are not cut off at midnight.
      const currentMonthStart = startOfMonth(now).toISOString();
      const currentMonthExclEnd = startOfMonth(subMonths(now, -1)).toISOString();
      const lastMonthStart = startOfMonth(subMonths(now, 1)).toISOString();
      const lastMonthExclEnd = startOfMonth(now).toISOString();
      // DATE bounds for journal_entries.entry_date (DATE column)
      const currentMonthStartDate = startOfMonth(now).toISOString().split("T")[0];
      const currentMonthEndDate = endOfMonth(now).toISOString().split("T")[0];
      const lastMonthStartDate = startOfMonth(subMonths(now, 1)).toISOString().split("T")[0];
      const lastMonthEndDate = endOfMonth(subMonths(now, 1)).toISOString().split("T")[0];

      // ── Revenue: sum paid invoices for current month (org-scoped) ──────────
      // Invoices are the source of truth — payments only write to bank_transactions,
      // not to journal_lines or financial_records.
      let paidInvCurrQ = supabase
        .from("invoices")
        .select("amount")
        .eq("status", "paid")
        .gte("created_at", currentMonthStart)
        .lt("created_at", currentMonthExclEnd);
      let paidInvLastQ = supabase
        .from("invoices")
        .select("amount")
        .eq("status", "paid")
        .gte("created_at", lastMonthStart)
        .lt("created_at", lastMonthExclEnd);

      // ── Expenses: GL-based via journal_lines (org-scoped) ──────────────────
      let glQuery = supabase
        .from("gl_accounts")
        .select("id, account_type")
        .eq("account_type", "expense")
        .eq("is_active", true);
      // Current month journal lines — posted & non-deleted entries only
      let currLinesQ = supabase
        .from("journal_lines")
        .select("debit, gl_account_id, journal_entries!inner(entry_date, is_posted, is_deleted, organization_id)")
        .eq("journal_entries.is_posted", true)
        .eq("journal_entries.is_deleted", false)
        .gte("journal_entries.entry_date", currentMonthStartDate)
        .lte("journal_entries.entry_date", currentMonthEndDate);
      let lastLinesQ = supabase
        .from("journal_lines")
        .select("debit, gl_account_id, journal_entries!inner(entry_date, is_posted, is_deleted, organization_id)")
        .eq("journal_entries.is_posted", true)
        .eq("journal_entries.is_deleted", false)
        .gte("journal_entries.entry_date", lastMonthStartDate)
        .lte("journal_entries.entry_date", lastMonthEndDate);
      if (orgId) lastLinesQ = lastLinesQ.eq("journal_entries.organization_id", orgId);
      const { data: lastMonthLines } = await lastLinesQ;

      // ── Other stats ────────────────────────────────────────────────────────
      // Pending = sent to client but not yet paid (excludes draft, includes
      //           acknowledged and dispute which were added as new statuses)
      const PENDING_STATUSES = ["sent", "overdue", "acknowledged", "dispute"];
      let empQ    = supabase.from("profiles").select("id").eq("status", "active");
      let invPendQ = supabase.from("invoices").select("id").in("status", PENDING_STATUSES);
      let invPendLastQ = supabase
        .from("invoices").select("id")
        .in("status", PENDING_STATUSES)
        .gte("created_at", lastMonthStart)
        .lt("created_at", lastMonthExclEnd);
      let goalsQ  = supabase.from("goals").select("progress, status");

      if (orgId) {
        paidInvCurrQ  = paidInvCurrQ.eq("organization_id", orgId);
        paidInvLastQ  = paidInvLastQ.eq("organization_id", orgId);
        glQuery       = glQuery.eq("organization_id", orgId);
        empQ          = empQ.eq("organization_id", orgId);
        invPendQ      = invPendQ.eq("organization_id", orgId);
        invPendLastQ  = invPendLastQ.eq("organization_id", orgId);
        goalsQ        = goalsQ.eq("organization_id", orgId);
      }

      const [
        paidCurrRes, paidLastRes,
        glRes,
        currLinesRes, lastLinesRes,
        employeesRes, pendingRes, pendingLastRes, goalsRes,
      ] = await Promise.all([
        paidInvCurrQ, paidInvLastQ,
        glQuery,
        currLinesQ, lastLinesQ,
        empQ, invPendQ, invPendLastQ, goalsQ,
      ]);

      // Revenue from paid invoices
      const currentRevenue  = (paidCurrRes.data  || []).reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
      const lastRevenue     = (paidLastRes.data   || []).reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
      const revenueChange   = lastRevenue > 0
        ? ((currentRevenue - lastRevenue) / lastRevenue) * 100 : 0;

      // Expenses from journal lines (GL-filtered, org-scoped)
      const expenseIds = new Set(
        (glRes.data || []).map((a: any) => a.id)
      );
      const sumExpenses = (lines: any[]) =>
        lines.reduce((s: number, l: any) =>
          expenseIds.has(l.gl_account_id) ? s + Number(l.debit || 0) : s, 0);
      const currentExpenses = sumExpenses(currLinesRes.data || []);
      const lastExpenses    = sumExpenses(lastLinesRes.data || []);
      const expenseChange   = lastExpenses > 0
        ? ((currentExpenses - lastExpenses) / lastExpenses) * 100 : 0;

      const activeEmployees       = employeesRes.data?.length  || 0;
      const pendingInvoices       = pendingRes.data?.length    || 0;
      const lastMonthPending      = pendingLastRes.data?.length || 0;

      const goals = goalsRes.data || [];
      const avgProgress = goals.length > 0
        ? Math.round(goals.reduce((s: number, g: any) => s + g.progress, 0) / goals.length)
        : 0;

      return {
        totalRevenue:   currentRevenue,
        revenueChange:  Math.round(revenueChange * 10) / 10,
        totalExpenses:  currentExpenses,
        expenseChange:  Math.round(expenseChange * 10) / 10,
        netIncome:      currentRevenue - currentExpenses,
        activeEmployees,
        employeeChange: 0,
        pendingInvoices,
        invoiceChange:  pendingInvoices - lastMonthPending,
        goalsAchieved:  avgProgress,
        goalsChange:    0,
      };
    },
    enabled: !!user || isDevMode,
    // 5 min cache — dashboard stats don't change second-to-second, and this
    // prevents the 9-query fan-out from re-running on every navigation back
    // to "/".
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

function getEmptyStats(): DashboardStats {
  return {
    totalRevenue: 0, revenueChange: 0, totalExpenses: 0, expenseChange: 0,
    netIncome: 0, activeEmployees: 0, employeeChange: 0, pendingInvoices: 0,
    invoiceChange: 0, goalsAchieved: 0, goalsChange: 0,
  };
}

export function formatIndianCurrency(amount: number): string {
  if (amount >= 100000) {
    const lakhs = amount / 100000;
    return `₹${lakhs.toFixed(2)}L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}
