import { useState } from "react";
import { DateRange } from "react-day-picker";
import { subMonths } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { ModuleCard } from "@/components/dashboard/ModuleCard";
import { StatCard } from "@/components/dashboard/StatCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { ExpenseBreakdownChart } from "@/components/dashboard/ExpenseBreakdownChart";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { useDashboardStats, formatIndianCurrency } from "@/hooks/useDashboardStats";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wallet,
  Users,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  UserCheck,
  FileText,
} from "lucide-react";

export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 6),
    to: new Date(),
  });

  const { data: stats, isLoading: statsLoading } = useDashboardStats();

  const filterRange = dateRange?.from && dateRange?.to
    ? { from: dateRange.from, to: dateRange.to }
    : undefined;

  return (
    <MainLayout
      title="Dashboard"
      subtitle="Welcome back! Here's an overview of your business."
    >
      <div className="space-y-6 animate-fade-in">
        {/* Key Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statsLoading ? (
            <>
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </>
          ) : (
            <>
              <StatCard
                title="Total Revenue"
                value={formatIndianCurrency(stats?.totalRevenue || 0)}
                change={{
                  value: `${Math.abs(stats?.revenueChange || 0)}%`,
                  type: (stats?.revenueChange || 0) >= 0 ? "increase" : "decrease",
                }}
                icon={<DollarSign className="h-4 w-4" />}
              />
              <StatCard
                title="Active Employees"
                value={String(stats?.activeEmployees || 0)}
                change={{
                  value: String(Math.abs(stats?.employeeChange || 0)),
                  type: (stats?.employeeChange || 0) >= 0 ? "increase" : "decrease",
                }}
                icon={<UserCheck className="h-4 w-4" />}
              />
              <StatCard
                title="Pending Invoices"
                value={String(stats?.pendingInvoices || 0)}
                change={{
                  value: String(Math.abs(stats?.invoiceChange || 0)),
                  type: (stats?.invoiceChange || 0) <= 0 ? "decrease" : "increase",
                }}
                icon={<FileText className="h-4 w-4" />}
              />
              <StatCard
                title="Goals Progress"
                value={`${stats?.goalsAchieved || 0}%`}
                change={{
                  value: `${Math.abs(stats?.goalsChange || 0)}%`,
                  type: (stats?.goalsChange || 0) >= 0 ? "increase" : "decrease",
                }}
                icon={<Target className="h-4 w-4" />}
              />
            </>
          )}
        </div>

        {/* Quick Actions */}
        <QuickActions />

        {/* Module Cards */}
        <div className="grid gap-6 lg:grid-cols-3">
          <ModuleCard
            title="Financial Suite"
            description="Manage accounting, invoicing, and banking operations"
            icon={<Wallet className="h-6 w-6" />}
            variant="financial"
            linkTo="/financial/accounting"
            stats={[
              { label: "Open Invoices", value: "₹12.5L" },
              { label: "Cash Balance", value: "₹8.2L" },
            ]}
          />
          <ModuleCard
            title="HRMS"
            description="Employee management, attendance, and payroll"
            icon={<Users className="h-6 w-6" />}
            variant="hrms"
            linkTo="/hrms/employees"
            stats={[
              { label: "Total Employees", value: "127" },
              { label: "On Leave Today", value: "8" },
            ]}
          />
          <ModuleCard
            title="Performance OS"
            description="Goals tracking and performance memos"
            icon={<Target className="h-6 w-6" />}
            variant="performance"
            linkTo="/performance/goals"
            stats={[
              { label: "Active Goals", value: "42" },
              { label: "Completion Rate", value: "85%" },
            ]}
          />
        </div>

        {/* Date Range Filter */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Financial Overview</h2>
          <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />
        </div>

        {/* Recent Activity & Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <RecentActivity />
          <RevenueChart dateRange={filterRange} />
        </div>

        {/* Expense Chart */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ExpenseBreakdownChart dateRange={filterRange} />
        </div>
      </div>
    </MainLayout>
  );
}
