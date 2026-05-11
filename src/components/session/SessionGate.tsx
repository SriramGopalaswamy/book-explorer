import { ReactNode, useEffect, useState } from "react";
import { ShieldAlert, RefreshCw, LogOut, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessionContext } from "@/hooks/useSessionContext";
import { useAuth } from "@/contexts/AuthContext";

interface SessionGateProps {
  /** Page-friendly label shown in the loading line ("Employees", "Payroll", ...). */
  label?: string;
  /** Soft watchdog in ms — if the session context is still loading after this we surface a stuck-UI error. */
  watchdogMs?: number;
  /** Optional: page also requires an organization id (most authenticated screens do). */
  requireOrg?: boolean;
  children: ReactNode;
}

/**
 * Wraps a screen body so that:
 *  - while the session context is loading we render a skeleton (with a soft watchdog),
 *  - if the cached/fetched context is degraded (missing orgId/roles for a non-super-admin)
 *    we render a clear "session incomplete" panel with Retry + Sign out & back in actions
 *    instead of silently showing 0 rows or an endless spinner.
 *
 * Pages can still apply finer-grained gates (role checks, etc.) inside `children`.
 */
export function SessionGate({
  label = "this page",
  watchdogMs = 12_000,
  requireOrg = true,
  children,
}: SessionGateProps) {
  const { signOut, user } = useAuth();
  const { data, isLoading, isFetching, error, refetch } = useSessionContext();
  const [watchdogFired, setWatchdogFired] = useState(false);

  useEffect(() => {
    if (!isLoading && !isFetching) return;
    setWatchdogFired(false);
    const t = setTimeout(() => setWatchdogFired(true), watchdogMs);
    return () => clearTimeout(t);
  }, [isLoading, isFetching, watchdogMs]);

  // No user at all → let outer ProtectedRoute redirect; render nothing here.
  if (!user) return <>{children}</>;

  if (isLoading && !data) {
    return (
      <div className="space-y-4 p-6" data-testid="session-gate-loading">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Clock className="h-4 w-4 animate-spin" />
          Loading {label}…
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
        {watchdogFired && (
          <StuckPanel
            label={label}
            reason="The workspace is taking longer than expected to load."
            onRetry={() => {
              setWatchdogFired(false);
              refetch();
            }}
            onSignOut={signOut}
          />
        )}
      </div>
    );
  }

  if (error) {
    return (
      <StuckPanel
        label={label}
        reason={`Failed to load workspace context: ${(error as Error).message}`}
        onRetry={() => refetch()}
        onSignOut={signOut}
      />
    );
  }

  const isSuperAdmin = !!data?.isSuperAdmin;
  const orgId = data?.organizationId ?? null;
  const roles = data?.roles ?? [];
  const isDegraded = !isSuperAdmin && ((requireOrg && !orgId) || roles.length === 0);

  if (isDegraded) {
    const missing: string[] = [];
    if (requireOrg && !orgId) missing.push("organization");
    if (roles.length === 0) missing.push("roles");
    return (
      <StuckPanel
        label={label}
        reason={`Your session is missing ${missing.join(" and ")}. This usually clears with a quick re-authentication.`}
        onRetry={() => refetch()}
        onSignOut={signOut}
        showDiagnostics
        diagnostics={{ uid: user.id, orgId, roles, isSuperAdmin, isDegraded: true }}
      />
    );
  }

  return <>{children}</>;
}

interface StuckPanelProps {
  label: string;
  reason: string;
  onRetry: () => void;
  onSignOut: () => void;
  showDiagnostics?: boolean;
  diagnostics?: {
    uid: string | null;
    orgId: string | null;
    roles: string[];
    isSuperAdmin: boolean;
    isDegraded: boolean;
  };
}

function StuckPanel({ label, reason, onRetry, onSignOut, showDiagnostics, diagnostics }: StuckPanelProps) {
  return (
    <div
      data-testid="session-gate-stuck"
      className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-4"
    >
      <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
        <ShieldAlert className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Can't load {label}</h2>
        <p className="text-sm text-muted-foreground max-w-md">{reason}</p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
        <Button variant="default" onClick={onSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out & back in
        </Button>
      </div>
      {showDiagnostics && diagnostics && (
        <pre className="mt-4 text-xs text-left bg-muted/40 rounded-md p-3 max-w-md overflow-auto">
          {JSON.stringify(diagnostics, null, 2)}
        </pre>
      )}
    </div>
  );
}
