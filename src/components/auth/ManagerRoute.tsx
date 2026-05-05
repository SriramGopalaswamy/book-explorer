import { useCurrentRole } from "@/hooks/useRoles";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { AccessDenied } from "./AccessDenied";
import { Loader2 } from "lucide-react";

interface ManagerRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard: Only Manager, Admin, and HR roles can access.
 * Used for Manager Inbox and similar manager-level pages.
 */
export function ManagerRoute({ children }: ManagerRouteProps) {
  const { data: currentRole, isLoading } = useCurrentRole();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();

  if (isLoading || saLoading) {
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
