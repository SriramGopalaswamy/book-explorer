import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { toast } from "sonner";

export interface Memo {
  id: string;
  user_id: string;
  author_name: string;
  title: string;
  subject: string | null;
  content: string | null;       // "Memo Summary"
  excerpt: string | null;
  department: string;           // kept in DB for compatibility
  priority: "low" | "medium" | "high"; // kept in DB for compatibility
  status: "draft" | "pending_approval" | "published" | "rejected";
  views: number;
  recipients: string[];
  attachment_url: string | null;
  reviewer_notes: string | null;
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

// Hook to search profiles by name for recipient autocomplete
export function useProfileSearch(searchTerm: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile-search", searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      const { data, error } = await supabase
        .from("profiles_safe")
        .select("id, full_name, department, job_title")
        .ilike("full_name", `%${searchTerm}%`)
        .eq("status", "active")
        .limit(10);
      if (error) throw error;
      return data as { id: string; full_name: string | null; department: string | null; job_title: string | null }[];
    },
    enabled: !!user && searchTerm.length >= 2,
  });
}

export function useMemos(status?: string) {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["memos", status, isDevMode],
    queryFn: async () => {
      if (isDevMode) return [] as Memo[];
      let query = supabase
        .from("memos")
        .select("*")
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        const statusMap: Record<string, string> = {
          pending: "pending_approval",
          published: "published",
          draft: "draft",
          rejected: "rejected",
        };
        query = query.eq("status", statusMap[status] || status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Memo[];
    },
    enabled: !!user || isDevMode,
  });
}

export function useMemoStats() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["memo-stats", isDevMode],
    queryFn: async () => {
      if (isDevMode) return { total: 0, published: 0, drafts: 0, pending: 0 } as MemoStats;
      const { data, error } = await supabase.from("memos").select("status");
      if (error) throw error;

      return {
        total: data.length,
        published: data.filter((m) => m.status === "published").length,
        drafts: data.filter((m) => m.status === "draft").length,
        pending: data.filter((m) => m.status === "pending_approval").length,
      } as MemoStats;
    },
    enabled: !!user || isDevMode,
  });
}

// Upload a file to memo-attachments bucket, returns public signed URL path
export async function uploadMemoAttachment(file: File, userId: string): Promise<string> {
  const ext = file.name.split(".").pop();
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  
  const { error } = await supabase.storage
    .from("memo-attachments")
    .upload(fileName, file, { contentType: file.type, upsert: false });
  
  if (error) throw new Error("Failed to upload attachment: " + error.message);
  return fileName; // store the path, not a public URL (bucket is private)
}

export function useCreateMemo() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (memo: {
      title: string;
      subject: string;
      content?: string;
      status?: "draft" | "pending_approval";
      author_name: string;
      recipients: string[];
      attachment_url?: string | null;
    }) => {
      const excerpt = memo.content
        ? memo.content.substring(0, 150) + (memo.content.length > 150 ? "..." : "")
        : null;

      const { data, error } = await supabase
        .from("memos")
        .insert({
          title: memo.title,
          subject: memo.subject,
          content: memo.content ?? null,
          excerpt,
          department: "All",       // kept for DB compat
          priority: "medium",      // kept for DB compat
          status: memo.status ?? "pending_approval",
          author_name: memo.author_name,
          recipients: memo.recipients,
          attachment_url: memo.attachment_url ?? null,
          user_id: user?.id,
          published_at: null,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as Memo;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.invalidateQueries({ queryKey: ["memo-stats"] });
      if (data.status === "pending_approval") {
        toast.success("Memo submitted for manager approval");
        // Notify manager via edge function
        supabase.functions.invoke("send-notification-email", {
          body: { type: "memo_submitted_for_approval", payload: { memo_id: data.id } },
        }).catch((err) => console.warn("Failed to send memo notification:", err));
      } else {
        toast.success("Memo saved as draft");
      }
    },
    onError: (error: Error) => {
      toast.error("Failed to create memo: " + error.message);
    },
  });
}

