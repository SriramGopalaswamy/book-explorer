import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { mockBankAccounts, mockBankTransactions } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";
import { createBankAccountSchema, createTransactionSchema } from "@/lib/validation-schemas";

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

  return useQuery({
    queryKey: ["bank-accounts", user?.id, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockBankAccounts;
      if (!user) return [];
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BankAccount[];
    },
    enabled: !!user || isDevMode,
  });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateBankAccountData) => {
      if (!user) throw new Error("Not authenticated");
      const validated = createBankAccountSchema.parse(data);
      const { data: account, error } = await supabase
        .from("bank_accounts")
        .insert({
          name: validated.name,
          account_type: validated.account_type,
          account_number: validated.account_number,
          balance: validated.balance,
          bank_name: validated.bank_name ?? null,
          user_id: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return account;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast({ title: "Account Added", description: "Bank account has been added successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast({ title: "Account Deleted", description: "Bank account has been removed." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

// Transactions
export function useBankTransactions(limit = 20) {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["bank-transactions", user?.id, limit, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockBankTransactions;
      if (!user) return [];
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*, bank_accounts(name)")
        .eq("user_id", user.id)
        .order("transaction_date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as BankTransaction[];
    },
    enabled: !!user || isDevMode,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateTransactionData) => {
      if (!user) throw new Error("Not authenticated");

      const validated = createTransactionSchema.parse(data);

      // Create transaction
      const { data: transaction, error } = await supabase
        .from("bank_transactions")
        .insert({
          account_id: validated.account_id,
          transaction_type: validated.transaction_type,
          amount: validated.amount,
          description: validated.description,
          category: validated.category ?? null,
          transaction_date: validated.transaction_date,
          user_id: user.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Update account balance
      const { data: account } = await supabase
        .from("bank_accounts")
        .select("balance")
        .eq("id", validated.account_id)
        .single();

      if (account) {
        const newBalance = validated.transaction_type === "credit"
          ? Number(account.balance) + Number(validated.amount)
          : Number(account.balance) - Number(validated.amount);

        await supabase
          .from("bank_accounts")
          .update({ balance: newBalance })
          .eq("id", validated.account_id);
      }

      return transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast({ title: "Transaction Added", description: "Transaction recorded successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

// Monthly stats
export function useMonthlyTransactionStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["monthly-transaction-stats", user?.id],
    queryFn: async () => {
      if (!user) return { inflow: 0, outflow: 0 };

      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data, error } = await supabase
        .from("bank_transactions")
        .select("transaction_type, amount")
        .eq("user_id", user.id)
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
    enabled: !!user,
  });
}

// Cash flow data for charts
export function useCashFlowData(months = 6) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["cash-flow-data", user?.id, months],
    queryFn: async () => {
      if (!user) return getDefaultCashFlowData();

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      const { data, error } = await supabase
        .from("bank_transactions")
        .select("transaction_type, amount, transaction_date")
        .eq("user_id", user.id)
        .gte("transaction_date", startDate.toISOString().split("T")[0]);

      if (error) throw error;

      if (!data || data.length === 0) return getDefaultCashFlowData();

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthlyMap = new Map<string, { inflow: number; outflow: number }>();

      data.forEach((tx) => {
        const date = new Date(tx.transaction_date);
        const key = monthNames[date.getMonth()];
        if (!monthlyMap.has(key)) {
          monthlyMap.set(key, { inflow: 0, outflow: 0 });
        }
        const current = monthlyMap.get(key)!;
        if (tx.transaction_type === "credit") {
          current.inflow += Number(tx.amount);
        } else {
          current.outflow += Number(tx.amount);
        }
      });

      const result = [];
      const now = new Date();
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const month = monthNames[d.getMonth()];
        const data = monthlyMap.get(month) || { inflow: 0, outflow: 0 };
        result.push({ month, ...data });
      }

      return result;
    },
    enabled: !!user,
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
