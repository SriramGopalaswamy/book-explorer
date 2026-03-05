import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useIsManager() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-is-manager", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("grxbooks.user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "hr", "manager"]);
      if (error) return false;
      return data && data.length > 0;
    },
    enabled: !!user,
  });
}

export function useDirectReports() {
  const { user } = useAuth();
    return useQuery({
    queryKey: ["direct-reports", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: myProfile, error: profileError } = await supabase
        .from("grxbooks.profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError || !myProfile) return [];

      const { data, error } = await supabase
        .from("grxbooks.profiles")
        .select("*")
        .eq("manager_id", myProfile.id)
        .order("full_name", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useDirectReportsAttendance() {
  const { data: reports = [] } = useDirectReports();
  const { user } = useAuth();
    return useQuery({
    queryKey: ["direct-reports-attendance", reports.map((r) => r.id)],
    queryFn: async () => {
      if (isDevMode || !user || reports.length === 0) return [];

      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*")
        .in("profile_id", reports.map((r) => r.id))
        .eq("date", today);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user && reports.length > 0,
  });
}

export function useDirectReportsLeaves() {
  const { data: reports = [] } = useDirectReports();
  const { user } = useAuth();
    return useQuery({
    queryKey: ["direct-reports-leaves", reports.map((r) => r.id)],
    queryFn: async () => {
      if (isDevMode || !user || reports.length === 0) return [];

      const { data, error } = await supabase
        .from("grxbooks.leave_requests")
        .select("*")
        .in("profile_id", reports.map((r) => r.id))
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user && reports.length > 0,
  });
}

export function useLeaveApproval() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leaveId, action }: { leaveId: string; action: "approved" | "rejected" }) => {
      if (!user) throw new Error("Not authenticated");

      const { data: reviewerProfile } = await supabase
        .from("grxbooks.profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: leaveData, error } = await supabase
        .from("grxbooks.leave_requests")
        .update({
          status: action,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", leaveId)
        .select()
        .single();

      if (error) throw error;

      // Sync to attendance records & profile status when approved
      if (action === "approved" && leaveData) {
        try {
          const fromDate = new Date(leaveData.from_date);
          const toDate = new Date(leaveData.to_date);
          const today = new Date().toISOString().split("T")[0];

          const { data: empProfile } = await supabase
            .from("grxbooks.profiles")
            .select("id")
            .eq("user_id", leaveData.user_id)
            .maybeSingle();

          const leaveRecords: Array<{
            user_id: string;
            profile_id: string | null;
            date: string;
            status: string;
            notes: string;
          }> = [];

          for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split("T")[0];
            leaveRecords.push({
              user_id: leaveData.user_id,
              profile_id: empProfile?.id || null,
              date: dateStr,
              status: "leave",
              notes: `Approved ${leaveData.leave_type} leave`,
            });
          }

          if (leaveRecords.length > 0) {
            await supabase
              .from("attendance_records")
              .upsert(leaveRecords, { onConflict: "profile_id,date" });
          }

          if (empProfile?.id && leaveData.from_date <= today && leaveData.to_date >= today) {
            await supabase
              .from("grxbooks.profiles")
              .update({ status: "on_leave" })
              .eq("id", empProfile.id);
          }
        } catch (syncErr) {
          console.warn("Failed to sync leave to attendance/profile:", syncErr);
        }
      }

      return { leaveId, action, reviewerName: reviewerProfile?.full_name || user.email || undefined };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["direct-reports-leaves"] });
      queryClient.invalidateQueries({ queryKey: ["direct-reports-leaves-history"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      supabase.functions.invoke("send-notification-email", {
        body: {
          type: "leave_request_decided",
          payload: {
            leave_request_id: result.leaveId,
            decision: result.action,
            reviewer_name: result.reviewerName,
          },
        },
      }).catch((err) => console.warn("Failed to send decision notification:", err));
    },
  });
}
