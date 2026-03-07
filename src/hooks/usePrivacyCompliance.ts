import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ── Consent Records ────────────────────────────────────────────────
export function useConsentRecords() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["consent_records", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("consent_records")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const upsertConsent = useMutation({
    mutationFn: async (record: { consent_type: string; consent_given: boolean; purpose_description?: string }) => {
      // Check if existing consent exists
      const { data: existing } = await (supabase as any)
        .from("consent_records")
        .select("id")
        .eq("user_id", user!.id)
        .eq("consent_type", record.consent_type)
        .is("withdrawal_date", null)
        .maybeSingle();

      if (existing && !record.consent_given) {
        // Withdraw consent
        const { error } = await (supabase as any)
          .from("consent_records")
          .update({ withdrawal_date: new Date().toISOString(), consent_given: false })
          .eq("id", existing.id);
        if (error) throw error;
      } else if (!existing && record.consent_given) {
        // Grant consent
        const { error } = await (supabase as any)
          .from("consent_records")
          .insert({ user_id: user!.id, ...record, consent_date: new Date().toISOString() });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consent_records"] });
      toast.success("Consent preferences updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { consents: query.data ?? [], isLoading: query.isLoading, upsertConsent };
}

// ── Data Erasure Requests ──────────────────────────────────────────
export function useDataErasureRequests() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["data_erasure_requests", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("data_erasure_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const createRequest = useMutation({
    mutationFn: async (req: { request_type: string; reason?: string; data_categories?: string[] }) => {
      const { data, error } = await (supabase as any)
        .from("data_erasure_requests")
        .insert({ requested_by: user!.id, target_user_id: user!.id, ...req })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["data_erasure_requests"] });
      toast.success(`Request submitted. Acknowledgment: ${data.acknowledgment_number}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const processRequest = useMutation({
    mutationFn: async ({ id, status, notes, rejection_reason }: { id: string; status: string; notes?: string; rejection_reason?: string }) => {
      const { error } = await (supabase as any)
        .from("data_erasure_requests")
        .update({
          status,
          processed_by: user!.id,
          processed_at: new Date().toISOString(),
          completion_notes: notes,
          rejection_reason,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["data_erasure_requests"] });
      toast.success("Request updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { requests: query.data ?? [], isLoading: query.isLoading, createRequest, processRequest };
}

// ── Data Breach Log (Admin only) ───────────────────────────────────
export function useDataBreachLog() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["data_breach_log"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("data_breach_log")
        .select("*")
        .order("detected_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const createBreach = useMutation({
    mutationFn: async (breach: {
      breach_date: string;
      breach_type: string;
      severity: string;
      description: string;
      affected_data_types?: string[];
      estimated_affected_count?: number;
    }) => {
      const { data, error } = await (supabase as any)
        .from("data_breach_log")
        .insert({ ...breach, reported_by: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["data_breach_log"] });
      toast.success("Breach incident logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { breaches: query.data ?? [], isLoading: query.isLoading, createBreach };
}

// ── Session Policy (Admin) ─────────────────────────────────────────
export function useSessionPolicy() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["session_policies"],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!profile?.organization_id) return null;

      const { data, error } = await (supabase as any)
        .from("session_policies")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const upsertPolicy = useMutation({
    mutationFn: async (policy: Record<string, any>) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!profile?.organization_id) throw new Error("No organization");

      const { error } = await (supabase as any)
        .from("session_policies")
        .upsert(
          { organization_id: profile.organization_id, ...policy, updated_by: user!.id },
          { onConflict: "organization_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session_policies"] });
      toast.success("Session policy updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { policy: query.data, isLoading: query.isLoading, upsertPolicy };
}
