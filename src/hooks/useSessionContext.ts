import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SessionContext {
  isSuperAdmin: boolean;
  organizationId: string | null;
  roles: string[];
}

/**
 * Single round-trip session lookup: super-admin flag, org id, and roles.
 * Replaces three parallel queries (platform_roles + user_roles + profiles)
 * that frequently raced or stalled and locked users out of routes.
 */
export function useSessionContext() {
  const { user } = useAuth();

  return useQuery<SessionContext>({
    queryKey: ["session-context", user?.id],
    queryFn: async ({ signal }) => {
      if (!user) return { isSuperAdmin: false, organizationId: null, roles: [] };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      signal?.addEventListener("abort", () => { clearTimeout(timer); controller.abort(); });
      try {
        const { data, error } = await supabase
          .rpc("get_my_session_context")
          .abortSignal(controller.signal);
        if (error) throw error;
        const payload = (data ?? {}) as any;
        return {
          isSuperAdmin: !!payload.is_super_admin,
          organizationId: payload.organization_id ?? null,
          roles: Array.isArray(payload.roles) ? payload.roles : [],
        };
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (a) => Math.min(1000 * 2 ** a, 5000),
  });
}
