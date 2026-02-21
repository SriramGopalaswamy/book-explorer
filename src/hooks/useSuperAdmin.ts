import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Check if current user is a super_admin via platform_roles table.
 * Server-side validated — no client-side bypasses.
 */
export function useIsSuperAdmin() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["platform-role", user?.id, "super_admin"],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("platform_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .limit(1);
      if (error) {
        console.error("Super admin check failed:", error);
        return false;
      }
      return (data?.length ?? 0) > 0;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch all organizations (only accessible to super_admins via RLS).
 */
export function useOrganizations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["platform-organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });
}

/**
 * Fetch org member counts for display.
 */
export function useOrgMemberCounts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["platform-org-member-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("organization_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((m) => {
        counts[m.organization_id] = (counts[m.organization_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!user,
  });
}

/**
 * Fetch tenant health metrics per org.
 */
export function useTenantHealthMetrics(orgId?: string) {
  return useQuery({
    queryKey: ["platform-health", orgId],
    queryFn: async () => {
      const filters = orgId ? { organization_id: orgId } : {};

      const [profiles, invoices, expenses, auditLogs] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).match(filters),
        supabase.from("invoices").select("id", { count: "exact", head: true }).match(filters),
        supabase.from("expenses").select("id", { count: "exact", head: true }).match(filters),
        supabase.from("audit_logs").select("id", { count: "exact", head: true }).match(filters),
      ]);

      return {
        activeUsers: profiles.count ?? 0,
        invoiceCount: invoices.count ?? 0,
        expenseCount: expenses.count ?? 0,
        auditVolume: auditLogs.count ?? 0,
      };
    },
    enabled: true,
  });
}

/**
 * Fetch platform admin logs (superadmin audit trail).
 */
export function usePlatformAdminLogs() {
  return useQuery({
    queryKey: ["platform-admin-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_admin_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Log a superadmin action.
 */
export function useLogPlatformAction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      action: string;
      target_type: string;
      target_id?: string;
      target_name?: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("platform_admin_logs").insert([{
        admin_id: user.id,
        action: params.action,
        target_type: params.target_type,
        target_id: params.target_id,
        target_name: params.target_name,
        metadata: (params.metadata ?? {}) as any,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-admin-logs"] });
    },
  });
}

/**
 * Suspend or reactivate an organization.
 */
export function useOrgStatusAction() {
  const queryClient = useQueryClient();
  const logAction = useLogPlatformAction();

  return useMutation({
    mutationFn: async (params: { orgId: string; orgName: string; newStatus: "active" | "suspended" }) => {
      const { error } = await supabase
        .from("organizations")
        .update({ status: params.newStatus })
        .eq("id", params.orgId);
      if (error) throw error;

      await logAction.mutateAsync({
        action: params.newStatus === "suspended" ? "org_suspended" : "org_reactivated",
        target_type: "organization",
        target_id: params.orgId,
        target_name: params.orgName,
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["platform-organizations"] });
      toast.success(`Organization ${vars.newStatus === "suspended" ? "suspended" : "reactivated"}`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
