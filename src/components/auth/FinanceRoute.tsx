import { useState, useEffect } from "react";
import { useCurrentRole } from "@/hooks/useRoles";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import { AccessDenied } from "./AccessDenied";
import { Loader2 } from "lucide-react";

interface FinanceRouteProps {
  children: React.ReactNode;
}

const MAX_LOADING_MS = 8000;

export function FinanceRoute({ children }: FinanceRouteProps) {
  const { data: currentRole, isLoading } = useCurrentRole();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();

  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading && !saLoading) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      console.warn("FinanceRoute: role lookup timed out after", MAX_LOADING_MS, "ms");
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
