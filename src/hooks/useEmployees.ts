import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { mockEmployees } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";

export interface Employee {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  status: "active" | "on_leave" | "inactive";
  join_date: string | null;
  phone: string | null;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEmployeeData {
  full_name: string;
  email: string;
  job_title?: string;
  department?: string;
  status?: Employee["status"];
  join_date?: string;
  phone?: string;
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

// Fetch all employees (profiles) - managers get limited view, admins/HR get full view
export function useEmployees() {
  const { user } = useAuth();
  const { data: isAdmin, isLoading: isRoleLoading } = useIsAdminOrHR();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["employees", user?.id, isAdmin, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockEmployees;
      if (!user) return [];

      if (isAdmin) {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .order("full_name", { ascending: true });

        if (error) throw error;
        return data as Employee[];
      } else {
        const { data, error } = await supabase
          .from("profiles_safe" as any)
          .select("*")
          .order("full_name", { ascending: true });

        if (error) throw error;
        return (data as any[]).map((d) => ({
          ...d,
          email: null,
          phone: null,
        })) as Employee[];
      }
    },
    enabled: (!!user && !isRoleLoading) || isDevMode,
  });
}

// Get employee stats
export function useEmployeeStats() {
  const { data: employees = [] } = useEmployees();

  const stats = {
    total: employees.length,
    active: employees.filter((e) => e.status === "active").length,
    onLeave: employees.filter((e) => e.status === "on_leave").length,
    inactive: employees.filter((e) => e.status === "inactive").length,
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
      toast({
        title: "Employee Added",
        description: "Account created. The employee can sign in with their email address.",
      });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

// Update employee
export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateEmployeeData) => {
      const { data: employee, error } = await supabase
        .from("profiles")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return employee;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: "Employee Updated", description: "Employee details have been updated." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

// Delete employee — removes profile + auth account via edge function
export function useDeleteEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Get the user_id from the profile first
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", id)
        .single();

      if (profileErr) throw profileErr;

      // Delete via edge function (handles auth + roles + profile)
      const { data: result, error } = await supabase.functions.invoke("manage-roles", {
        body: { action: "delete_user", user_id: profile.user_id },
      });

      if (error || result?.error) {
        // Fallback: just delete the profile row if edge fn fails (e.g. no auth account)
        const { error: delErr } = await supabase.from("profiles").delete().eq("id", id);
        if (delErr) throw delErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: "Employee Removed", description: "Employee has been removed from the system." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
