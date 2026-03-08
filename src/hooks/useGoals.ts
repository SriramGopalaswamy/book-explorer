import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
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

export function useGoals() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["goals", isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockGoals;
      const { data, error } = await supabase
        .from("goals")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Goal[];
    },
    enabled: !!user || isDevMode,
  });
}

export function useGoalStats() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["goal-stats", isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockGoalStats;
      const { data, error } = await supabase
        .from("goals")
        .select("status");

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
    enabled: !!user || isDevMode,
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

      const { data, error } = await supabase
        .from("goals")
        .insert({
          ...goal,
          user_id: user.id,
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

      // Prevent editing completed goals (except to reopen)
      const { data: current, error: fetchErr } = await supabase
        .from("goals")
        .select("status")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;
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
      
      const { data, error } = await supabase
        .from("goals")
        .update({ 
          progress: clampedProgress,
          ...(status && { status }),
        })
        .eq("id", id)
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

      // Prevent deleting completed goals — they should be archived
      const { data: goal, error: fetchErr } = await supabase
        .from("goals")
        .select("status")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;
      if (goal?.status === "completed") {
        throw new Error("Completed goals cannot be deleted. They are part of the performance record.");
      }

      const { error } = await supabase
        .from("goals")
        .delete()
        .eq("id", id);

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