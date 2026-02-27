import { Navigate } from "react-router-dom";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { Loader2, ShieldAlert } from "lucide-react";

interface PlatformRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard that only allows super_admin users.
 * Validated server-side via platform_roles table + RLS.
 */
export function PlatformRoute({ children }: PlatformRouteProps) {
  const { data: isSuperAdmin, isLoading, isPending, isFetching } = useIsSuperAdmin();

  // Show loader while query is in any unstable state (initial load, re-auth cycles, etc.)
  if (isLoading || (isPending && !isFetching === false) || isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verifying platform access…</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 text-center max-w-md">
          <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground mb-2">Platform Access Denied</h2>
            <p className="text-muted-foreground text-sm">
              This area is restricted to platform administrators only.
              If you believe this is an error, contact your system administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
