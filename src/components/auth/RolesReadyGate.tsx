import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, RefreshCw, LogOut } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSessionContext } from "@/hooks/useSessionContext";
import { useAuth } from "@/contexts/AuthContext";
import { authTrace } from "@/lib/auth-trace";

/**
 * Paths whose data is strictly tenant + role gated. We refuse to render the
 * page until the session-context bootstrap has produced at least one role
 * (or super-admin). This prevents the historical bug where /hrms/* and
 * /financial/* rendered with an empty roles array right after login,
 * showing "0 rows" or bouncing to /subscription/activate.
 */
const ROLE_GATED_PREFIXES = [
  "/hrms",
  "/financial",
  "/inventory",
  "/manufacturing",
  "/procurement",
  "/sales",
  "/warehouse",
  "/performance",
];

const HARD_TIMEOUT_MS = 10_000;

function isRoleGated(pathname: string) {
  return ROLE_GATED_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Wraps protected module routes. Requires that the session context has
 * resolved with a real org + role set (or super-admin flag) before
 * mounting children. While waiting, shows a spinner; on hard timeout,
 * surfaces a stuck-session panel with Retry / Sign out actions.
 */
export function RolesReadyGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { data, isLoading, isFetching, refetch } = useSessionContext();
  const [timedOut, setTimedOut] = useState(false);

  const gated = isRoleGated(location.pathname);
  const isSuperAdmin = !!data?.isSuperAdmin;
  const orgId = data?.organizationId ?? null;
  const roles = data?.roles ?? [];
  const ready = isSuperAdmin || (!!orgId && roles.length > 0);

  useEffect(() => {
    if (!gated || ready) {
      setTimedOut(false);
      return;
    }
    const t = setTimeout(() => setTimedOut(true), HARD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [gated, ready]);

  // No user → outer ProtectedRoute will handle redirect.
  if (!user) return <>{children}</>;
  if (!gated) return <>{children}</>;
  if (ready) return <>{children}</>;

  if (timedOut) {
    authTrace("roles-ready-gate", "stuck", {
      path: location.pathname,
      orgId,
      roles,
      isSuperAdmin,
    });
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Workspace not ready</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your roles haven't loaded yet. This usually clears with a quick
              retry or re-authentication.
            </p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => { setTimedOut(false); refetch(); }}>
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
            <Button onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
          <pre className="text-xs text-left bg-muted/40 rounded-md p-3 overflow-auto">
{JSON.stringify({ uid: user.id, orgId, roles, isSuperAdmin }, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  authTrace("roles-ready-gate", "waiting", {
    path: location.pathname,
    loading: isLoading,
    fetching: isFetching,
    orgId,
    rolesCount: roles.length,
  });

  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading your workspace…</p>
      </div>
    </div>
  );
}
