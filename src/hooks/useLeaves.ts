import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
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
  leave_type: string;
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
  leave_type: string;
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
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["leave-requests", status, orgId, isDevMode],
    queryFn: async () => {
      if (isDevMode) {
        if (status && status !== "all") return mockLeaveRequests.filter(r => r.status === status);
        return mockLeaveRequests;
      }
      if (!orgId) return [];
      let query = supabase
        .from("leave_requests")
        .select(`*, profiles!profile_id(full_name, department)`)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });

      if (status && status !== "all") query = query.eq("status", status);

      const { data, error } = await query;
      if (error) throw error;
      return data as LeaveRequest[];
    },
    enabled: (!!user && !!orgId) || isDevMode,
  });
}

export function useMyLeaveRequests() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["my-leave-requests", orgId, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockLeaveRequests;
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("user_id", user?.id)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as LeaveRequest[];
    },
    enabled: (!!user && !!orgId) || isDevMode,
  });
}

export function useLeaveBalances() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const currentYear = new Date().getFullYear();

  return useQuery({
    queryKey: ["leave-balances", currentYear, orgId, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockLeaveBalances;
      if (!orgId || !user) return [];

      // First, auto-provision missing balances from active leave_types
      try {
        await supabase.rpc("provision_leave_balances", {
          _user_id: user.id,
          _org_id: orgId,
          _year: currentYear,
        });
      } catch (provErr) {
        console.warn("Balance provisioning skipped:", provErr);
      }

      // Now fetch the real balances
      const { data, error } = await supabase
        .from("leave_balances")
        .select("*")
        .eq("user_id", user.id)
        .eq("organization_id", orgId)
        .eq("year", currentYear);

      if (error) throw error;
      return (data ?? []) as LeaveBalance[];
    },
    enabled: (!!user && !!orgId) || isDevMode,
  });
}

export function useHolidays() {
  const currentYear = new Date().getFullYear();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["holidays", currentYear, orgId],
    queryFn: async () => {
      if (isDevMode) return mockHolidays;
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("holidays")
        .select("*")
        .eq("organization_id", orgId)
        .eq("year", currentYear)
        .order("date", { ascending: true });

      if (error) throw error;
      return data as Holiday[];
    },
    enabled: !!orgId || isDevMode,
  });
}

