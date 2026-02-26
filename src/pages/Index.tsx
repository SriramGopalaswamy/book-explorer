import { Navigate } from "react-router-dom";
import Dashboard from "./Dashboard";
import { useCurrentRole } from "@/hooks/useRoles";

const Index = () => {
  const { data: currentRole, isLoading, isFetching, isPending } = useCurrentRole();

  // While role is resolving, render nothing to avoid a flash of skeleton/loading UI
  if (isLoading || isPending || (isFetching && currentRole === undefined)) {
    return null;
  }

  if (currentRole === "employee") return <Navigate to="/hrms/my-attendance" replace />;
  if (currentRole === "hr") return <Navigate to="/hrms/employees" replace />;
  if (currentRole === "manager") return <Navigate to="/hrms/inbox" replace />;
  if (currentRole === "finance") return <Navigate to="/financial/accounting" replace />;

  // admin (and any unknown role) → Dashboard
  return <Dashboard />;
};

export default Index;
