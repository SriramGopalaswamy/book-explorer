/**
 * GBC-22: React Query hook replacing the previous useEffect+supabase.from
 * pattern on Profile.tsx. Returns the current user's profile basics
 * (full_name, department, job_title, phone). Cache-keyed by uid so an
 * org-switch on the same user does not surface stale data.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface MyProfileBasics {
  full_name: string | null;
  department: string | null;
  job_title: string | null;
  phone: string | null;
}

export function useMyProfileBasics() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-profile-basics", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<MyProfileBasics | null> => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, department, job_title, phone")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as MyProfileBasics | null) ?? null;
    },
  });
}
