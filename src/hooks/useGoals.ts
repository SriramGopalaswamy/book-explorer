import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { mockGoals, mockGoalStats } from "@/lib/mock-data";
import { toast } from "sonner";

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  progress: number;
  status: "on_track" | "at_risk" | "delayed" | "completed";
  category: string;
  owner: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalStats {
  total: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  delayed: number;
}

interface CallerContext {
  profileId: string;
  organizationId: string;
  isPrivileged: boolean;
  isManager: boolean;
}

// Fetches profile + roles in parallel — reused by useUpdateGoal, useUpdateGoalProgress, useDeleteGoal
async function getCallerContext(userId: string): Promise<CallerContext> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, organization_id").eq("user_id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (!profile?.organization_id) throw new Error("Organization not found");
  const userRoles = (roles ?? []).map((r: any) => r.role as string);
  return {
    profileId: profile.id,
    organizationId: profile.organization_id,
    isPrivileged: userRoles.some((r) => ["admin", "hr"].includes(r)),
    isManager: userRoles.includes("manager"),
  };
}

export function useGoals() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["goals", orgId, user?.id, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockGoals;
      if (!orgId || !user) return [];

      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("id, organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!callerProfile?.organization_id) return [];

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("organization_id", callerProfile.organization_id);
      const userRoles = (roles ?? []).map((r) => r.role);
      const isPrivileged = userRoles.some((r) => ["admin", "hr"].includes(r));
      const isManager = userRoles.includes("manager");

      if (isPrivileged) {
        const { data, error } = await supabase
          .from("goals")
          .select("*")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data as Goal[];
      }

      if (isManager) {
        const { data: reports } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("manager_id", callerProfile.id)
          .eq("organization_id", orgId);
        const reportUserIds = (reports ?? []).map((r: any) => r.user_id).filter(Boolean);
        const visibleUserIds = [user.id, ...reportUserIds];
        const { data, error } = await supabase
          .from("goals")
          .select("*")
          .eq("organization_id", orgId)
          .in("user_id", visibleUserIds)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data as Goal[];
      }

      // Employee sees only their own goals
      const { data, error } = await supabase
        .from("goals")
        .select("*")
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Goal[];
    },
    enabled: (!!user && !!orgId) || isDevMode,
  });
}

export function useGoalStats() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["goal-stats", orgId, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockGoalStats;
      if (!orgId) return { total: 0, completed: 0, onTrack: 0, atRisk: 0, delayed: 0 };
      const { data, error } = await supabase
        .from("goals")
        .select("status")
        .eq("organization_id", orgId);

      if (error) throw error;

      const stats: GoalStats = {
        total: data.length,
        completed: data.filter((g) => g.status === "completed").length,
        onTrack: data.filter((g) => g.status === "on_track").length,
        atRisk: data.filter((g) => g.status === "at_risk").length,
        delayed: data.filter((g) => g.status === "delayed").length,
      };

      return stats;
    },
    enabled: (!!user && !!orgId) || isDevMode,
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (goal: {
      title: string;
      description?: string;
      category: string;
      owner?: string;
      due_date?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (!goal.title?.trim()) throw new Error("Goal title is required");
      if (!goal.category?.trim()) throw new Error("Goal category is required");

      // Resolve caller org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      const { data, error } = await supabase
        .from("goals")
        .insert({
          ...goal,
          user_id: user.id,
          organization_id: callerProfile.organization_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["goal-stats"] });
      toast.success("Goal created successfully");
    },
    onError: (error) => {
      toast.error("Failed to create goal: " + error.message);
    },
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Goal> & { id: string }) => {
      if (!user) throw new Error("Not authenticated");

      // Validate status if provided
      if (updates.status) {
        const validStatuses: Goal["status"][] = ["on_track", "at_risk", "delayed", "completed"];
        if (!validStatuses.includes(updates.status)) throw new Error("Invalid goal status");
      }

      // Validate progress bounds
      if (updates.progress !== undefined) {
        if (updates.progress < 0 || updates.progress > 100) {
          throw new Error("Progress must be between 0 and 100.");
        }
      }

      const [caller, goalResult] = await Promise.all([
        getCallerContext(user.id),
        supabase.from("goals").select("status, user_id, organization_id").eq("id", id).single(),
      ]);
      const { profileId, organizationId, isPrivileged, isManager } = caller;
      if (goalResult.error) throw goalResult.error;
      const current = goalResult.data;

      if (current.organization_id !== organizationId) throw new Error("Goal not found.");

      // Ownership: employee can only edit their own; manager can edit own + direct reports'
      if (!isPrivileged) {
        if (current?.user_id !== user.id) {
          if (isManager) {
            const { data: report } = await supabase.from("profiles").select("id").eq("user_id", current?.user_id).eq("manager_id", profileId).eq("organization_id", organizationId).maybeSingle();
            if (!report) throw new Error("You can only edit your own goals or your direct reports' goals.");
          } else {
            throw new Error("You can only edit your own goals.");
          }
        }
      }

      if (current?.status === "completed" && updates.status !== "on_track" && updates.status !== "at_risk" && updates.status !== "delayed") {
        throw new Error("Completed goals cannot be modified. Reopen the goal first by changing its status.");
      }

      // Title validation if provided
      if (updates.title !== undefined && !updates.title?.trim()) {
        throw new Error("Goal title cannot be empty.");
      }

      const { data, error } = await supabase
        .from("goals")
        .update(updates)
        .eq("id", id)
        .eq("organization_id", organizationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["goal-stats"] });
      toast.success("Goal updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update goal: " + error.message);
    },
  });
}

