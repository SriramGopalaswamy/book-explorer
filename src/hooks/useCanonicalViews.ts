import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Hook to fetch Trial Balance from canonical view
 * This is the SINGLE SOURCE OF TRUTH for account balances
 */
export const useTrialBalance = (organizationId?: string) => {
  const { toast } = useToast();

  return useQuery({
    queryKey: ["trial-balance", organizationId],
    queryFn: async () => {
      let query = supabase
        .from("v_trial_balance")
        .select("*")
        .order("account_code");

      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }

      const { data, error } = await query;

      if (error) {
        toast({
          title: "Error loading trial balance",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      return data || [];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook to fetch Profit & Loss from canonical view
 * Dashboard revenue/expense MUST match this view
 */
export const useProfitAndLoss = (organizationId?: string, dateRange?: { start: Date; end: Date }) => {
  const { toast } = useToast();

  return useQuery({
    queryKey: ["profit-and-loss", organizationId, dateRange],
    queryFn: async () => {
      let query = supabase
        .from("v_profit_and_loss")
        .select("*")
        .order("section")
        .order("account_code");

      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }

      // Note: Date filtering would need to be done via a modified view or RPC
      // For now, we fetch all and filter client-side if needed
      const { data, error } = await query;

      if (error) {
        toast({
          title: "Error loading P&L",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      // Calculate totals
      const revenue = data?.filter(d => d.section === 'Revenue')
        .reduce((sum, row) => sum + (Number(row.amount) || 0), 0) || 0;
      
      const expenses = data?.filter(d => d.section === 'Expense')
        .reduce((sum, row) => sum + (Number(row.amount) || 0), 0) || 0;
      
      const cogs = data?.filter(d => d.section === 'Cost of Goods Sold')
        .reduce((sum, row) => sum + (Number(row.amount) || 0), 0) || 0;

      return {
        details: data || [],
        summary: {
          revenue,
          cogs,
          grossProfit: revenue - cogs,
          expenses,
          netIncome: revenue - cogs - expenses,
        },
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook to fetch Cash Position from canonical view
 * Banking dashboard MUST use this view
 */
export const useCashPosition = (organizationId?: string) => {
  const { toast } = useToast();

  return useQuery({
    queryKey: ["cash-position", organizationId],
    queryFn: async () => {
      let query = supabase
        .from("v_cash_position")
        .select("*")
        .order("account_code");

      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }

      const { data, error } = await query;

      if (error) {
        toast({
          title: "Error loading cash position",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      const totalCash = data?.reduce((sum, row) => sum + (Number(row.balance) || 0), 0) || 0;

      return {
        accounts: data || [],
        totalCash,
      };
    },
    staleTime: 1000 * 60 * 2, // 2 minutes (more frequent for cash)
  });
};

/**
 * Hook to fetch Accounts Receivable from canonical view
 * Invoicing dashboard MUST use this view, not invoice table aggregates
 */
export const useAccountsReceivable = (organizationId?: string) => {
  const { toast } = useToast();

  return useQuery({
    queryKey: ["accounts-receivable", organizationId],
    queryFn: async () => {
      let query = supabase
        .from("v_accounts_receivable")
        .select("*");

      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }

      const { data, error } = await query;

      if (error) {
        toast({
          title: "Error loading AR",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      const totalAR = data?.reduce((sum, row) => sum + (Number(row.balance) || 0), 0) || 0;
      const aging = data?.[0] ? {
        current: Number(data[0].current_amount) || 0,
        days31_60: Number(data[0].days_31_60) || 0,
        days61_90: Number(data[0].days_61_90) || 0,
        over90: Number(data[0].over_90_days) || 0,
      } : { current: 0, days31_60: 0, days61_90: 0, over90: 0 };

      return {
        accounts: data || [],
        totalAR,
        aging,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook to fetch Accounts Payable from canonical view
 * Bills dashboard MUST use this view, not bill table aggregates
 */
export const useAccountsPayable = (organizationId?: string) => {
  const { toast } = useToast();

  return useQuery({
    queryKey: ["accounts-payable", organizationId],
    queryFn: async () => {
      let query = supabase
        .from("v_accounts_payable")
        .select("*");

      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }

      const { data, error } = await query;

      if (error) {
        toast({
          title: "Error loading AP",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      const totalAP = data?.reduce((sum, row) => sum + (Number(row.balance) || 0), 0) || 0;
      const aging = data?.[0] ? {
        current: Number(data[0].current_amount) || 0,
        days31_60: Number(data[0].days_31_60) || 0,
        over60: Number(data[0].over_60_days) || 0,
      } : { current: 0, days31_60: 0, over60: 0 };

      return {
        accounts: data || [],
        totalAP,
        aging,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook to fetch financial integrity status
 * Shows reconciliation status and alerts
 */
export const useFinancialIntegrity = (organizationId?: string) => {
  const { toast } = useToast();

  return useQuery({
    queryKey: ["financial-integrity", organizationId],
    queryFn: async () => {
      if (!organizationId) {
        return {
          lastReconciledAt: null,
          status: "unknown",
          unresolvedAlerts: 0,
          criticalAlerts: 0,
        };
      }

      const { data, error } = await supabase
        .rpc("get_latest_reconciliation_status", {
          p_organization_id: organizationId,
        });

      if (error) {
        console.error("Error loading integrity status:", error);
        return {
          lastReconciledAt: null,
          status: "unknown",
          unresolvedAlerts: 0,
          criticalAlerts: 0,
        };
      }

      return data?.[0] || {
        lastReconciledAt: null,
        status: "unknown",
        unresolvedAlerts: 0,
        criticalAlerts: 0,
      };
    },
    staleTime: 1000 * 60 * 1, // 1 minute
  });
};

/**
 * Hook to get unresolved financial integrity alerts
 */
export const useIntegrityAlerts = (organizationId?: string) => {
  const { toast } = useToast();

  return useQuery({
    queryKey: ["integrity-alerts", organizationId],
    queryFn: async () => {
      let query = supabase
        .from("financial_integrity_alerts")
        .select("*")
        .is("resolved_at", null)
        .order("detected_at", { ascending: false });

      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }

      const { data, error } = await query;

      if (error) {
        toast({
          title: "Error loading integrity alerts",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      return data || [];
    },
    staleTime: 1000 * 60 * 1, // 1 minute
  });
};
