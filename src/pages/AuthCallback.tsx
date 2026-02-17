import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

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

    // Warn but don't block if state doesn't match (sessionStorage can be lost on redirect)
    if (savedState && stateParam !== savedState) {
      console.warn("[AuthCallback] State mismatch — saved:", savedState, "received:", stateParam);
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

        if (data?.session) {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          toast.success("Signed in with Microsoft 365!");
          navigate("/", { replace: true });
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
