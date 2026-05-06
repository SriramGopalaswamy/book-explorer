import { useState, useEffect } from "react";
import { useCurrentRole } from "@/hooks/useRoles";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { AccessDenied } from "./AccessDenied";
import { Loader2 } from "lucide-react";

interface PayrollRouteProps {
  children: React.ReactNode;
}

const MAX_LOADING_MS = 8000;

/**
 * Route guard for Payroll page — allows Admin, HR, Finance, and Payroll roles.
 * HR generates & submits for review; Finance/Payroll approves & locks.
 *
 * Mirrors SubscriptionGuard's hard-timeout pattern: after MAX_LOADING_MS,
 * stop showing the spinner and proceed with whatever data is available
 * (typically null role → AccessDenied). Prevents permanent spinner when
 * the underlying user_roles / platform_roles queries hang.
 */
export function PayrollRoute({ children }: PayrollRouteProps) {
  const { data: currentRole, isLoading } = useCurrentRole();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();

  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading && !saLoading) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      console.warn("PayrollRoute: role lookup timed out after", MAX_LOADING_MS, "ms");
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
