import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Dashboard from "./Dashboard";
import { useCurrentRole } from "@/hooks/useRoles";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { useUserOrganization } from "@/hooks/useUserOrganization";

const Index = () => {
  const { data: isSuperAdmin, isLoading: superAdminLoading, isFetching: superAdminFetching } = useIsSuperAdmin();
  const { data: orgData, isLoading: orgLoading, isFetching: orgFetching } = useUserOrganization();
  const { data: currentRole, isLoading: roleLoading, isFetching: roleFetching } = useCurrentRole();

  // Safety timeout: if guard chain hangs >10s, render Dashboard rather than spin forever
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 10_000);
    return () => clearTimeout(t);
  }, []);

  if (isSuperAdmin) return <Navigate to="/platform" replace />;

  const waitingOnSuperAdmin =
    superAdminLoading || (superAdminFetching && isSuperAdmin === undefined);
  const waitingOnOrganization =
    orgLoading || (orgFetching && orgData === undefined);
  const waitingOnRole =
    !!orgData?.organizationId && (roleLoading || (roleFetching && currentRole === undefined));

  if (waitingOnSuperAdmin || waitingOnOrganization || waitingOnRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  // Organization explicitly missing — let the normal activation flow handle it.
  if (orgData === null) return <Navigate to="/subscription/activate" replace />;

  if (currentRole === "employee") return <Navigate to="/hrms/my-attendance" replace />;
  if (currentRole === "hr") return <Navigate to="/hrms/employees" replace />;
  if (currentRole === "manager") return <Navigate to="/hrms/inbox" replace />;
  if (currentRole === "finance") return <Navigate to="/financial/accounting" replace />;

  // admin (and any temporarily unknown role) → Dashboard
  return <Dashboard />;
};

export default Index;