export function useUpdateGoalProgress() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, progress }: { id: string; progress: number }) => {
      if (!user) throw new Error("Not authenticated");
      // Clamp progress to 0-100
      const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
      const status = clampedProgress >= 100 ? "completed" : undefined;

      const [caller, goalResult] = await Promise.all([
        getCallerContext(user.id),
        supabase.from("goals").select("user_id, organization_id").eq("id", id).single(),
      ]);
      const { profileId, organizationId, isPrivileged, isManager } = caller;
      if (goalResult.error) throw goalResult.error;
      const goal = goalResult.data;

      if (goal.organization_id !== organizationId) throw new Error("Goal not found.");

      if (!isPrivileged) {
        if (goal.user_id !== user.id) {
          if (isManager) {
            const { data: report } = await supabase.from("profiles").select("id").eq("user_id", goal.user_id).eq("manager_id", profileId).eq("organization_id", organizationId).maybeSingle();
            if (!report) throw new Error("You can only update progress on your own goals or your direct reports' goals.");
          } else {
            throw new Error("You can only update progress on your own goals.");
          }
        }
      }

      const { data, error } = await supabase
        .from("goals")
        .update({
          progress: clampedProgress,
          ...(status && { status }),
        })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["goal-stats"] });
    },
    onError: (error) => {
      toast.error("Failed to update progress: " + error.message);
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");

      const [caller, goalResult] = await Promise.all([
        getCallerContext(user.id),
        supabase.from("goals").select("status, user_id, organization_id").eq("id", id).single(),
      ]);
      const { profileId, organizationId, isPrivileged, isManager } = caller;
      if (goalResult.error) throw goalResult.error;
      const goal = goalResult.data;

      if (goal.organization_id !== organizationId) throw new Error("Goal not found.");

      if (!isPrivileged) {
        if (goal.user_id !== user.id) {
          if (isManager) {
            const { data: report } = await supabase.from("profiles").select("id").eq("user_id", goal.user_id).eq("manager_id", profileId).eq("organization_id", organizationId).maybeSingle();
            if (!report) throw new Error("You can only delete your own goals or your direct reports' goals.");
          } else {
            throw new Error("You can only delete your own goals.");
          }
        }
      }

      if (goal.status === "completed") {
        throw new Error("Completed goals cannot be deleted. They are part of the performance record.");
      }
      const { error } = await supabase
        .from("goals")
        .delete()
        .eq("id", id)
        .eq("organization_id", organizationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["goal-stats"] });
      toast.success("Goal deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete goal: " + error.message);
    },
  });
}