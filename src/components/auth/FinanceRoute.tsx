import { useCurrentRole } from "@/hooks/useRoles";
import { AccessDenied } from "./AccessDenied";
import { Loader2 } from "lucide-react";

interface FinanceRouteProps {
  children: React.ReactNode;
}

export function FinanceRoute({ children }: FinanceRouteProps) {
  const { data: currentRole, isLoading } = useCurrentRole();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Only admin and finance roles can access financial suite
  if (currentRole !== "admin" && currentRole !== "finance") {
    return (
      <AccessDenied
        message="Financial Suite Restricted"
        description="Only Admin and Finance roles can access the Financial Suite. Contact your administrator for access."
      />
    );
  }

  return <>{children}</>;
}
