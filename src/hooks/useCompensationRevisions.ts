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
  // Joined
  profiles?: { full_name: string | null; department: string | null; job_title: string | null } | null;
  requester?: { full_name: string | null } | null;
}

export function useCompensationRevisionRequests(filter?: "pending" | "all") {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["compensation-revision-requests", user?.id, filter],
    queryFn: async () => {
      if (!user) return [];
      let query = supabase
        .from("compensation_revision_requests" as any)
        .select("*, profiles!compensation_revision_requests_profile_id_fkey(full_name, department, job_title)")
        .order("created_at", { ascending: false });

      if (filter === "pending") {
        query = query.eq("status", "pending");
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch requester names
      const requesterIds = [...new Set((data || []).map((r: any) => r.requested_by))];
      let requesterMap: Record<string, string> = {};
      if (requesterIds.length > 0) {
        const { data: requesters } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", requesterIds);
        if (requesters) {
          requesterMap = Object.fromEntries(requesters.map((r) => [r.id, r.full_name || "Unknown"]));
        }
      }

      return (data || []).map((r: any) => ({
        ...r,
        requester: { full_name: requesterMap[r.requested_by] || "Unknown" },
      })) as CompensationRevisionRequest[];
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
      const { data, error } = await supabase
        .from("compensation_revision_requests" as any)
        .select("*, profiles!compensation_revision_requests_profile_id_fkey(full_name, department, job_title)")
        .eq("requested_by", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CompensationRevisionRequest[];
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
      const { error } = await supabase.from("compensation_revision_requests" as any).insert({
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
      const { error } = await supabase
        .from("compensation_revision_requests" as any)
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
          ? "The compensation revision has been approved. Please create the salary revision from the employee's Compensation tab."
          : "The revision request has been rejected.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });
}
