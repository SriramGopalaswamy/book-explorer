import { useCurrentRole } from "@/hooks/useRoles";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { useSessionContext } from "@/hooks/useSessionContext";
import { AccessDenied } from "./AccessDenied";
import { Loader2 } from "lucide-react";

interface PayrollRouteProps {
  children: React.ReactNode;
}

const ALLOWED = ["admin", "hr", "finance", "payroll"];

/**
 * Route guard for Payroll — Admin, HR, Finance, Payroll, and super admins.
 *
 * Uses the consolidated `get_my_session_context` RPC so a single round trip
 * resolves super-admin status + roles. Falls back to the legacy hooks if the
 * RPC hasn't returned yet, but never denies access while still loading.
 */
export function PayrollRoute({ children }: PayrollRouteProps) {
  const { data: session, isLoading: sessionLoading } = useSessionContext();
  const { data: legacyRole, isLoading: roleLoading } = useCurrentRole();
  const { data: legacySuper, isLoading: saLoading } = useIsSuperAdmin();

  // Prefer authoritative RPC result; fall back to legacy hooks.
  const isSuperAdmin = session?.isSuperAdmin ?? legacySuper;
  const roles = session?.roles ?? (legacyRole ? [legacyRole] : []);
  const hasAccess = roles.some((r) => ALLOWED.includes(r));

  const stillLoading =
    sessionLoading && roleLoading && saLoading;

  if (stillLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isSuperAdmin || hasAccess) return <>{children}</>;

  return (
    <AccessDenied
      message="Payroll Access Restricted"
      description="Only Admin, HR, Finance, and Payroll roles can access Payroll. Contact your administrator for access."
    />
  );
}
