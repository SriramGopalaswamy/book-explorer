import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useDevMode } from "@/contexts/DevModeContext";
import { useAppMode } from "@/contexts/AppModeContext";
import { mockEmployees } from "@/lib/mock-data";

export function useIsManager() {
  const { user } = useAuth();
  const { canShowDevTools } = useAppMode();
  const { activeRole } = useDevMode();

  return useQuery({
    queryKey: ["user-is-manager", user?.id, canShowDevTools, activeRole],
    queryFn: async () => {
      if (canShowDevTools && activeRole) {
        return ["admin", "hr", "manager"].includes(activeRole);
      }
      if (!user) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "hr", "manager"]);
      if (error) return false;
      return data && data.length > 0;
    },
    enabled: !!user || canShowDevTools,
  });
}

export function useDirectReports() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["direct-reports", user?.id, isDevMode],
    queryFn: async () => {
      if (isDevMode) {
        // In dev mode, show mock employees that report to the CEO (dev user)
        const manager = mockEmployees.find((e) => e.user_id === "dev-mode-user");
        return mockEmployees.filter((e) => e.manager_id === manager?.id);
      }
      if (!user) return [];

      // Get the current user's profile id
      const { data: myProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError || !myProfile) return [];

      // Get direct reports
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("manager_id", myProfile.id)
        .order("full_name", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user || isDevMode,
  });
}

export function useDirectReportsAttendance() {
  const { data: reports = [] } = useDirectReports();
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["direct-reports-attendance", reports.map((r) => r.id), isDevMode],
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
    enabled: (!!user || isDevMode) && reports.length > 0,
  });
}

export function useDirectReportsLeaves() {
  const { data: reports = [] } = useDirectReports();
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["direct-reports-leaves", reports.map((r) => r.id), isDevMode],
    queryFn: async () => {
      if (isDevMode || !user || reports.length === 0) return [];

      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .in("profile_id", reports.map((r) => r.id))
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: (!!user || isDevMode) && reports.length > 0,
  });
}

export function useLeaveApproval() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leaveId, action }: { leaveId: string; action: "approved" | "rejected" }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("leave_requests")
        .update({
          status: action,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", leaveId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["direct-reports-leaves"] });
    },
  });
}
