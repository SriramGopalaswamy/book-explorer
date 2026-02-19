import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { mockLeaveRequests, mockLeaveBalances, mockHolidays } from "@/lib/mock-data";
import { toast } from "sonner";

// Lightweight audit helper — fire-and-forget, never throws
function writeAudit(entry: {
  actor_id: string; actor_name: string; action: string;
  entity_type: string; entity_id?: string;
  target_user_id?: string; target_name?: string;
  metadata?: Record<string, unknown>;
}) {
  supabase.from("audit_logs" as any).insert({
    actor_id: entry.actor_id,
    actor_name: entry.actor_name,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id ?? null,
    target_user_id: entry.target_user_id ?? null,
    target_name: entry.target_name ?? null,
    metadata: entry.metadata ?? {},
  } as any).then(({ error }) => {
    if (error) console.warn("Audit write failed:", error.message);
  });
}

export interface LeaveRequest {
  id: string;
  user_id: string;
  profile_id: string | null;
  leave_type: "casual" | "sick" | "earned" | "maternity" | "paternity" | "wfh";
  from_date: string;
  to_date: string;
  days: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    full_name: string | null;
    department: string | null;
  };
}

export interface LeaveBalance {
  id: string;
  user_id: string;
  profile_id: string | null;
  leave_type: "casual" | "sick" | "earned" | "maternity" | "paternity" | "wfh";
  total_days: number;
  used_days: number;
  year: number;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  year: number;
}

export function useLeaveRequests(status?: string) {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["leave-requests", status, isDevMode],
    queryFn: async () => {
      if (isDevMode) {
        if (status && status !== "all") return mockLeaveRequests.filter(r => r.status === status);
        return mockLeaveRequests;
      }
      let query = supabase
        .from("leave_requests")
        .select(`*, profiles!profile_id(full_name, department)`)
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as LeaveRequest[];
    },
    enabled: !!user || isDevMode,
  });
}

export function useMyLeaveRequests() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["my-leave-requests", isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockLeaveRequests;
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as LeaveRequest[];
    },
    enabled: !!user || isDevMode,
  });
}

export function useLeaveBalances() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const currentYear = new Date().getFullYear();

  return useQuery({
    queryKey: ["leave-balances", currentYear, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockLeaveBalances;
      const { data, error } = await supabase
        .from("leave_balances")
        .select("*")
        .eq("user_id", user?.id)
        .eq("year", currentYear);

      if (error) throw error;
      
      const defaultBalances: LeaveBalance[] = [
        { id: "1", user_id: user?.id || "", profile_id: null, leave_type: "casual", total_days: 12, used_days: 0, year: currentYear },
        { id: "2", user_id: user?.id || "", profile_id: null, leave_type: "sick", total_days: 10, used_days: 0, year: currentYear },
        { id: "3", user_id: user?.id || "", profile_id: null, leave_type: "earned", total_days: 15, used_days: 0, year: currentYear },
        { id: "4", user_id: user?.id || "", profile_id: null, leave_type: "maternity", total_days: 180, used_days: 0, year: currentYear },
      ];

      return data.length > 0 ? data as LeaveBalance[] : defaultBalances;
    },
    enabled: !!user || isDevMode,
  });
}

export function useHolidays() {
  const currentYear = new Date().getFullYear();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["holidays", currentYear],
    queryFn: async () => {
      if (isDevMode) return mockHolidays;
      const { data, error } = await supabase
        .from("holidays")
        .select("*")
        .eq("year", currentYear)
        .order("date", { ascending: true });

      if (error) throw error;
      return data as Holiday[];
    },
  });
}

export function useCreateLeaveRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (request: {
      leave_type: LeaveRequest["leave_type"];
      from_date: string;
      to_date: string;
      reason?: string;
    }) => {
      // Timezone-safe day calculation: parse date parts directly to avoid UTC offset shifts
      const [fy, fm, fd] = request.from_date.split("-").map(Number);
      const [ty, tm, td] = request.to_date.split("-").map(Number);
      const from = new Date(fy, fm - 1, fd);
      const to = new Date(ty, tm - 1, td);
      const days = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // Sanity guard: reject obviously corrupt ranges (>365 days)
      if (days < 1 || days > 365) {
        throw new Error(`Invalid date range: ${days} days. Please check your from/to dates.`);
      }

      // Fetch the user's profile_id so the join works in the table
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user?.id)
        .maybeSingle();

      const { data, error } = await supabase
        .from("leave_requests")
        .insert({
          user_id: user?.id,
          profile_id: profile?.id ?? null,
          leave_type: request.leave_type,
          from_date: request.from_date,
          to_date: request.to_date,
          days,
          reason: request.reason,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      toast.success("Leave request submitted successfully");
      if (user) writeAudit({ actor_id: user.id, actor_name: user.user_metadata?.full_name ?? user.email ?? "Unknown", action: "leave_submitted", entity_type: "leave_request", entity_id: data.id, metadata: { leave_type: data.leave_type, from_date: data.from_date, to_date: data.to_date, days: data.days } });
      supabase.functions.invoke("send-notification-email", {
        body: { type: "leave_request_created", payload: { leave_request_id: data.id } },
      }).catch((err) => console.warn("Failed to send leave notification:", err));
    },
    onError: (error) => {
      toast.error("Failed to submit leave request: " + error.message);
    },
  });
}

export function useApproveLeaveRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase
        .from("leave_requests")
        .update({
          status: "approved",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success("Leave request approved");
      if (user) writeAudit({ actor_id: user.id, actor_name: user.user_metadata?.full_name ?? user.email ?? "Unknown", action: "leave_approved", entity_type: "leave_request", entity_id: data.id, target_user_id: data.user_id, metadata: { leave_type: data.leave_type, from_date: data.from_date, to_date: data.to_date, days: data.days } });
      supabase.functions.invoke("send-notification-email", {
        body: { type: "leave_request_decided", payload: { leave_request_id: data.id, decision: "approved" } },
      }).catch((err) => console.warn("Failed to send approval email:", err));
    },
    onError: (error) => {
      toast.error("Failed to approve request: " + error.message);
    },
  });
}

export function useRejectLeaveRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase
        .from("leave_requests")
        .update({
          status: "rejected",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success("Leave request rejected");
      if (user) writeAudit({ actor_id: user.id, actor_name: user.user_metadata?.full_name ?? user.email ?? "Unknown", action: "leave_rejected", entity_type: "leave_request", entity_id: data.id, target_user_id: data.user_id, metadata: { leave_type: data.leave_type, from_date: data.from_date, to_date: data.to_date } });
      supabase.functions.invoke("send-notification-email", {
        body: { type: "leave_request_decided", payload: { leave_request_id: data.id, decision: "rejected" } },
      }).catch((err) => console.warn("Failed to send rejection email:", err));
    },
    onError: (error) => {
      toast.error("Failed to reject request: " + error.message);
    },
  });
}

export function useDeleteLeaveRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("leave_requests")
        .delete()
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: (_data, requestId) => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      toast.success("Leave request cancelled");
      if (user) writeAudit({ actor_id: user.id, actor_name: user.user_metadata?.full_name ?? user.email ?? "Unknown", action: "leave_cancelled", entity_type: "leave_request", entity_id: requestId });
    },
    onError: (error) => {
      toast.error("Failed to cancel request: " + error.message);
    },
  });
}