import { useCurrentRole } from "@/hooks/useRoles";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { AccessDenied } from "./AccessDenied";
import { Loader2 } from "lucide-react";

interface AdminRouteProps {
  children: React.ReactNode;
}

// Route guard for pages that are strictly admin-only (Settings, Audit Log, Approvals, MCP Tools).
// Uses org-scoped useCurrentRole() — cross-org admin roles do NOT grant access.
export function AdminRoute({ children }: AdminRouteProps) {
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

  if (currentRole !== "admin") {
    return (
      <AccessDenied
        message="Admin Access Required"
        description="This section is restricted to administrators only. Contact your administrator for access."
      />
    );
  }

  return <>{children}</>;
}
