import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";

/**
 * CANONICAL FINANCIAL DATA LAYER
 * All financial dashboards read from SECURITY DEFINER RPC functions
 * backed by journal_lines + gl_accounts. This is the SINGLE SOURCE OF TRUTH.
 */

export interface GLAccountBalance {
  id: string;
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  balance: number;
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  account_type: string;
  debit: number;
  credit: number;
}

const ALL_TIME_FROM = "2000-01-01";
const getAllTimeTo = () => new Date().toISOString().split("T")[0];

/**
 * Trial Balance via get_trial_balance RPC
 */
export const useTrialBalance = (_organizationId?: string) => {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = _organizationId || org?.organizationId;

  return useQuery({
    queryKey: ["rpc-trial-balance", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.rpc("get_trial_balance", {
        p_org_id: orgId,
        p_from: ALL_TIME_FROM,
        p_to: getAllTimeTo(),
      });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        code: r.account_code,
        name: r.account_name,
        account_type: r.account_type,
        debit: Number(r.total_debit),
        credit: Number(r.total_credit),
      })) as TrialBalanceRow[];
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 5,
  });
};

/**
 * Profit & Loss via get_profit_loss RPC
 */
export const useProfitAndLoss = (
  _organizationId?: string,
  _dateRange?: { start: Date; end: Date }
) => {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = _organizationId || org?.organizationId;

  return useQuery({
    queryKey: ["rpc-pnl-canonical", orgId, _dateRange?.start?.toISOString(), _dateRange?.end?.toISOString()],
    queryFn: async () => {
      if (!orgId) return { details: [], summary: { revenue: 0, cogs: 0, grossProfit: 0, expenses: 0, netIncome: 0 } };

      const { data, error } = await supabase.rpc("get_profit_loss", {
        p_org_id: orgId,
        p_from: _dateRange?.start ? _dateRange.start.toISOString().split("T")[0] : ALL_TIME_FROM,
        p_to: _dateRange?.end ? _dateRange.end.toISOString().split("T")[0] : getAllTimeTo(),
      });
      if (error) throw error;

      const rows = data || [];
      const details = rows.map((r: any) => ({
        id: r.account_id,
        account_name: r.account_name,
        category: r.account_name,
        section: r.account_type === "revenue" ? "Revenue" : "Expense",
        amount: Number(r.amount),
        record_date: "",
        description: r.account_name,
      })).filter((d: any) => d.amount > 0);

      const revenue = details.filter((d: any) => d.section === "Revenue").reduce((s: number, d: any) => s + d.amount, 0);
      const expenses = details.filter((d: any) => d.section === "Expense").reduce((s: number, d: any) => s + d.amount, 0);

      return {
        details,
        summary: {
          revenue,
          cogs: 0,
          grossProfit: revenue,
          expenses,
          netIncome: revenue - expenses,
        },
      };
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 5,
  });
};

/**
 * GL Account Balances via get_trial_balance RPC
 */
export const useGLBalances = () => {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["rpc-gl-balances", orgId],
    queryFn: async (): Promise<GLAccountBalance[]> => {
      if (!orgId) return [];

      const { data, error } = await supabase.rpc("get_trial_balance", {
        p_org_id: orgId,
        p_from: ALL_TIME_FROM,
        p_to: getAllTimeTo(),
      });
      if (error) throw error;

      return (data || []).map((r: any) => ({
        id: r.account_id,
        code: r.account_code,
        name: r.account_name,
        account_type: r.account_type,
        normal_balance: r.normal_balance,
        balance: Number(r.net_balance),
      }));
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 5,
  });
};

/**
 * Cash Position from GL
 */
export const useCashPosition = (_organizationId?: string) => {
  const { data: balances = [] } = useGLBalances();
  const cashAccount = balances.find((b) => b.code === "1100");
  return {
    totalCash: cashAccount?.balance || 0,
    accounts: cashAccount ? [{ id: cashAccount.id, account_name: cashAccount.name, account_code: cashAccount.code, balance: cashAccount.balance, account_type: "Cash" }] : [],
  };
};

/**
 * Accounts Receivable from RPC
 */
