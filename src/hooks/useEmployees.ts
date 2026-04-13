import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { mockEmployees } from "@/lib/mock-data";
import { toast } from "sonner";

export interface Employee {
  id: string;
  user_id: string;
  organization_id: string | null;
  employee_id: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  status: "active" | "on_leave" | "inactive";
  join_date: string | null;
  date_of_joining: string | null;
  phone: string | null;
  location: string | null;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
  // Extended fields from employee_details (null when not yet filled in)
  gender: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  marital_status: string | null;
  nationality: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_phone: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  employee_id_number: string | null;
  pan_number: string | null;
  aadhaar_last_four: string | null;
  uan_number: string | null;
  esi_number: string | null;
}

export interface CreateEmployeeData {
  full_name: string;
  email: string;
  job_title?: string;
  department?: string;
  status?: Employee["status"];
  join_date?: string;
  phone?: string;
  location?: string;
  manager_id?: string | null;
}

export interface UpdateEmployeeData extends Partial<CreateEmployeeData> {
  id: string;
}

// Check if user has admin/HR role — server-side only
export function useIsAdminOrHR() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-role", user?.id],
    queryFn: async () => {
      if (!user) return false;
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "hr"]);

      if (error) {
        console.error("Error checking role:", error);
        return false;
      }

      return data && data.length > 0;
    },
    enabled: !!user,
  });
}

// Check if user has admin, HR, or finance role
export function useIsAdminHROrFinance() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-role", user?.id, "admin-hr-finance"],
    queryFn: async () => {
      if (!user) return false;
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "hr", "finance"]);

      if (error) {
        console.error("Error checking role:", error);
        return false;
      }

      return data && data.length > 0;
    },
    enabled: !!user,
  });
}

// Fetch all employees (profiles) - ORGANIZATION-SCOPED to prevent cross-tenant data bleed
export function useEmployees() {
  const { user } = useAuth();
  const { data: hasAccess, isLoading: isRoleLoading } = useIsAdminHROrFinance();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["employees", user?.id, hasAccess, isDevMode, orgId],
    queryFn: async () => {
      if (isDevMode) return mockEmployees;
      if (!user) return [];
      // HARD GUARD: Never query profiles without org scope — prevents cross-tenant data bleed
      if (!orgId) return [];

      if (hasAccess) {
        // CRITICAL: Always filter by organization_id to enforce tenant isolation
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("organization_id", orgId)
          .order("full_name", { ascending: true })
          .limit(500);
        if (error) throw error;
        const employees = data as Employee[];

        // Fix stale on_leave statuses: check if employee actually has an approved leave covering today
        const today = new Date().toISOString().split("T")[0];
        const onLeaveIds = employees.filter(e => e.status === "on_leave").map(e => e.id);
        
        if (onLeaveIds.length > 0) {
          const { data: activeLeaves } = await supabase
            .from("leave_requests")
            .select("user_id")
            .eq("status", "approved")
            .eq("organization_id", orgId)
            .lte("from_date", today)
            .gte("to_date", today);

          const usersOnLeaveToday = new Set((activeLeaves || []).map(l => l.user_id));

          // Reset profiles that show on_leave but have no active leave today
          const staleProfiles = employees.filter(
            e => e.status === "on_leave" && !usersOnLeaveToday.has(e.user_id)
          );

          if (staleProfiles.length > 0) {
            // Update in background, don't block the UI
            Promise.all(
              staleProfiles.map(p =>
                supabase.from("profiles").update({ status: "active" }).eq("id", p.id)
              )
            ).catch(err => console.warn("Failed to reset stale on_leave status:", err));

            // Also fix the returned data immediately
            for (const emp of employees) {
              if (emp.status === "on_leave" && !usersOnLeaveToday.has(emp.user_id)) {
                emp.status = "active";
              }
            }
          }
        }

        return employees;
      } else {
        // Non-admin view: use safe view, also org-scoped
        const { data, error } = await supabase
          .from("profiles_safe" as any)
          .select("*")
          .eq("organization_id", orgId)
          .order("full_name", { ascending: true })
          .limit(500);
        if (error) throw error;
        return (data as any[]).map((d) => ({
          ...d,
          email: null,
          phone: null,
        })) as Employee[];
      }
    },
    enabled: (!!user && !isRoleLoading && !!orgId) || isDevMode,
  });
}

// Get employee stats
export function useEmployeeStats() {
  const { data: employees = [] } = useEmployees();
  const { user } = useAuth();

  // Dynamically count approved leaves for today (matches attendance module logic)
  const { data: orgData } = useUserOrganization();
  const statsOrgId = orgData?.organizationId;

  const { data: approvedLeavesToday = [] } = useQuery({
    queryKey: ["employee-stats-leaves-today", statsOrgId],
    queryFn: async () => {
      if (!statsOrgId) return [];
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("leave_requests")
        .select("user_id, profile_id")
        .eq("status", "approved")
        .eq("organization_id", statsOrgId)
        .lte("from_date", today)
        .gte("to_date", today);
      return data || [];
    },
    enabled: !!user && !!statsOrgId,
  });

  const leaveProfileIds = new Set(
    approvedLeavesToday
      .map((l) => l.profile_id)
      .filter(Boolean)
  );
  const leaveUserIds = new Set(
    approvedLeavesToday
      .map((l) => l.user_id)
      .filter(Boolean)
  );

  const onLeaveCount = employees.filter(
    (e) => leaveProfileIds.has(e.id) || leaveUserIds.has(e.user_id)
  ).length;

  const stats = {
    total: employees.length,
    active: employees.filter((e) => e.status !== "inactive").length - onLeaveCount,
    onLeave: onLeaveCount,
    inactive: employees.filter((e) => e.status === "inactive").length,
    onLeaveIds: { profileIds: leaveProfileIds, userIds: leaveUserIds },
  };

  return stats;
}

// Create employee — always via edge function so a real auth account is created
// and the user appears in both Employees and Settings
export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateEmployeeData) => {
      const { data: result, error } = await supabase.functions.invoke("manage-roles", {
        body: { action: "create_user", ...data, role: "employee" },
      });

      if (error || result?.error) throw new Error(result?.error || error?.message || "Failed to create employee");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
      toast.success("Employee added. They can sign in with their email address.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

// Update employee
export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateEmployeeData) => {
      // Resolve org_id to enforce tenant isolation on update
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", id)
        .single();

      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();

      if (!profile || !callerProfile || profile.organization_id !== callerProfile.organization_id) {
        throw new Error("Cannot update employee from another organization.");
      }

      const { data: employee, error } = await supabase
        .from("profiles")
        .update(data)
        .eq("id", id)
        .eq("organization_id", callerProfile.organization_id)
        .select()
        .single();

      if (error) throw error;
      return employee;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

// Delete employee — removes profile + auth account via edge function
export function useDeleteEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Resolve caller org for tenant isolation
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      // Get the user_id from the profile (org-scoped)
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", id)
        .eq("organization_id", callerProfile.organization_id)
        .single();

      if (profileErr) throw profileErr;
      if (!profile) throw new Error("Employee not found in your organization.");

      // Delete via edge function (handles auth account + roles cleanup)
      await supabase.functions.invoke("manage-roles", {
        body: { action: "delete_user", user_id: profile.user_id },
      });

      // Always explicitly delete the profile row to ensure it is removed from the UI.
      // The edge function may only revoke auth/roles and not delete the profile record.
      const { error: delErr } = await supabase
        .from("profiles")
        .delete()
        .eq("id", id)
        .eq("organization_id", callerProfile.organization_id);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
      toast.success("Employee deleted. Their profile and login access have been permanently removed.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
