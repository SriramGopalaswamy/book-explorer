import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authTrace, authTraceReset } from "@/lib/auth-trace";
import { useAuth } from "@/contexts/AuthContext";

const MS365_EXCHANGE_TIMEOUT_MS = 20_000;

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { adoptSession } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authTraceReset();
    const tStart = performance.now();
    authTrace("ms365", "callback_mount");

    const code = searchParams.get("code");
    const stateParam = searchParams.get("state");
    const savedState = sessionStorage.getItem("ms365_oauth_state");
    const errorParam = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");

    authTrace("ms365", "params_parsed", {
      hasCode: !!code,
      stateMatch: stateParam === savedState,
      hasSavedState: !!savedState,
      errorParam,
    });

    if (errorParam) {
      const msg = errorDesc || errorParam || "Authentication was denied";
      authTrace("ms365", "provider_error", { msg });
      setError(msg);
      toast.error(msg);
      setTimeout(() => navigate("/auth", { replace: true }), 3000);
      return;
    }

    if (!code) {
      authTrace("ms365", "missing_code");
      setError("No authorization code received");
      setTimeout(() => navigate("/auth", { replace: true }), 3000);
      return;
    }

    if (!savedState || stateParam !== savedState) {
      sessionStorage.removeItem("ms365_oauth_state");
      authTrace("ms365", "state_mismatch");
      const msg = "Authentication failed: invalid state parameter. Please try signing in again.";
      setError(msg);
      toast.error(msg);
      setTimeout(() => navigate("/auth", { replace: true }), 3000);
      return;
    }

    sessionStorage.removeItem("ms365_oauth_state");

    const exchangeCode = async () => {
      try {
        const tExchangeStart = performance.now();
        authTrace("ms365", "exchange_start");
        const { data, error: fnError } = await withTimeout(
          supabase.functions.invoke("ms365-auth", {
            body: {
              action: "exchange_code",
              code,
              redirect_uri: `${window.location.origin}/auth/callback`,
            },
          }),
          MS365_EXCHANGE_TIMEOUT_MS,
          "Microsoft 365 authentication",
        );
        authTrace("ms365", "exchange_complete", {
          elapsedMs: Math.round(performance.now() - tExchangeStart),
          hasSession: !!data?.session,
          pending: !!data?.pending,
          fnError: fnError?.message,
          dataError: data?.error,
          stage: data?.stage,
          requestId: data?.requestId,
        });

        if (fnError || data?.error) {
          const detail = data?.stage ? `${data.error || "Authentication failed"} (${data.stage})` : data?.error;
          const msg = detail || fnError?.message || "Authentication failed";
          authTrace("ms365", "exchange_failed", { msg, stage: data?.stage, requestId: data?.requestId });
          setError(msg);
          toast.error(msg);
          setTimeout(() => navigate("/auth", { replace: true }), 3000);
          return;
        }

        if (data?.session) {
          // Adopt the session synchronously: decode the JWT, populate
          // AuthContext state immediately, and commit to supabase-js
          // storage in the background. UI never blocks on the LockManager.
          adoptSession(data.session.access_token, data.session.refresh_token);
          authTrace("ms365", "session_adopted", {
            totalMs: Math.round(performance.now() - tStart),
          });
          toast.success("Signed in with Microsoft 365!");
          navigate("/", { replace: true });
        } else {
          authTrace("ms365", "no_session_returned");
          setError("No session returned");
          setTimeout(() => navigate("/auth", { replace: true }), 3000);
        }
      } catch (err) {
        authTrace("ms365", "exchange_exception", { msg: (err as Error)?.message });
        console.error("[AuthCallback] Error:", err);
        const msg = (err as Error)?.message || "An unexpected error occurred";
        setError(msg);
        toast.error(msg);
        setTimeout(() => navigate("/auth", { replace: true }), 3000);
      }
    };

    exchangeCode();
  }, [searchParams, navigate, adoptSession]);

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
