import { useState, useEffect } from "react";
import { useCurrentRole } from "@/hooks/useRoles";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { AccessDenied } from "./AccessDenied";
import { Loader2 } from "lucide-react";

interface ManagerRouteProps {
  children: React.ReactNode;
}

const MAX_LOADING_MS = 8000;

/**
 * Route guard: Only Manager, Admin, and HR roles can access.
 * Used for Manager Inbox and similar manager-level pages.
 */
export function ManagerRoute({ children }: ManagerRouteProps) {
  const { data: currentRole, isLoading } = useCurrentRole();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();

  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading && !saLoading) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      console.warn("ManagerRoute: role lookup timed out after", MAX_LOADING_MS, "ms");
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

  if (currentRole !== "admin" && currentRole !== "hr" && currentRole !== "manager") {
    return (
      <AccessDenied
        message="Manager Access Required"
        description="Only Managers, Admins, and HR can access this section."
      />
    );
  }

  return <>{children}</>;
}
