import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Dashboard from "./Dashboard";
import { useCurrentRole } from "@/hooks/useRoles";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { DEV_MODE } from "@/config/systemFlags";

const Index = () => {
  const { user } = useAuth();
  const { data: currentRole, isLoading: roleLoading, error: roleError } = useCurrentRole();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  // Debug logging
  console.log("[Index] User:", user?.email, "ID:", user?.id);
  console.log("[Index] isSuperAdmin:", isSuperAdmin, "saLoading:", saLoading);
  console.log("[Index] currentRole:", currentRole, "roleLoading:", roleLoading);
  console.log("[Index] roleError:", roleError);

  // Timeout mechanism - if loading takes more than 5 seconds, assume not super admin and continue
  useEffect(() => {
    if (saLoading || roleLoading) {
      const timer = setTimeout(() => {
        console.warn("[Index] Loading timeout - proceeding with default behavior");
        setLoadingTimeout(true);
      }, 5000); // 5 second timeout

      return () => clearTimeout(timer);
    }
  }, [saLoading, roleLoading]);

  // DEV_MODE bypass - skip all loading checks
  if (DEV_MODE && !saLoading && !roleLoading) {
    console.log("[Index] DEV_MODE - showing Dashboard");
    return <Dashboard />;
  }

  // Show loader while checking super admin status (priority check)
  if (saLoading && !loadingTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your workspace…</p>
          <p className="text-xs text-muted-foreground/50">Checking permissions...</p>
        </div>
      </div>
    );
  }

  // Super admins → Dashboard immediately (don't wait for role query, they're not in user_roles table)
  if (isSuperAdmin === true) {
    console.log("[Index] Super admin, showing Dashboard with Platform sidebar");
    return <Dashboard />;
  }

  // For regular users, wait for role query to complete
  if (roleLoading && !loadingTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your workspace…</p>
          <p className="text-xs text-muted-foreground/50">Loading roles...</p>
        </div>
      </div>
    );
  }

  // Role-based routing for regular users
  if (currentRole === "employee") return <Navigate to="/hrms/my-attendance" replace />;
  if (currentRole === "hr") return <Navigate to="/hrms/employees" replace />;
  if (currentRole === "manager") return <Navigate to="/hrms/inbox" replace />;
  if (currentRole === "finance") return <Navigate to="/financial/accounting" replace />;

  // admin (default) → Dashboard
  console.log("[Index] Showing Dashboard for role:", currentRole);
  return <Dashboard />;
};

export default Index;
