import { Navigate, useLocation } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { authTrace } from "@/lib/auth-trace";

const MAX_LOADING_MS = 8000; // 8 seconds hard cap — never hang longer

// Maps URL path prefixes to the module name stored in subscriptions.enabled_modules.
// If a path prefix matches and the module is NOT in enabled_modules, access is denied.
// Paths not listed here are always accessible (dashboard, profile, etc.).
// Module names are compared case-insensitively because the DB stores them
// lowercase (e.g. "financial", "hrms") while older code referenced uppercase
// constants. Normalize on read so we never accidentally bounce a paid user
// to the activation page over a casing mismatch.
const MODULE_PATH_MAP: [string, string][] = [
  ["/financial", "financial"],
  ["/inventory", "inventory"],
  ["/manufacturing", "manufacturing"],
  ["/procurement", "procurement"],
  ["/sales", "sales"],
  ["/warehouse", "warehouse"],
  ["/hrms", "hrms"],
  ["/performance", "performance"],
  ["/connectors", "financial"], // Connectors are part of the financial suite
];

function isModuleAllowed(pathname: string, enabledModules: string[] | null): boolean {
  // null means no restriction (plan includes everything or not yet loaded)
  if (!enabledModules || enabledModules.length === 0) return true;
  const normalized = enabledModules.map((m) => m.toLowerCase());
  for (const [prefix, moduleName] of MODULE_PATH_MAP) {
    if (pathname.startsWith(prefix)) {
      return normalized.includes(moduleName);
    }
  }
  return true; // core pages (/, /profile, etc.) always allowed
}

/**
 * Centralized lifecycle guard. Wraps all protected routes.
 * - No subscription → /subscription/activate
 * - Expired → allows access in read-only mode
 * - Active but org not onboarded → /onboarding
 * - Module not in enabled_modules → /subscription/activate with module context
 * - Super admins bypass all guards
 * - Hard timeout prevents permanent spinner
 */
export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { needsActivation, onboardingRequired, loading, enabledModules } = useSubscription();
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

  // Trace every decision once per path/state change so the bounce path
  // (/x → /subscription/activate) leaves a breadcrumb trail in the console
  // and in window.__authTrace.
  const lastDecisionRef = useRef<string>("");
  const decide = (decision: string, extra?: Record<string, unknown>) => {
    const key = `${location.pathname}|${decision}|${loading}|${saLoading}|${timedOut}|${isSuperAdmin}|${needsActivation}|${onboardingRequired}|${(enabledModules ?? []).join(",")}`;
    if (lastDecisionRef.current !== key) {
      lastDecisionRef.current = key;
      authTrace("subscription", decision, {
        path: location.pathname,
        loading,
        saLoading,
        timedOut,
        isSuperAdmin: !!isSuperAdmin,
        needsActivation,
        onboardingRequired,
        enabledModules,
        ...extra,
      });
    }
  };

  if (isExempt) {
    decide("allow:exempt");
    return <>{children}</>;
  }

  // Super admins ALWAYS bypass — check first, even while still loading
  if (isSuperAdmin) {
    decide("allow:super_admin");
    return <>{children}</>;
  }

  // Still loading but haven't timed out yet — show spinner
  if ((loading || saLoading) && !timedOut) {
    decide("wait:loading");
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading workspace…</p>
        </div>
      </div>
    );
  }

  // If timed out, allow access rather than blocking
  if (timedOut) {
    decide("allow:timeout");
    console.warn("SubscriptionGuard: timed out after", MAX_LOADING_MS, "ms — allowing access");
    return <>{children}</>;
  }

  if (needsActivation) {
    decide("redirect:activate:needs_activation");
    return <Navigate to="/subscription/activate" replace />;
  }

  if (onboardingRequired) {
    decide("redirect:onboarding");
    return <Navigate to="/onboarding" replace />;
  }

  // Module-level gating: if this org's plan doesn't include the module for this path,
  // redirect to activation so they can upgrade. Only enforced once subscription is loaded.
  if (!loading && !isModuleAllowed(location.pathname, enabledModules)) {
    const required = MODULE_PATH_MAP.find(([p]) => location.pathname.startsWith(p))?.[1];
    decide("block:module_not_in_plan", {
      matchedPrefix: MODULE_PATH_MAP.find(([p]) => location.pathname.startsWith(p))?.[0],
      requiredModule: required,
    });
    // Do NOT silently redirect — show a clear, non-redirecting reason.
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Module not enabled</h2>
          <p className="text-sm text-muted-foreground">
            The <span className="font-medium text-foreground">{required ?? "requested"}</span> module is not part of your current plan
            ({(enabledModules ?? []).join(", ") || "no modules"}).
          </p>
          <p className="text-xs text-muted-foreground">
            Path: <code className="font-mono">{location.pathname}</code>
          </p>
          <a
            href="/subscription/activate"
            className="inline-block text-sm font-medium text-primary hover:underline"
          >
            Upgrade subscription →
          </a>
        </div>
      </div>
    );
  }

  decide("allow:ok");
  return <>{children}</>;
}
