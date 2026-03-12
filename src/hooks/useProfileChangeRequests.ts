import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface ProfileChangeRequest {
  id: string;
  profile_id: string;
  user_id: string;
  organization_id: string;
  section: string;
  field_name: string;
  current_value: string | null;
  requested_value: string | null;
  reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useMyChangeRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["profile-change-requests", "mine", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("profile_change_requests" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProfileChangeRequest[];
    },
    enabled: !!user,
  });
}

export function useSubmitChangeRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      profile_id: string;
      section: string;
      field_name: string;
      current_value: string | null;
      requested_value: string;
      reason?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (!input.requested_value?.trim()) throw new Error("Requested value cannot be empty");
      if (input.requested_value === input.current_value) {
        throw new Error("New value must differ from current value");
      }

      // Check for existing pending request on same field
      const { data: existing } = await supabase
        .from("profile_change_requests" as any)
        .select("id")
        .eq("profile_id", input.profile_id)
        .eq("field_name", input.field_name)
        .eq("status", "pending")
        .limit(1);
      if (existing && (existing as any[]).length > 0) {
        throw new Error("A pending change request already exists for this field");
      }

      const { error } = await supabase
        .from("profile_change_requests" as any)
        .insert({
          ...input,
          user_id: user.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employee-details"] });
      queryClient.invalidateQueries({ queryKey: ["my-profile-id"] });
      toast.success("Change request submitted to your manager");
    },
    onError: (err: any) => {
      toast.error("Failed to submit: " + err.message);
    },
  });
}

// HR hooks
export function useAllChangeRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["profile-change-requests", "all", user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get org for tenant isolation
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile?.organization_id) return [];

      const { data, error } = await supabase
        .from("profile_change_requests" as any)
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProfileChangeRequest[];
    },
    enabled: !!user,
  });
}

export function useReviewChangeRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      reviewer_notes,
    }: {
      id: string;
      status: "approved" | "rejected";
      reviewer_notes?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Resolve caller org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      // Double-review guard
      const { data: current } = await supabase
        .from("profile_change_requests" as any)
        .select("status, user_id")
        .eq("id", id)
        .single();
      if ((current as any)?.status !== "pending") {
        throw new Error("This change request has already been reviewed");
      }
      // Self-review guard
      if ((current as any)?.user_id === user.id) {
        throw new Error("You cannot review your own profile change request.");
      }

      const { error } = await supabase
        .from("profile_change_requests" as any)
        .update({
          status,
          reviewed_by: user.id,
          reviewer_notes: reviewer_notes || null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("organization_id", callerProfile.organization_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["direct-reports-profile-changes-pending"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employee-details"] });
      queryClient.invalidateQueries({ queryKey: ["my-profile-id"] });
      toast.success("Change request reviewed");
    },
    onError: (err: any) => {
      toast.error("Failed to review: " + err.message);
    },
  });
}
