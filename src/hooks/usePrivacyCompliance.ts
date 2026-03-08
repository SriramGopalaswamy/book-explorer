import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
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
      if (!user) throw new Error("Authentication required.");

      // Check if existing consent exists
      const { data: existing } = await (supabase as any)
        .from("consent_records")
        .select("id")
        .eq("user_id", user.id)
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
          .insert({ user_id: user.id, ...record, consent_date: new Date().toISOString() });
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
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["data_erasure_requests", orgId, user?.id],
    queryFn: async () => {
      let q = (supabase as any)
        .from("data_erasure_requests")
        .select("*")
        .order("created_at", { ascending: false });
      // Org-scope for admin views; individual users see only their own
      if (orgId) q = q.eq("organization_id", orgId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const createRequest = useMutation({
    mutationFn: async (req: { request_type: string; reason?: string; data_categories?: string[] }) => {
      if (!user) throw new Error("Authentication required.");

      // Prevent duplicate pending requests
      const { data: existing } = await (supabase as any)
        .from("data_erasure_requests")
        .select("id")
        .eq("target_user_id", user.id)
        .eq("status", "pending")
        .maybeSingle();
      if (existing) throw new Error("You already have a pending erasure request. Please wait for it to be processed.");

      const { data, error } = await (supabase as any)
        .from("data_erasure_requests")
        .insert({ requested_by: user.id, target_user_id: user.id, ...req })
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
      if (!user) throw new Error("Authentication required.");

      // Validate status transition
      const validStatuses = ["approved", "completed", "rejected"];
      if (!validStatuses.includes(status)) throw new Error(`Invalid status: ${status}`);

      const { error } = await (supabase as any)
        .from("data_erasure_requests")
        .update({
          status,
          processed_by: user.id,
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
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["data_breach_log", orgId],
    queryFn: async () => {
      let q = (supabase as any)
        .from("data_breach_log")
        .select("*")
        .order("detected_date", { ascending: false });
      if (orgId) q = q.eq("organization_id", orgId);
      const { data, error } = await q;
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
      if (!user) throw new Error("Authentication required.");

      // Validate severity
      const validSeverities = ["low", "medium", "high", "critical"];
      if (!validSeverities.includes(breach.severity)) throw new Error(`Invalid severity: ${breach.severity}`);

      const { data, error } = await (supabase as any)
        .from("data_breach_log")
        .insert({ ...breach, reported_by: user.id })
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
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["session_policies", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await (supabase as any)
        .from("session_policies")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!orgId,
  });

  const upsertPolicy = useMutation({
    mutationFn: async (policy: Record<string, any>) => {
      if (!user) throw new Error("Authentication required.");
      if (!orgId) throw new Error("No organization context.");

      // Validate timeout bounds (minimum 5 minutes, maximum 480 minutes)
      if (policy.idle_timeout_minutes !== undefined) {
        const timeout = Number(policy.idle_timeout_minutes);
        if (isNaN(timeout) || timeout < 5 || timeout > 480) {
          throw new Error("Idle timeout must be between 5 and 480 minutes.");
        }
      }

      const { error } = await (supabase as any)
        .from("session_policies")
        .upsert(
          { organization_id: orgId, ...policy, updated_by: user.id },
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
