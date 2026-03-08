import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface CompensationRevisionRequest {
  id: string;
  organization_id: string;
  profile_id: string;
  requested_by: string;
  requested_by_role: string;
  current_ctc: number;
  proposed_ctc: number;
  revision_reason: string;
  effective_from: string;
  proposed_components: any[];
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string | null; department: string | null; job_title: string | null } | null;
  requester?: { full_name: string | null } | null;
}

async function enrichWithProfiles(data: any[]): Promise<CompensationRevisionRequest[]> {
  if (!data || data.length === 0) return [];
  const profileIds = [...new Set(data.map((r: any) => r.profile_id))];
  const requesterIds = [...new Set(data.map((r: any) => r.requested_by))];
  const allIds = [...new Set([...profileIds, ...requesterIds])];

  let nameMap: Record<string, { full_name: string | null; department: string | null; job_title: string | null }> = {};
  if (allIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, department, job_title")
      .in("id", allIds);
    if (profiles) {
      nameMap = Object.fromEntries(profiles.map((p) => [p.id, p]));
    }
  }

  return data.map((r: any) => ({
    ...r,
    profiles: nameMap[r.profile_id] || null,
    requester: { full_name: nameMap[r.requested_by]?.full_name || "Unknown" },
  })) as CompensationRevisionRequest[];
}

export function useCompensationRevisionRequests(filter?: "pending" | "all") {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["compensation-revision-requests", user?.id, filter],
    queryFn: async () => {
      if (!user) return [];

      // Get user's org for tenant isolation
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile?.organization_id) return [];

      let query = (supabase.from("compensation_revision_requests" as any) as any)
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false });
      if (filter === "pending") query = query.eq("status", "pending");
      const { data, error } = await query;
      if (error) throw error;
      return enrichWithProfiles(data || []);
    },
    enabled: !!user,
  });
}

export function useMyTeamRevisionRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-team-revision-requests", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase.from("compensation_revision_requests" as any) as any)
        .select("*")
        .eq("requested_by", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return enrichWithProfiles(data || []);
    },
    enabled: !!user,
  });
}

export function useCreateRevisionRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      profile_id: string;
      current_ctc: number;
      proposed_ctc: number;
      revision_reason: string;
      effective_from: string;
      proposed_components: any[];
      requested_by_role: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (data.proposed_ctc <= 0) throw new Error("Proposed CTC must be positive");
      if (!data.revision_reason?.trim()) throw new Error("Revision reason is required");
      if (!data.effective_from) throw new Error("Effective date is required");

      // Prevent duplicate pending requests for same employee
      const { data: existing } = await (supabase.from("compensation_revision_requests" as any) as any)
        .select("id")
        .eq("profile_id", data.profile_id)
        .eq("status", "pending")
        .limit(1);
      if (existing && existing.length > 0) {
        throw new Error("A pending revision request already exists for this employee");
      }

      const { error } = await (supabase.from("compensation_revision_requests" as any) as any).insert({
        profile_id: data.profile_id,
        requested_by: user.id,
        requested_by_role: data.requested_by_role,
        current_ctc: data.current_ctc,
        proposed_ctc: data.proposed_ctc,
        revision_reason: data.revision_reason,
        effective_from: data.effective_from,
        proposed_components: data.proposed_components,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compensation-revision-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-team-revision-requests"] });
      toast({ title: "Revision Request Submitted", description: "Your compensation revision proposal has been sent to Finance for approval." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });
}

export function useReviewRevisionRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: { id: string; status: "approved" | "rejected"; reviewer_notes?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await (supabase.from("compensation_revision_requests" as any) as any)
        .update({
          status: data.status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: data.reviewer_notes || null,
        })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["compensation-revision-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-team-revision-requests"] });
      toast({
        title: variables.status === "approved" ? "Revision Approved" : "Revision Rejected",
        description: variables.status === "approved"
          ? "Approved. Create the salary revision from the employee's Compensation tab."
          : "The revision request has been rejected.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });
}
