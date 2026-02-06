import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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

  return useQuery({
    queryKey: ["leave-requests", status],
    queryFn: async () => {
      let query = supabase
        .from("leave_requests")
        .select(`
          *,
          profiles:profile_id (
            full_name,
            department
          )
        `)
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as LeaveRequest[];
    },
    enabled: !!user,
  });
}

export function useMyLeaveRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-leave-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as LeaveRequest[];
    },
    enabled: !!user,
  });
}

export function useLeaveBalances() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();

  return useQuery({
    queryKey: ["leave-balances", currentYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_balances")
        .select("*")
        .eq("user_id", user?.id)
        .eq("year", currentYear);

      if (error) throw error;
      
      // Return default balances if none exist
      const defaultBalances: LeaveBalance[] = [
        { id: "1", user_id: user?.id || "", profile_id: null, leave_type: "casual", total_days: 12, used_days: 0, year: currentYear },
        { id: "2", user_id: user?.id || "", profile_id: null, leave_type: "sick", total_days: 10, used_days: 0, year: currentYear },
        { id: "3", user_id: user?.id || "", profile_id: null, leave_type: "earned", total_days: 15, used_days: 0, year: currentYear },
        { id: "4", user_id: user?.id || "", profile_id: null, leave_type: "maternity", total_days: 180, used_days: 0, year: currentYear },
      ];

      return data.length > 0 ? data as LeaveBalance[] : defaultBalances;
    },
    enabled: !!user,
  });
}

export function useHolidays() {
  const currentYear = new Date().getFullYear();

  return useQuery({
    queryKey: ["holidays", currentYear],
    queryFn: async () => {
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
      // Calculate days
      const fromDate = new Date(request.from_date);
      const toDate = new Date(request.to_date);
      const days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const { data, error } = await supabase
        .from("leave_requests")
        .insert({
          user_id: user?.id,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      toast.success("Leave request submitted successfully");
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success("Leave request approved");
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success("Leave request rejected");
    },
    onError: (error) => {
      toast.error("Failed to reject request: " + error.message);
    },
  });
}

export function useDeleteLeaveRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("leave_requests")
        .delete()
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      toast.success("Leave request cancelled");
    },
    onError: (error) => {
      toast.error("Failed to cancel request: " + error.message);
    },
  });
}