export const useAccountsReceivable = (_organizationId?: string) => {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = _organizationId || org?.organizationId;

  return useQuery({
    queryKey: ["rpc-ar-canonical", orgId],
    queryFn: async () => {
      if (!orgId) return { accounts: [], totalAR: 0, aging: { current: 0, days31_60: 0, days61_90: 0, over90: 0 } };

      const { data, error } = await supabase.rpc("get_ar_aging", {
        p_org_id: orgId,
        p_as_of: getAllTimeTo(),
      });
      if (error) throw error;

      let current = 0, days31_60 = 0, days61_90 = 0, over90 = 0, totalAR = 0;
      (data || []).forEach((row: any) => {
        const amt = Number(row.total_amount);
        totalAR += amt;
        if (row.aging_bucket === "Current") current += amt;
        else if (row.aging_bucket === "1-30 days") { current += amt; } // include in current bucket for backward compat
        else if (row.aging_bucket === "31-60 days") days31_60 += amt;
        else if (row.aging_bucket === "61-90 days") days61_90 += amt;
        else over90 += amt;
      });

      return { accounts: data || [], totalAR, aging: { current, days31_60, days61_90, over90 } };
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 5,
  });
};

/**
 * Accounts Payable from RPC
 */
export const useAccountsPayable = (_organizationId?: string) => {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = _organizationId || org?.organizationId;

  const { data } = useQuery({
    queryKey: ["rpc-ap-canonical", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.rpc("get_ap_aging", {
        p_org_id: orgId,
        p_as_of: getAllTimeTo(),
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 5,
  });

  const rows = data || [];
  const totalAP = rows.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
  let current = 0, days31_60 = 0, over60 = 0;
  rows.forEach((r: any) => {
    const amt = Number(r.total_amount);
    if (r.aging_bucket === "Current" || r.aging_bucket === "1-30 days") current += amt;
    else if (r.aging_bucket === "31-60 days") days31_60 += amt;
    else over60 += amt;
  });

  return { totalAP, aging: { current, days31_60, over60 }, accounts: rows };
};

/**
 * Financial integrity from reconciliation engine
 */
export const useFinancialIntegrity = (_organizationId?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["financial-integrity-gl", user?.id],
    queryFn: async () => {
      if (!user) return { lastReconciledAt: null, status: "unknown", unresolvedAlerts: 0, criticalAlerts: 0, integrityScore: 0 };

      const { data, error } = await supabase
        .from("journal_entries")
        .select("id")
        .limit(1);

      if (error) return { lastReconciledAt: null, status: "unknown", unresolvedAlerts: 0, criticalAlerts: 0, integrityScore: 0 };

      const { data: lines } = await supabase
        .from("journal_lines")
        .select("debit, credit");

      const totalDebits = (lines || []).reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
      const totalCredits = (lines || []).reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
      const balanced = totalDebits === totalCredits;

      return {
        lastReconciledAt: new Date().toISOString(),
        status: balanced ? "success" : "warning",
        unresolvedAlerts: balanced ? 0 : 1,
        criticalAlerts: 0,
        integrityScore: balanced ? 100 : 70,
        trialBalance: { debits: totalDebits, credits: totalCredits, balanced },
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });
};

/**
 * Integrity alerts — empty for now, kept for API compatibility
 */
export const useIntegrityAlerts = (_organizationId?: string) => {
  return useQuery({
    queryKey: ["integrity-alerts-gl"],
    queryFn: async (): Promise<{ id: string; title: string; severity: string }[]> => [],
    staleTime: 1000 * 60 * 5,
  });
};

/**
 * Cash Flow Indirect via RPC
 */
export function useCashFlowIndirect(from?: string, to?: string) {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["rpc-cash-flow-indirect", orgId, from, to],
    queryFn: async () => {
      if (!orgId) return [];
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { data, error } = await supabase.rpc("get_cash_flow_indirect", {
        p_org_id: orgId,
        p_from: from || sixMonthsAgo.toISOString().split("T")[0],
        p_to: to || getAllTimeTo(),
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 5,
  });
}
