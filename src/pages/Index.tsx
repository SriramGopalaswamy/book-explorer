import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Dashboard from "./Dashboard";
import { MainLayout } from "@/components/layout/MainLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentRole } from "@/hooks/useRoles";

const Index = () => {
  const { data: currentRole, isLoading, isFetching, isPending } = useCurrentRole();

  // Show a skeleton that matches the Dashboard layout while role resolves
  if (isLoading || isPending || (isFetching && currentRole === undefined)) {
    return (
      <MainLayout title="Dashboard" subtitle="Loading your workspace...">
        <div className="space-y-8">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        </div>
      </MainLayout>
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
