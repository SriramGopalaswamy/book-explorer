import { useCurrentRole } from "@/hooks/useRoles";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { AccessDenied } from "./AccessDenied";
import { Loader2 } from "lucide-react";

interface PayrollRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard for Payroll page — allows Admin, HR, Finance, and Payroll roles.
 * HR generates & submits for review; Finance/Payroll approves & locks.
 */
export function PayrollRoute({ children }: PayrollRouteProps) {
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

  if (!["admin", "hr", "finance", "payroll"].includes(currentRole || "")) {
    return (
      <AccessDenied
        message="Payroll Access Restricted"
        description="Only Admin, HR, Finance, and Payroll roles can access Payroll. Contact your administrator for access."
      />
    );
  }

  return <>{children}</>;
}
