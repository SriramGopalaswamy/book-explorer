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

    if (!code) {
      setError("No authorization code received");
      return;
    }

    if (stateParam !== savedState) {
      setError("Invalid state parameter — possible CSRF attack");
      return;
    }

    sessionStorage.removeItem("ms365_oauth_state");

    const exchangeCode = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("ms365-auth", {
          body: {
            action: "exchange_code",
            code,
            redirect_uri: `${window.location.origin}/auth/callback`,
          },
        });

        if (fnError || data?.error) {
          setError(data?.error || fnError?.message || "Authentication failed");
          toast.error(data?.error || "Authentication failed");
          setTimeout(() => navigate("/auth"), 3000);
          return;
        }

        if (data?.session) {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          toast.success("Signed in with Microsoft 365!");
          navigate("/", { replace: true });
        }
      } catch (err) {
        setError("An unexpected error occurred");
        toast.error("An unexpected error occurred");
        setTimeout(() => navigate("/auth"), 3000);
      }
    };

    exchangeCode();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-dark">
      <div className="text-center space-y-4">
        {error ? (
          <div className="text-destructive">
            <p className="text-lg font-medium">{error}</p>
            <p className="text-sm text-muted-foreground mt-2">Redirecting to sign in...</p>
          </div>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Completing Microsoft 365 sign in...</p>
          </>
        )}
      </div>
    </div>
  );
}
