import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Memo {
  id: string;
  user_id: string;
  author_name: string;
  title: string;
  content: string | null;
  excerpt: string | null;
  department: string;
  priority: "low" | "medium" | "high";
  status: "draft" | "pending" | "published";
  views: number;
  recipients: string[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoStats {
  total: number;
  published: number;
  drafts: number;
  pending: number;
}

export function useMemos(status?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["memos", status],
    queryFn: async () => {
      let query = supabase
        .from("memos")
        .select("*")
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Memo[];
    },
    enabled: !!user,
  });
}

export function useMemoStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["memo-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memos")
        .select("status");

      if (error) throw error;

      const stats: MemoStats = {
        total: data.length,
        published: data.filter((m) => m.status === "published").length,
        drafts: data.filter((m) => m.status === "draft").length,
        pending: data.filter((m) => m.status === "pending").length,
      };

      return stats;
    },
    enabled: !!user,
  });
}

export function useCreateMemo() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (memo: {
      title: string;
      content?: string;
      department: string;
      priority: Memo["priority"];
      status?: Memo["status"];
      author_name: string;
      recipients?: string[];
    }) => {
      const excerpt = memo.content 
        ? memo.content.substring(0, 150) + (memo.content.length > 150 ? "..." : "")
        : null;

      const { data, error } = await supabase
        .from("memos")
        .insert({
          ...memo,
          excerpt,
          user_id: user?.id,
          published_at: memo.status === "published" ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.invalidateQueries({ queryKey: ["memo-stats"] });
      toast.success(data.status === "published" ? "Memo published successfully" : "Memo saved as draft");
    },
    onError: (error) => {
      toast.error("Failed to create memo: " + error.message);
    },
  });
}

export function useUpdateMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Memo> & { id: string }) => {
      const excerpt = updates.content 
        ? updates.content.substring(0, 150) + (updates.content.length > 150 ? "..." : "")
        : undefined;

      const { data, error } = await supabase
        .from("memos")
        .update({
          ...updates,
          ...(excerpt && { excerpt }),
          ...(updates.status === "published" && { published_at: new Date().toISOString() }),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.invalidateQueries({ queryKey: ["memo-stats"] });
      toast.success("Memo updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update memo: " + error.message);
    },
  });
}

export function usePublishMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("memos")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.invalidateQueries({ queryKey: ["memo-stats"] });
      toast.success("Memo published successfully");
    },
    onError: (error) => {
      toast.error("Failed to publish memo: " + error.message);
    },
  });
}

export function useIncrementMemoViews() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // First get current views
      const { data: current, error: fetchError } = await supabase
        .from("memos")
        .select("views")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from("memos")
        .update({ views: (current?.views || 0) + 1 })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
    },
  });
}

export function useDeleteMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("memos")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.invalidateQueries({ queryKey: ["memo-stats"] });
      toast.success("Memo deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete memo: " + error.message);
    },
  });
}