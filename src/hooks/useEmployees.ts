import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAppMode } from "@/contexts/AppModeContext";
import { useDevMode } from "@/contexts/DevModeContext";
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

// Check if user has admin/HR role — respects dev mode active role
export function useIsAdminOrHR() {
  const { user } = useAuth();
  const { canShowDevTools } = useAppMode();
  const { activeRole } = useDevMode();

  return useQuery({
    queryKey: ["user-role", user?.id, canShowDevTools, activeRole],
    queryFn: async () => {
      // In dev mode, respect the active role from the role switcher
      if (canShowDevTools && activeRole) {
        return activeRole === "admin" || activeRole === "hr";
      }

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
    enabled: !!user || canShowDevTools,
  });
}

// Fetch all employees (profiles) - managers get limited view, admins/HR get full view
export function useEmployees() {
  const { user } = useAuth();
  const { data: isAdmin } = useIsAdminOrHR();
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
    enabled: !!user || isDevMode,
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

// Create employee
export function useCreateEmployee() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateEmployeeData) => {
      if (!user) throw new Error("Not authenticated");

      // Note: In a full implementation, you would create a user account first
      // and then the profile. For now, we create a profile with a placeholder user_id
      const { data: employee, error } = await supabase
        .from("profiles")
        .insert({
          ...data,
          user_id: crypto.randomUUID(), // Placeholder - in production, link to actual user
        })
        .select()
        .single();

      if (error) throw error;
      return employee;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: "Employee Added", description: "New employee has been added successfully." });
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

// Delete employee
export function useDeleteEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) throw error;
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