export function useCreateLeaveRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (request: {
      leave_type: string;
      from_date: string;
      to_date: string;
      reason?: string;
      attachment?: File | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (!request.leave_type?.trim()) throw new Error("Leave type is required");
      if (!request.from_date || !request.to_date) throw new Error("Date range is required");

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

      // Resolve caller org for tenant isolation on pre-checks
      const { data: callerProfile } = await supabase.from("profiles").select("id, organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      // Check for overlapping pending/approved leave requests (org-scoped)
      const { data: overlapping } = await supabase
        .from("leave_requests")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", callerProfile.organization_id)
        .in("status", ["pending", "approved"])
        .lte("from_date", request.to_date)
        .gte("to_date", request.from_date)
        .limit(1);
      if (overlapping && overlapping.length > 0) {
        throw new Error("You already have a leave request overlapping with these dates");
      }

      // Check leave balance — block if insufficient (org-scoped)
      const currentYear = new Date().getFullYear();
      const { data: balances } = await supabase
        .from("leave_balances")
        .select("total_days, used_days")
        .eq("user_id", user.id)
        .eq("organization_id", callerProfile.organization_id)
        .eq("leave_type", request.leave_type)
        .eq("year", currentYear)
        .maybeSingle();
      if (balances) {
        const remaining = Number(balances.total_days) - Number(balances.used_days);
        if (days > remaining) {
          throw new Error(`Insufficient ${request.leave_type} leave balance. Available: ${remaining} days, Requested: ${days} days.`);
        }
      }

      // Check against holidays — warn but don't block
      const { data: holidays } = await supabase
        .from("holidays")
        .select("date, name")
        .gte("date", request.from_date)
        .lte("date", request.to_date);
      if (holidays && holidays.length > 0) {
        console.info(`Leave overlaps with ${holidays.length} holiday(s): ${holidays.map(h => h.name).join(", ")}`);
      }

      // Upload attachment if provided
      let attachment_url: string | null = null;
      if (request.attachment && user) {
        const fileExt = request.attachment.name.split(".").pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("leave-attachments")
          .upload(filePath, request.attachment);
        if (uploadError) throw new Error("Failed to upload attachment: " + uploadError.message);
        attachment_url = filePath;
      }

      const { data, error } = await supabase
        .from("leave_requests")
        .insert({
          user_id: user?.id,
          profile_id: callerProfile.id ?? null,
          organization_id: callerProfile.organization_id,
          leave_type: request.leave_type,
          from_date: request.from_date,
          to_date: request.to_date,
          days,
          reason: request.reason,
          attachment_url,
        } as any)
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
      if (!user) throw new Error("Not authenticated");

      // Verify request is still pending & enforce self-approval guard
      const { data: check } = await supabase
        .from("leave_requests")
        .select("status, user_id")
        .eq("id", requestId)
        .maybeSingle();
      if (check?.status !== "pending") {
        throw new Error("This leave request has already been reviewed");
      }
      // Maker-checker: manager cannot approve their own leave
      if (check?.user_id === user.id) {
        throw new Error("You cannot approve your own leave request.");
      }

      // Resolve caller org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      const { data, error } = await supabase
        .from("leave_requests")
        .update({
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("organization_id", callerProfile.organization_id)
        .select()
        .single();

      if (error) throw error;

      // ── CRITICAL: Decrement leave balance ──────────────────────
      try {
        const currentYear = new Date().getFullYear();
        const { data: balance } = await supabase
          .from("leave_balances")
          .select("id, used_days")
          .eq("user_id", data.user_id)
          .eq("leave_type", data.leave_type)
          .eq("year", currentYear)
          .maybeSingle();

        if (balance) {
          const newUsed = Number(balance.used_days) + Number(data.days);
          await supabase
            .from("leave_balances")
            .update({ used_days: newUsed })
            .eq("id", balance.id);
        }
      } catch (balErr) {
        console.warn("Failed to update leave balance:", balErr);
      }

      // Create attendance_records with status='leave' for each day in the leave range
      try {
        const fromDate = new Date(data.from_date);
        const toDate = new Date(data.to_date);
        const today = new Date().toISOString().split("T")[0];
        const leaveRecords: Array<{
          user_id: string;
          profile_id: string | null;
          date: string;
          status: string;
          notes: string;
        }> = [];

        // Get the employee's profile_id
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", data.user_id)
          .maybeSingle();

        for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0];
          leaveRecords.push({
            user_id: data.user_id,
            profile_id: profile?.id || null,
            date: dateStr,
            status: "leave",
            notes: `Approved ${data.leave_type} leave`,
          });
        }

        if (leaveRecords.length > 0) {
          await supabase
            .from("attendance_records")
            .upsert(leaveRecords, { onConflict: "profile_id,date" });
        }

        // Update profile status to 'on_leave' if the leave covers today
        if (profile?.id && data.from_date <= today && data.to_date >= today) {
          await supabase
            .from("profiles")
            .update({ status: "on_leave" })
            .eq("id", profile.id);
        }
      } catch (syncErr) {
        console.warn("Failed to sync leave to attendance/profile:", syncErr);
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-attendance-stats"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
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
      if (!user) throw new Error("Not authenticated");

      // Verify request is still pending & enforce self-rejection guard
      const { data: check } = await supabase
        .from("leave_requests")
        .select("status, user_id")
        .eq("id", requestId)
        .maybeSingle();
      if (check?.status !== "pending") {
        throw new Error("This leave request has already been reviewed");
      }
      if (check?.user_id === user.id) {
        throw new Error("You cannot reject your own leave request.");
      }

      // Resolve caller org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      const { data, error } = await supabase
        .from("leave_requests")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("organization_id", callerProfile.organization_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
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
      if (!user) throw new Error("Not authenticated");

      // Only allow deleting own pending/approved requests
      const { data: check } = await supabase
        .from("leave_requests")
        .select("status, user_id, leave_type, days, from_date, to_date, profile_id")
        .eq("id", requestId)
        .maybeSingle();
      if (!check) throw new Error("Leave request not found");
      if (check.user_id !== user.id) throw new Error("You can only cancel your own leave requests");
      if (check.status !== "pending" && check.status !== "approved") throw new Error("Only pending or approved leave requests can be cancelled");

      const wasApproved = check.status === "approved";

      // If approved, restore leave balance and clean up attendance
      if (wasApproved) {
        try {
          const currentYear = new Date().getFullYear();
          const { data: balance } = await supabase
            .from("leave_balances")
            .select("id, used_days")
            .eq("user_id", user.id)
            .eq("leave_type", check.leave_type)
            .eq("year", currentYear)
            .maybeSingle();
          if (balance) {
            const restoredUsed = Math.max(0, Number(balance.used_days) - Number(check.days));
            await supabase
              .from("leave_balances")
              .update({ used_days: restoredUsed })
              .eq("id", balance.id);
          }
        } catch (balErr) {
          console.warn("Failed to restore leave balance:", balErr);
        }

        // Delete attendance records created for this leave
        try {
          if (check.profile_id) {
            await supabase
              .from("attendance_records")
              .delete()
              .eq("profile_id", check.profile_id)
              .eq("status", "leave")
              .gte("date", check.from_date)
              .lte("date", check.to_date);
          }
        } catch (attErr) {
          console.warn("Failed to clean up attendance records:", attErr);
        }
      }

      // Resolve caller org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      const { error } = await supabase
        .from("leave_requests")
        .delete()
        .eq("id", requestId)
        .eq("organization_id", callerProfile.organization_id);

      if (error) throw error;
    },
    onSuccess: (_data, requestId) => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-attendance-stats"] });
      toast.success("Leave request cancelled");
      if (user) writeAudit({ actor_id: user.id, actor_name: user.user_metadata?.full_name ?? user.email ?? "Unknown", action: "leave_cancelled", entity_type: "leave_request", entity_id: requestId });
    },
    onError: (error) => {
      toast.error("Failed to cancel request: " + error.message);
    },
  });
}

