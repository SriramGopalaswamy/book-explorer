import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

// ─── GL Accounts ─────────────────────────────────────────────────────
export interface GLAccount {
  id: string;
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  is_active: boolean;
  is_locked: boolean;
  is_control_account: boolean;
  control_module: string | null;
  description: string | null;
}

export function useGLAccounts() {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["gl-accounts-full", orgId],
    queryFn: async (): Promise<GLAccount[]> => {
      const { data, error } = await supabase
        .from("gl_accounts")
        .select("*")
        .eq("organization_id", orgId!)
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return (data || []) as GLAccount[];
    },
    enabled: !!user && !!orgId,
  });
}

// ─── Journal Entries ────────────────────────────────────────────────
export interface JournalEntry {
  id: string;
  entry_date: string;
  memo: string | null;
  source_type: string;
  source_id: string | null;
  status: string;
  is_reversal: boolean;
  document_sequence_number: string | null;
  fiscal_period_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface JournalLine {
  id: string;
  journal_entry_id: string;
  gl_account_id: string;
  debit: number;
  credit: number;
  description: string | null;
  cost_center: string | null;
  department: string | null;
  asset_id: string | null;
}

export interface JournalEntryWithLines extends JournalEntry {
  journal_lines: JournalLine[];
}

export function useJournalEntries(periodId?: string) {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["journal-entries", orgId, periodId],
    queryFn: async (): Promise<JournalEntryWithLines[]> => {
      let query = supabase
        .from("journal_entries")
        .select("*, journal_lines(*)")
        .eq("organization_id", orgId!)
        .order("entry_date", { ascending: false })
        .limit(200);

      if (periodId) {
        query = query.eq("fiscal_period_id", periodId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((e: any) => ({
        ...e,
        journal_lines: (e.journal_lines || []).map((l: any) => ({
          ...l,
          debit: Number(l.debit),
          credit: Number(l.credit),
        })),
      }));
    },
    enabled: !!user && !!orgId,
  });
}

// ─── Post Manual Journal ────────────────────────────────────────────
export function usePostJournal() {
  const { data: org } = useUserOrganization();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      date: string;
      memo: string;
      lines: { gl_account_id: string; debit: number; credit: number; description?: string; cost_center?: string; department?: string }[];
    }) => {
      const { data, error } = await supabase.rpc("post_journal_entry", {
        p_org_id: org?.organizationId!,
        p_date: params.date,
        p_memo: params.memo,
        p_doc_type: "manual",
        p_doc_id: null,
        p_lines: params.lines,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["rpc-trial-balance"] });
      queryClient.invalidateQueries({ queryKey: ["rpc-gl-balances"] });
      toast.success("Journal entry posted successfully");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to post journal entry");
    },
  });
}

// ─── Reverse Journal ────────────────────────────────────────────────
export function useReverseJournal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entryId: string) => {
      const { data, error } = await supabase.rpc("reverse_journal_entry", {
        p_eid: entryId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["rpc-trial-balance"] });
      toast.success("Journal entry reversed");
    },
  });
}

// ─── Fiscal Periods ─────────────────────────────────────────────────
export interface FiscalPeriod {
  id: string;
  period_name: string;
  period_number: number;
  start_date: string;
  end_date: string;
  status: string;
  closed_at: string | null;
}

export function useFiscalPeriods() {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["fiscal-periods", orgId],
    queryFn: async (): Promise<FiscalPeriod[]> => {
      const { data, error } = await supabase
        .from("fiscal_periods")
        .select("*")
        .eq("organization_id", orgId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data || []) as FiscalPeriod[];
    },
    enabled: !!user && !!orgId,
  });
}

// ─── Close Fiscal Period ────────────────────────────────────────────
export function useCloseFiscalPeriod() {
  const { data: org } = useUserOrganization();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (periodId: string) => {
      const { data, error } = await supabase.rpc("close_fiscal_period", {
        _org_id: org?.organizationId!,
        _period_id: periodId,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["fiscal-periods"] });
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      if (result?.success) {
        toast.success("Period closed successfully");
      } else {
        toast.error("Period close failed pre-checks");
      }
    },
  });
}

// ─── Run Depreciation Batch ─────────────────────────────────────────
export function useRunDepreciationBatch() {
  const { data: org } = useUserOrganization();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (periodDate: string) => {
      const { data, error } = await supabase.rpc("run_depreciation_batch", {
        _org_id: org?.organizationId!,
        _period_date: periodDate,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["rpc-trial-balance"] });
      toast.success(`Depreciation run complete: ${result?.assets_processed || 0} assets processed`);
    },
  });
}

// ─── Reconcile Sub-ledgers ──────────────────────────────────────────
export function useReconcileSubledgers() {
  const { data: org } = useUserOrganization();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reconcile_subledgers", {
        _org_id: org?.organizationId!,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subledger-reconciliation"] });
      toast.success("Sub-ledger reconciliation complete");
    },
  });
}

export function useSubledgerReconciliation() {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["subledger-reconciliation", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subledger_reconciliation_log")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!orgId,
  });
}

// ─── Control Account Overrides ──────────────────────────────────────
export function useControlAccountOverrides() {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["control-account-overrides", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("control_account_overrides")
        .select("*, gl_accounts(code, name)")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!orgId,
  });
}
