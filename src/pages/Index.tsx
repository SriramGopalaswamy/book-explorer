import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Dashboard from "./Dashboard";
import { useCurrentRole } from "@/hooks/useRoles";

const Index = () => {
  const { data: currentRole, isLoading, isFetching, isPending } = useCurrentRole();

  // Show a subtle branded loader while role resolves instead of a blank screen
  if (isLoading || isPending || (isFetching && currentRole === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (currentRole === "employee") return <Navigate to="/hrms/my-attendance" replace />;
  if (currentRole === "hr") return <Navigate to="/hrms/employees" replace />;
  if (currentRole === "manager") return <Navigate to="/hrms/inbox" replace />;
  if (currentRole === "finance") return <Navigate to="/financial/accounting" replace />;

  // admin (and any unknown role) → Dashboard
  return <Dashboard />;
};

export default Index;
