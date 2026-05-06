import { useState, useEffect } from "react";
import { useCurrentRole } from "@/hooks/useRoles";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { AccessDenied } from "./AccessDenied";
import { Loader2 } from "lucide-react";

interface HRAdminRouteProps {
  children: React.ReactNode;
}

const MAX_LOADING_MS = 8000;

/**
 * Route guard: Only Admin and HR roles can access.
 * Used for HRMS admin pages like Employees, Attendance management, Holidays, etc.
 */
export function HRAdminRoute({ children }: HRAdminRouteProps) {
  const { data: currentRole, isLoading } = useCurrentRole();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();

  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading && !saLoading) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      console.warn("HRAdminRoute: role lookup timed out after", MAX_LOADING_MS, "ms");
      setTimedOut(true);
    }, MAX_LOADING_MS);
    return () => clearTimeout(timer);
  }, [isLoading, saLoading]);

  if ((isLoading || saLoading) && !timedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isSuperAdmin) return <>{children}</>;

  if (currentRole !== "admin" && currentRole !== "hr") {
    return (
      <AccessDenied
        message="HR Administration Restricted"
        description="Only Admin and HR roles can access this section. Contact your administrator for access."
      />
    );
  }

  return <>{children}</>;
}