export function useUpdateMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Memo> & { id: string }) => {
      const excerpt = updates.content
        ? updates.content.substring(0, 150) + (updates.content.length > 150 ? "..." : "")
        : undefined;

      const { data, error } = await supabase
        .from("memos")
        .update({
          ...updates,
          ...(excerpt !== undefined && { excerpt }),
          ...(updates.status === "published" && { published_at: new Date().toISOString() }),
        } as any)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as Memo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.invalidateQueries({ queryKey: ["memo-stats"] });
      toast.success("Memo updated successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to update memo: " + error.message);
    },
  });
}

// Manager approves memo — publishes it and notifies recipients
export function useApproveMemo() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      reviewerNotes,
      updatedTitle,
      updatedSubject,
      updatedRecipients,
    }: {
      id: string;
      reviewerNotes?: string;
      updatedTitle?: string;
      updatedSubject?: string;
      updatedRecipients?: string[];
    }) => {
      const updates: Record<string, unknown> = {
        status: "published",
        published_at: new Date().toISOString(),
        reviewed_by: user?.id,
        reviewer_notes: reviewerNotes ?? null,
      };
      if (updatedTitle) updates.title = updatedTitle;
      if (updatedSubject) updates.subject = updatedSubject;
      if (updatedRecipients) updates.recipients = updatedRecipients;

      const { data, error } = await supabase
        .from("memos")
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as Memo;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.invalidateQueries({ queryKey: ["memo-stats"] });
      toast.success("Memo approved and published");
      supabase.functions.invoke("send-notification-email", {
        body: { type: "memo_approved", payload: { memo_id: data.id } },
      }).catch((err) => console.warn("Failed to send memo notification:", err));
    },
    onError: (error: Error) => {
      toast.error("Failed to approve memo: " + error.message);
    },
  });
}

// Manager rejects memo
export function useRejectMemo() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, reviewerNotes }: { id: string; reviewerNotes: string }) => {
      const { data, error } = await supabase
        .from("memos")
        .update({
          status: "rejected",
          reviewed_by: user?.id,
          reviewer_notes: reviewerNotes,
        } as any)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as Memo;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.invalidateQueries({ queryKey: ["memo-stats"] });
      toast.success("Memo rejected");
      supabase.functions.invoke("send-notification-email", {
        body: { type: "memo_rejected", payload: { memo_id: data.id } },
      }).catch((err) => console.warn("Failed to send memo notification:", err));
    },
    onError: (error: Error) => {
      toast.error("Failed to reject memo: " + error.message);
    },
  });
}

// Pending memos for manager to review (from their direct reports)
export function useDirectReportsPendingMemos() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["pending-memos-for-manager", user?.id, isDevMode],
    queryFn: async () => {
      if (isDevMode || !user) return [] as Memo[];
      
      // Get manager's profile_id
      const { data: myProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      
      if (!myProfile) return [] as Memo[];

      // Get direct reports
      const { data: reports } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("manager_id", myProfile.id)
        .not("user_id", "is", null);

      if (!reports || reports.length === 0) return [] as Memo[];
      
      const reportUserIds = reports.map(r => r.user_id).filter(Boolean);

      const { data, error } = await supabase
        .from("memos")
        .select("*")
        .eq("status", "pending_approval")
        .in("user_id", reportUserIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as Memo[];
    },
    enabled: !!user && !isDevMode,
  });
}

export function useIncrementMemoViews() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: current } = await supabase
        .from("memos")
        .select("views")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("memos")
        .update({ views: (current?.views || 0) + 1 } as any)
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
      const { error } = await supabase.from("memos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.invalidateQueries({ queryKey: ["memo-stats"] });
      toast.success("Memo deleted successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete memo: " + error.message);
    },
  });
}
