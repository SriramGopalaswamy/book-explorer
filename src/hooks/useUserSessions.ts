import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";

export interface UserSession {
  id: string;
  user_id: string;
  organization_id: string;
  email: string | null;
  full_name: string | null;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  device_info: Record<string, string>;
  is_anomaly: boolean;
  anomaly_reasons: string[];
  session_duration_minutes: number | null;
  created_at: string;
}

interface SessionFilters {
  search?: string;
  eventType?: string;
  anomalyOnly?: boolean;
  from?: string;
  to?: string;
}

export function useUserSessions(filters: SessionFilters, page: number, pageSize: number) {
  const { user } = useAuth();
  const orgQuery = useUserOrganization();
  const orgId = orgQuery.data?.organizationId;

  return useQuery({
    queryKey: ["user-sessions", orgId, filters, page, pageSize],
    queryFn: async () => {
      if (!user || !orgId) return { sessions: [], total: 0, anomalyCount: 0 };

      let query = (supabase as any)
        .from("user_sessions")
        .select("*", { count: "exact" })
        .eq("organization_id", orgId)
        .not("event_type", "is", null)
        .order("created_at", { ascending: false });

      if (filters.eventType && filters.eventType !== "all") {
        query = query.eq("event_type", filters.eventType);
      }
      if (filters.anomalyOnly) {
        query = query.eq("is_anomaly", true);
      }
      if (filters.search) {
        query = query.or(
          `email.ilike.%${filters.search}%,full_name.ilike.%${filters.search}%`
        );
      }
      if (filters.from) {
        query = query.gte("created_at", `${filters.from}T00:00:00`);
      }
      if (filters.to) {
        query = query.lte("created_at", `${filters.to}T23:59:59`);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) {
        console.error("useUserSessions error:", error);
        return { sessions: [], total: 0, anomalyCount: 0 };
      }

      // Get anomaly count for stats
      const { count: anomalyCount } = await (supabase as any)
        .from("user_sessions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("is_anomaly", true);

      return {
        sessions: (data || []) as UserSession[],
        total: count ?? 0,
        anomalyCount: anomalyCount ?? 0,
      };
    },
    enabled: !!user && !!orgId,
  });
}