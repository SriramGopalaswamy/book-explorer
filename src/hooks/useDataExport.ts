import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface DataExportRequest {
  id: string;
  user_id: string;
  organization_id: string;
  request_type: string;
  data_categories: string[];
  status: "pending" | "processing" | "completed" | "failed";
  file_url: string | null;
  requested_at: string;
  completed_at: string | null;
  expires_at: string | null;
}

const ALL_CATEGORIES = ["profile", "attendance", "leaves", "payroll", "documents", "expenses", "goals"] as const;

export function useDataExportRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["data-export-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("data_export_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return data as DataExportRequest[];
    },
    enabled: !!user,
  });
}

export function useRequestDataExport() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (categories?: string[] | void) => {
      const { data, error } = await (supabase as any)
        .from("data_export_requests")
        .insert({
          user_id: user!.id,
          request_type: "full_export",
          data_categories: categories ?? ALL_CATEGORIES,
        })
        .select()
        .single();
      if (error) throw error;

      // Trigger async processing via edge function
      supabase.functions
        .invoke("process-data-export", { body: { request_id: data.id } })
        .catch((err) => console.warn("Export processing trigger failed:", err));

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["data-export-requests"] });
      toast.success("Data export requested. You'll be notified when it's ready.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
