import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  target_user_id: string | null;
  target_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const ACTION_LABELS: Record<string, string> = {
  leave_submitted:           "Leave Submitted",
  leave_approved:            "Leave Approved",
  leave_rejected:            "Leave Rejected",
  leave_cancelled:           "Leave Cancelled",
  correction_submitted:      "Correction Submitted",
  correction_approved:       "Correction Approved",
  correction_rejected:       "Correction Rejected",
  memo_submitted:            "Memo Submitted",
  memo_approved:             "Memo Approved",
  memo_rejected:             "Memo Rejected",
  payroll_processed:         "Payroll Processed",
  employee_created:          "Employee Created",
  employee_updated:          "Employee Updated",
  role_changed:              "Role Changed",
  goal_plan_submitted:       "Goal Plan Submitted",
  goal_plan_approved:        "Goal Plan Approved",
  goal_plan_rejected:        "Goal Plan Rejected",
};

export const ENTITY_LABELS: Record<string, string> = {
  leave_request:             "Leave",
  attendance_correction:     "Attendance Correction",
  memo:                      "Memo",
  payroll:                   "Payroll",
  employee:                  "Employee",
  goal_plan:                 "Goal Plan",
};

export const ACTION_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  leave_submitted:       { bg: "bg-blue-500/10",   text: "text-blue-500",   dot: "bg-blue-500" },
  leave_approved:        { bg: "bg-emerald-500/10", text: "text-emerald-500", dot: "bg-emerald-500" },
  leave_rejected:        { bg: "bg-red-500/10",     text: "text-red-500",   dot: "bg-red-500" },
  leave_cancelled:       { bg: "bg-gray-500/10",    text: "text-gray-500",  dot: "bg-gray-400" },
  correction_submitted:  { bg: "bg-amber-500/10",   text: "text-amber-500", dot: "bg-amber-500" },
  correction_approved:   { bg: "bg-emerald-500/10", text: "text-emerald-500", dot: "bg-emerald-500" },
  correction_rejected:   { bg: "bg-red-500/10",     text: "text-red-500",   dot: "bg-red-500" },
  memo_submitted:        { bg: "bg-violet-500/10",  text: "text-violet-500", dot: "bg-violet-500" },
  memo_approved:         { bg: "bg-emerald-500/10", text: "text-emerald-500", dot: "bg-emerald-500" },
  memo_rejected:         { bg: "bg-red-500/10",     text: "text-red-500",   dot: "bg-red-500" },
  payroll_processed:     { bg: "bg-teal-500/10",    text: "text-teal-500",  dot: "bg-teal-500" },
  employee_created:      { bg: "bg-blue-500/10",    text: "text-blue-500",  dot: "bg-blue-500" },
  employee_updated:      { bg: "bg-blue-500/10",    text: "text-blue-500",  dot: "bg-blue-400" },
  role_changed:          { bg: "bg-orange-500/10",  text: "text-orange-500", dot: "bg-orange-500" },
  goal_plan_submitted:   { bg: "bg-violet-500/10",  text: "text-violet-500", dot: "bg-violet-500" },
  goal_plan_approved:    { bg: "bg-emerald-500/10", text: "text-emerald-500", dot: "bg-emerald-500" },
  goal_plan_rejected:    { bg: "bg-red-500/10",     text: "text-red-500",   dot: "bg-red-500" },
};

export function defaultColor() {
  return { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" };
}

export interface AuditLogFilters {
  entityType?: string;
  action?: string;
  search?: string;
  from?: string;
  to?: string;
}

export function useAuditLogs(filters: AuditLogFilters = {}, page = 1, pageSize = 25) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["audit-logs", filters, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs" as any)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (filters.entityType) query = query.eq("entity_type", filters.entityType);
      if (filters.action)     query = query.eq("action", filters.action);
      if (filters.from)       query = query.gte("created_at", filters.from);
      if (filters.to)         query = query.lte("created_at", filters.to + "T23:59:59");
      if (filters.search) {
        query = query.or(
          `actor_name.ilike.%${filters.search}%,target_name.ilike.%${filters.search}%,action.ilike.%${filters.search}%`
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { logs: (data ?? []) as unknown as AuditLog[], total: count ?? 0 };
    },
    enabled: !!user,
  });
}

// Helper: write an audit log entry from the client
export function useWriteAuditLog() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: {
      action: string;
      entity_type: string;
      entity_id?: string;
      actor_name?: string;
      actor_role?: string;
      target_user_id?: string;
      target_name?: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!user) return;
      const { error } = await supabase.from("audit_logs" as any).insert({
        actor_id: user.id,
        actor_name: entry.actor_name ?? user.user_metadata?.full_name ?? user.email ?? "Unknown",
        actor_role: entry.actor_role ?? null,
        action: entry.action,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id ?? null,
        target_user_id: entry.target_user_id ?? null,
        target_name: entry.target_name ?? null,
        metadata: entry.metadata ?? {},
      } as any);
      if (error) console.warn("Audit log write failed:", error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
  });
}
