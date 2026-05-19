import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { mockBankAccounts, mockBankTransactions } from "@/lib/mock-data";
import { toast } from "sonner";
import { createBankAccountSchema, createTransactionSchema } from "@/lib/validation-schemas";

type RecordBankTransactionRpc = (
  fn: "record_bank_transaction",
  args: {
    p_org_id: string;
    p_account_id: string;
    p_transaction_type: string;
    p_amount: number;
    p_description: string;
    p_category: string | null;
    p_transaction_date: string;
    p_user_id: string;
  },
) => Promise<{ data: string | null; error: unknown }>;

export interface BankAccount {
  id: string;
  user_id: string;
  name: string;
  account_type: "Current" | "Savings" | "FD" | "Credit";
  account_number: string;
  balance: number;
  bank_name: string | null;
  status: "Active" | "Inactive" | "Closed";
  created_at: string;
  updated_at: string;
}

export interface BankTransaction {
  id: string;
  user_id: string;
  account_id: string | null;
  transaction_type: "credit" | "debit";
  amount: number;
  description: string;
  category: string | null;
  transaction_date: string;
  reference: string | null;
  created_at: string;
  reconcile_status?: string | null;
  ai_suggested_category?: string | null;
  ai_match_id?: string | null;
  ai_match_type?: string | null;
  is_duplicate_flag?: boolean | null;
  reconciled?: boolean | null;
  reconciled_at?: string | null;
  bank_accounts?: { name: string } | null;
}

export interface CreateBankAccountData {
  name: string;
  account_type: BankAccount["account_type"];
  account_number: string;
  balance: number;
  bank_name?: string;
}

export interface CreateTransactionData {
  account_id: string;
  transaction_type: "credit" | "debit";
  amount: number;
  description: string;
  category?: string;
  transaction_date: string;
}

// Bank Accounts
export function useBankAccounts() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["bank-accounts", user?.id, orgId, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockBankAccounts;
      if (!user || !orgId) return [];
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BankAccount[];
    },
    enabled: (!!user && !!orgId) || isDevMode,
  });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateBankAccountData) => {
      if (!user) throw new Error("Not authenticated");
      const validated = createBankAccountSchema.parse(data);
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");
      const { data: account, error } = await supabase
        .from("bank_accounts")
        .insert({
          name: validated.name,
          account_type: validated.account_type,
          account_number: validated.account_number,
          balance: validated.balance,
          bank_name: validated.bank_name ?? null,
          user_id: user.id,
          organization_id: callerProfile.organization_id,
        })
        .select()
        .single();
      if (error) throw error;
      return account;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Bank account has been added successfully.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteBankAccount() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");
      // Prevent deleting accounts with linked transactions
      const { data: txns, error: txErr } = await supabase
        .from("bank_transactions")
        .select("id")
        .eq("account_id", id)
        .limit(1);
      if (txErr) throw txErr;
      if (txns && txns.length > 0) {
        throw new Error("Cannot delete a bank account with existing transactions. Deactivate it instead.");
      }

      // Prevent deleting accounts with non-zero balance
      const { data: acct, error: acctErr } = await supabase
        .from("bank_accounts")
        .select("balance, status")
        .eq("id", id)
        .single();
      if (acctErr) throw acctErr;
      if (acct && Math.abs(Number(acct.balance)) > 0.01) {
        throw new Error(`Cannot delete account with balance of ₹${Number(acct.balance).toLocaleString("en-IN")}. Zero the balance first.`);
      }

      // Resolve caller org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      const { error } = await supabase.from("bank_accounts").delete().eq("id", id).eq("organization_id", callerProfile.organization_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

// Transactions
export function useBankTransactions(limit = 20) {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["bank-transactions", user?.id, orgId, limit, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockBankTransactions;
      if (!user || !orgId) return [];
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*, bank_accounts(name)")
        .eq("organization_id", orgId)
        .order("transaction_date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as BankTransaction[];
    },
    enabled: (!!user && !!orgId) || isDevMode,
  });
}

/**
 * GBC-34: server-side filtered + paginated bank-transaction search via
 * the search_bank_transactions RPC. Drops the client-side filter chain
 * (Banking.tsx was reducing over the full transactions list per render).
 */
export interface BankTxSearchFilters {
  q?: string;
  type?: "credit" | "debit" | "all";
  accountId?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}

