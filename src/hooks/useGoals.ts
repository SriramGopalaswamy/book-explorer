import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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

  return useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Goal[];
    },
    enabled: !!user,
  });
}

export function useGoalStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["goal-stats"],
    queryFn: async () => {
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
    enabled: !!user,
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
      const { data, error } = await supabase
        .from("goals")
        .insert({
          ...goal,
          user_id: user?.id,
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

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Goal> & { id: string }) => {
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

  return useMutation({
    mutationFn: async ({ id, progress }: { id: string; progress: number }) => {
      const status = progress >= 100 ? "completed" : undefined;
      
      const { data, error } = await supabase
        .from("goals")
        .update({ 
          progress,
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

  return useMutation({
    mutationFn: async (id: string) => {
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