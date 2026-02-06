import { MainLayout } from "@/components/layout/MainLayout";
import { ModuleCard } from "@/components/dashboard/ModuleCard";
import { StatCard } from "@/components/dashboard/StatCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import {
  Wallet,
  Users,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  UserCheck,
} from "lucide-react";
import { RevenueChart } from "@/components/dashboard/RevenueChart";

export default function Dashboard() {
  return (
    <MainLayout
      title="Dashboard"
      subtitle="Welcome back! Here's an overview of your business."
    >
      <div className="space-y-6 animate-fade-in">
        {/* Key Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Revenue"
            value="₹45,23,000"
            change={{ value: "12.5%", type: "increase" }}
            icon={<DollarSign className="h-4 w-4" />}
          />
          <StatCard
            title="Active Employees"
            value="127"
            change={{ value: "3", type: "increase" }}
            icon={<UserCheck className="h-4 w-4" />}
          />
          <StatCard
            title="Pending Invoices"
            value="23"
            change={{ value: "5", type: "decrease" }}
            icon={<ArrowDownRight className="h-4 w-4" />}
          />
          <StatCard
            title="Goals Achieved"
            value="85%"
            change={{ value: "8%", type: "increase" }}
            icon={<ArrowUpRight className="h-4 w-4" />}
          />
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

        {/* Recent Activity & Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <RecentActivity />
          
          {/* Revenue Chart Placeholder */}
          <div className="rounded-xl border bg-card p-6 shadow-card">
            <h3 className="mb-4 text-lg font-semibold text-foreground">
              Revenue Trend
            </h3>
            <div className="flex h-64 items-center justify-center rounded-lg bg-secondary/50">
              <div className="text-center">
                <TrendingUp className="mx-auto mb-2 h-12 w-12 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  Revenue chart will appear here
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
