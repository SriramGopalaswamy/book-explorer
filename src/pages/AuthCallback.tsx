import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [authComplete, setAuthComplete] = useState(false);

  // Navigate only after React has committed the auth state
  useEffect(() => {
    if (authComplete && user) {
      navigate("/", { replace: true });
    }
  }, [authComplete, user, navigate]);

  useEffect(() => {
    const code = searchParams.get("code");
    const stateParam = searchParams.get("state");
    const savedState = sessionStorage.getItem("ms365_oauth_state");
    const errorParam = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");

    console.log("[AuthCallback] code:", !!code, "state match:", stateParam === savedState, "error:", errorParam);

    if (errorParam) {
      const msg = errorDesc || errorParam || "Authentication was denied";
      setError(msg);
      toast.error(msg);
      setTimeout(() => navigate("/auth", { replace: true }), 3000);
      return;
    }

    if (!code) {
      setError("No authorization code received");
      setTimeout(() => navigate("/auth", { replace: true }), 3000);
      return;
    }

    if (!savedState || stateParam !== savedState) {
      sessionStorage.removeItem("ms365_oauth_state");
      const msg = "Authentication failed: invalid state parameter. Please try signing in again.";
      setError(msg);
      toast.error(msg);
      setTimeout(() => navigate("/auth", { replace: true }), 3000);
      return;
    }

    sessionStorage.removeItem("ms365_oauth_state");

    const exchangeCode = async () => {
      try {
        console.log("[AuthCallback] Exchanging code...");
        const { data, error: fnError } = await supabase.functions.invoke("ms365-auth", {
          body: {
            action: "exchange_code",
            code,
            redirect_uri: `${window.location.origin}/auth/callback`,
          },
        });

        console.log("[AuthCallback] Response:", data, fnError);

        if (fnError || data?.error) {
          const msg = data?.error || fnError?.message || "Authentication failed";
          setError(msg);
          toast.error(msg);
          setTimeout(() => navigate("/auth", { replace: true }), 3000);
          return;
        }

        if (data?.pending) {
          navigate("/pending-approval", { replace: true });
          return;
        }

        if (data?.session) {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });

          // Pre-warm the three queries that Index.tsx will need the moment it
          // mounts. These fire NOW (Supabase connection is already warm from the
          // edge-function call above) while React is still processing the auth
          // state change and navigating — giving them a head start so the
          // "Loading your workspace…" spinner is as brief as possible.
          const uid = data.session.user.id;
          queryClient.prefetchQuery({
            queryKey: ["platform-role", uid, "super_admin"],
            staleTime: 5 * 60 * 1000,
            queryFn: async () => {
              const { data: rows } = await supabase
                .from("platform_roles").select("id")
                .eq("user_id", uid).eq("role", "super_admin").limit(1);
              return (rows?.length ?? 0) > 0;
            },
          });
          queryClient.prefetchQuery({
            queryKey: ["user-organization", uid],
            staleTime: 60 * 1000,
            queryFn: async () => {
              const { data: profile, error: pErr } = await supabase
                .from("profiles")
                .select("organization_id, organizations:organization_id(id, name, status, org_state, created_at)")
                .eq("user_id", uid).maybeSingle();
              if (pErr || !profile?.organization_id) return null;
              const org = profile.organizations as any;
              if (!org) return null;
              return {
                organizationId: profile.organization_id,
                orgName: org.name ?? null,
                orgStatus: org.status ?? null,
                orgState: org.org_state ?? null,
                createdAt: org.created_at ?? null,
              };
            },
          });
          queryClient.prefetchQuery({
            queryKey: ["user-all-roles", uid],
            staleTime: 60 * 1000,
            queryFn: async () => {
              const { data: rows } = await supabase
                .from("user_roles").select("role, organization_id").eq("user_id", uid);
              return rows ?? [];
            },
          });

          toast.success("Signed in with Microsoft 365!");
          // Don't navigate here — let the useEffect above handle it
          // once AuthContext has committed the user state
          setAuthComplete(true);
        } else {
          setError("No session returned");
          setTimeout(() => navigate("/auth", { replace: true }), 3000);
        }
      } catch (err) {
        console.error("[AuthCallback] Error:", err);
        setError("An unexpected error occurred");
        toast.error("An unexpected error occurred");
        setTimeout(() => navigate("/auth", { replace: true }), 3000);
      }
    };

    exchangeCode();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(270 10% 6%)" }}>
      <div className="text-center space-y-4">
        {error ? (
          <div>
            <p className="text-lg font-medium text-red-400">{error}</p>
            <p className="text-sm text-white/50 mt-2">Redirecting to sign in...</p>
          </div>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-white mx-auto" />
            <p className="text-white/70">Completing Microsoft 365 sign in...</p>
          </>
        )}
      </div>
    </div>
  );
}
