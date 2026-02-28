import { Navigate, useLocation } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { Loader2 } from "lucide-react";

/**
 * Centralized lifecycle guard. Wraps all protected routes.
 * - No subscription → /subscription/activate
 * - Expired → allows access in read-only mode
 * - Active but org not onboarded → /onboarding
 * - Super admins bypass all guards
 */
export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { needsActivation, onboardingRequired, loading } = useSubscription();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();
  const location = useLocation();

  // Exempt routes that should never be guarded
  const exemptPaths = [
    "/subscription/activate",
    "/onboarding",
    "/auth",
    "/auth/callback",
    "/reset-password",
    "/profile",
    "/settings",
  ];
  const isExempt =
    exemptPaths.some((p) => location.pathname.startsWith(p)) ||
    location.pathname.startsWith("/platform");

  if (isExempt) return <>{children}</>;

  if (loading || saLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying subscription…</p>
        </div>
      </div>
    );
  }

  // Super admins bypass subscription enforcement
  if (isSuperAdmin) return <>{children}</>;

  if (needsActivation) {
    return <Navigate to="/subscription/activate" replace />;
  }

  if (onboardingRequired) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