export interface BankTxSearchRow extends BankTransaction {
  account_name: string | null;
  total_count: number;
}

export function useBankTransactionsSearch(filters: BankTxSearchFilters = {}) {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const {
    q = "",
    type = "all",
    accountId = null,
    from = null,
    to = null,
    limit = 25,
    offset = 0,
  } = filters;

  return useQuery({
    queryKey: ["bank-tx-search", user?.id, orgId, q, type, accountId, from, to, limit, offset],
    queryFn: async () => {
      if (!user || !orgId) return { rows: [] as BankTxSearchRow[], total: 0 };
      const { data, error } = await (supabase as any).rpc("search_bank_transactions", {
        p_q: q ?? "",
        p_from: from,
        p_to: to,
        p_type: type === "all" ? null : type,
        p_account_id: accountId,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      const rows = (data ?? []) as BankTxSearchRow[];
      return { rows, total: rows[0]?.total_count ?? 0 };
    },
    enabled: !!user && !!orgId,
    staleTime: 15_000,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateTransactionData) => {
      if (!user) throw new Error("Not authenticated");

      const validated = createTransactionSchema.parse(data);

      const today = new Date().toISOString().split("T")[0];
      if (validated.transaction_date > today) {
        throw new Error("Transaction date cannot be in the future.");
      }

      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      const { data: txnId, error } = await (supabase.rpc as unknown as RecordBankTransactionRpc)(
        "record_bank_transaction",
        {
          p_org_id: callerProfile.organization_id,
          p_account_id: validated.account_id,
          p_transaction_type: validated.transaction_type,
          p_amount: Number(validated.amount),
          p_description: validated.description,
          p_category: validated.category ?? null,
          p_transaction_date: validated.transaction_date,
          p_user_id: user.id,
        },
      );
      if (error) throw error;
      return txnId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-transaction-stats"] });
      queryClient.invalidateQueries({ queryKey: ["cash-flow-data"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["financial-data"] });
      toast.success("Transaction recorded successfully.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

// Monthly stats
export function useMonthlyTransactionStats() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["monthly-transaction-stats", user?.id, orgId],
    queryFn: async () => {
      if (!user || !orgId) return { inflow: 0, outflow: 0 };

      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data, error } = await supabase
        .from("bank_transactions")
        .select("transaction_type, amount")
        .eq("organization_id", orgId)
        .gte("transaction_date", firstDay.toISOString().split("T")[0]);

      if (error) throw error;

      const stats = (data || []).reduce(
        (acc, tx) => {
          if (tx.transaction_type === "credit") {
            acc.inflow += Number(tx.amount);
          } else {
            acc.outflow += Number(tx.amount);
          }
          return acc;
        },
        { inflow: 0, outflow: 0 }
      );

      return stats;
    },
    enabled: !!user && !!orgId,
  });
}

// GBC-42: cash flow time-series sourced from the cash_flow_monthly RPC
// (server-side bucketing via generate_series + date_trunc). The legacy
// implementation pulled every transaction since `now() - months` and
// bucketed client-side; this version returns one row per month
// pre-aggregated, so the page transfers O(months) instead of O(tx).
export function useCashFlowData(months = 6) {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["cash-flow-data", user?.id, orgId, months],
    queryFn: async () => {
      if (!user || !orgId) return getDefaultCashFlowData();
      const { data, error } = await (supabase as any).rpc("cash_flow_monthly", {
        p_months: months,
      });
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        bucket_label: string;
        inflow: number;
        outflow: number;
        net_cash: number;
      }>;
      if (rows.length === 0) return getDefaultCashFlowData();
      return rows.map((r) => ({
        month: r.bucket_label,
        inflow: Number(r.inflow),
        outflow: Number(r.outflow),
      }));
    },
    enabled: !!user && !!orgId,
    staleTime: 60_000,
  });
}

function getDefaultCashFlowData() {
  return [
    { month: "Aug", inflow: 1350000, outflow: 1100000 },
    { month: "Sep", inflow: 1100000, outflow: 980000 },
    { month: "Oct", inflow: 1450000, outflow: 1200000 },
    { month: "Nov", inflow: 1300000, outflow: 1150000 },
    { month: "Dec", inflow: 1600000, outflow: 1400000 },
    { month: "Jan", inflow: 1250000, outflow: 1050000 },
  ];
}
