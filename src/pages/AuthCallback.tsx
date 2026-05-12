import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authTrace, authTraceReset } from "@/lib/auth-trace";

const MS365_EXCHANGE_TIMEOUT_MS = 20_000;
const SESSION_COMMIT_TIMEOUT_MS = 2_500;

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function commitSessionWithoutBlocking(accessToken: string, refreshToken: string) {
  const commit = supabase.auth
    .setSession({ access_token: accessToken, refresh_token: refreshToken })
    .then((result) => ({ ...result, timedOut: false }))
    .catch((error) => ({ data: null, error, timedOut: false }));

  const result = await Promise.race([
    commit,
    new Promise<{ data: null; error: null; timedOut: true }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: null, timedOut: true }), SESSION_COMMIT_TIMEOUT_MS),
    ),
  ]);

  if (result.timedOut) {
    commit.then((late) => {
      authTrace("ms365", late.error ? "set_session_late_error" : "set_session_late_complete", {
        msg: late.error?.message,
      });
    });
  }

  return result;
}

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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

        if (data?.pending) {
          authTrace("ms365", "navigate_pending_approval", {
            totalMs: Math.round(performance.now() - tStart),
          });
          navigate("/pending-approval", { replace: true });
          return;
        }

        if (data?.session) {
          const tSetStart = performance.now();
          const sessionCommit = await commitSessionWithoutBlocking(
            data.session.access_token,
            data.session.refresh_token,
          );
          authTrace("ms365", "set_session_complete", {
            elapsedMs: Math.round(performance.now() - tSetStart),
            timedOut: sessionCommit.timedOut,
            error: sessionCommit.error?.message,
          });

          if (sessionCommit.error) {
            setError("Failed to create session");
            toast.error("Failed to create session");
            setTimeout(() => navigate("/auth", { replace: true }), 3000);
            return;
          }

          // Defensive: if setSession timed out, supabase-js may not have
          // synchronously fired SIGNED_IN. Poll briefly for the auth state
          // to materialise before navigating, otherwise / will bounce back
          // to /auth because AuthContext.user is still null.
          if (sessionCommit.timedOut) {
            for (let i = 0; i < 20; i++) {
              const { data: probe } = await supabase.auth.getSession();
              if (probe.session?.user?.id) break;
              await new Promise((r) => setTimeout(r, 100));
            }
          }

          toast.success("Signed in with Microsoft 365!");
          authTrace("ms365", "navigate_home", {
            totalMs: Math.round(performance.now() - tStart),
          });
          navigate("/", { replace: true });
        } else {
          authTrace("ms365", "no_session_returned");
          setError("No session returned");
          setTimeout(() => navigate("/auth", { replace: true }), 3000);
        }
      } catch (err) {
        authTrace("ms365", "exchange_exception", {
          msg: (err as Error)?.message,
        });
        console.error("[AuthCallback] Error:", err);
        const msg = (err as Error)?.message || "An unexpected error occurred";
        setError(msg);
        toast.error(msg);
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
