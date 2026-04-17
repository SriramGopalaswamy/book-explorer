import { Navigate, useLocation } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

const MAX_LOADING_MS = 8000; // 8 seconds hard cap — never hang longer

/**
 * Centralized lifecycle guard. Wraps all protected routes.
 * - No subscription → /subscription/activate
 * - Expired → allows access in read-only mode
 * - Active but org not onboarded → /onboarding
 * - Super admins bypass all guards
 * - Hard timeout prevents permanent spinner
 */
export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { needsActivation, onboardingRequired, loading } = useSubscription();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();
  const location = useLocation();

  // Hard timeout to prevent permanent spinner
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!loading && !saLoading) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), MAX_LOADING_MS);
    return () => clearTimeout(timer);
  }, [loading, saLoading]);

  // Exempt routes that should never be guarded
  const exemptPaths = [
    "/subscription/activate",
    "/onboarding",
    "/auth",
    "/auth/callback",
    "/reset-password",
    "/profile",
    "/settings",
    "/admin",   // Admin tools must remain accessible regardless of subscription state;
                // AdminRoute still enforces the role check on each /admin/* page.
  ];
  const isExempt =
    exemptPaths.some((p) => location.pathname.startsWith(p)) ||
    location.pathname.startsWith("/platform");

  if (isExempt) return <>{children}</>;

  // Super admins ALWAYS bypass — check first, even while still loading
  if (isSuperAdmin) return <>{children}</>;

  // Still loading but haven't timed out yet — show spinner
  if ((loading || saLoading) && !timedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying subscription…</p>
        </div>
      </div>
    );
  }

  // If timed out, allow access rather than blocking
  if (timedOut) {
    console.warn("SubscriptionGuard: timed out after", MAX_LOADING_MS, "ms — allowing access");
    return <>{children}</>;
  }

  if (needsActivation) {
    return <Navigate to="/subscription/activate" replace />;
  }

  if (onboardingRequired) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
