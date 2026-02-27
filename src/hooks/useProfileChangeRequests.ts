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
  return useQuery({
    queryKey: ["profile-change-requests", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_change_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProfileChangeRequest[];
    },
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
      const { error } = await supabase
        .from("profile_change_requests" as any)
        .update({
          status,
          reviewed_by: user.id,
          reviewer_notes: reviewer_notes || null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-change-requests"] });
      toast.success("Change request reviewed");
    },
    onError: (err: any) => {
      toast.error("Failed to review: " + err.message);
    },
  });
}