// ─── Leave Types (HR-configurable) ───────────────────────────────────

export interface LeaveType {
  id: string;
  organization_id: string;
  key: string;
  label: string;
  icon: string;
  color: string;
  default_days: number;
  is_active: boolean;
  sort_order: number;
  gender_eligibility: 'all' | 'male' | 'female';
}

export function useLeaveTypes() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["leave-types"],
    queryFn: async () => {
      if (isDevMode) {
        return [
          { id: "1", organization_id: "", key: "casual", label: "Casual Leave", icon: "Palmtree", color: "text-green-600", default_days: 12, is_active: true, sort_order: 1 },
          { id: "2", organization_id: "", key: "sick", label: "Sick Leave", icon: "Stethoscope", color: "text-red-600", default_days: 10, is_active: true, sort_order: 2 },
          { id: "3", organization_id: "", key: "earned", label: "Earned Leave", icon: "Briefcase", color: "text-blue-600", default_days: 15, is_active: true, sort_order: 3 },
          { id: "4", organization_id: "", key: "maternity", label: "Maternity Leave", icon: "Baby", color: "text-purple-600", default_days: 180, is_active: true, sort_order: 4 },
          { id: "5", organization_id: "", key: "paternity", label: "Paternity Leave", icon: "Baby", color: "text-purple-600", default_days: 15, is_active: true, sort_order: 5 },
          { id: "6", organization_id: "", key: "wfh", label: "Work From Home", icon: "Home", color: "text-orange-600", default_days: 30, is_active: true, sort_order: 6 },
        ] as LeaveType[];
      }
      const { data, error } = await supabase
        .from("leave_types")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return (data ?? []) as LeaveType[];
    },
    enabled: !!user || isDevMode,
  });
}

export function useAllLeaveTypes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["leave-types-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_types")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return (data ?? []) as LeaveType[];
    },
    enabled: !!user,
  });
}

export function useCreateLeaveType() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (leaveType: { key: string; label: string; icon: string; color: string; default_days: number; sort_order: number }) => {
      if (!user) throw new Error("Not authenticated");
      if (!leaveType.key?.trim()) throw new Error("Leave type key is required");
      if (!leaveType.label?.trim()) throw new Error("Leave type label is required");
      if (leaveType.default_days < 0) throw new Error("Default days cannot be negative");

      const { data, error } = await supabase
        .from("leave_types")
        .insert(leaveType as any)
        .select()
        .single();

      if (error) throw error;

      // Provision balances for all active employees for this new type
      try {
        const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
        if (callerProfile?.organization_id) {
          await supabase.rpc("provision_all_employees_balances", {
            _org_id: callerProfile.organization_id,
            _year: new Date().getFullYear(),
          });
        }
      } catch (provErr) {
        console.warn("Failed to provision balances for new type:", provErr);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-types"] });
      queryClient.invalidateQueries({ queryKey: ["leave-types-all"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      toast.success("Leave type created");
    },
    onError: (error) => {
      toast.error("Failed to create leave type: " + error.message);
    },
  });
}

export function useUpdateLeaveType() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; label?: string; icon?: string; color?: string; default_days?: number; is_active?: boolean; sort_order?: number }) => {
      if (!user) throw new Error("Not authenticated");
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      // Get current leave type info before updating
      const { data: currentType } = await supabase
        .from("leave_types")
        .select("key, default_days, is_active")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("leave_types")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id)
        .eq("organization_id", callerProfile.organization_id)
        .select()
        .single();

      if (error) throw error;

      // If default_days changed, propagate to all employee balances
      if (currentType && updates.default_days !== undefined && updates.default_days !== currentType.default_days) {
        try {
          await supabase.rpc("propagate_leave_type_defaults", {
            _leave_type_key: currentType.key,
            _org_id: callerProfile.organization_id,
            _new_default_days: updates.default_days,
            _year: new Date().getFullYear(),
          });
        } catch (propErr) {
          console.warn("Failed to propagate default_days:", propErr);
        }
      }

      // If type was activated, provision balances for all employees
      if (currentType && !currentType.is_active && updates.is_active === true) {
        try {
          await supabase.rpc("provision_all_employees_balances", {
            _org_id: callerProfile.organization_id,
            _year: new Date().getFullYear(),
          });
        } catch (provErr) {
          console.warn("Failed to provision balances for reactivated type:", provErr);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-types"] });
      queryClient.invalidateQueries({ queryKey: ["leave-types-all"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      toast.success("Leave type updated");
    },
    onError: (error) => {
      toast.error("Failed to update leave type: " + error.message);
    },
  });
}