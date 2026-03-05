import { Navigate, useLocation } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { DEV_MODE } from "@/config/systemFlags";

/**
 * Centralized lifecycle guard. Wraps all protected routes.
 * - No subscription → /subscription/activate
 * - Expired → allows access in read-only mode
 * - Active but org not onboarded → /onboarding
 * - Super admins bypass all guards
 */
export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
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

  // If user is not authenticated, let ProtectedRoute handle redirect to /auth
  // Don't check subscription if no user
  if (!user) {
    return <>{children}</>;
  }

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
  console.log("[SubscriptionGuard] Super admin check:", { isSuperAdmin, saLoading, user: user?.id, DEV_MODE });
  if (isSuperAdmin) {
    console.log("[SubscriptionGuard] User is super_admin, bypassing subscription check");
    return <>{children}</>;
  }

  // DEV_MODE bypass for development and testing
  if (DEV_MODE) {
    console.log("[SubscriptionGuard] DEV_MODE enabled, bypassing subscription check");
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
