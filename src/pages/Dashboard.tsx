import { useState } from "react";
import { DateRange } from "react-day-picker";
import { subMonths } from "date-fns";
import { useDevMode } from "@/contexts/DevModeContext";
import { useAppMode } from "@/contexts/AppModeContext";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import { motion } from "framer-motion";
import { MainLayout } from "@/components/layout/MainLayout";
import { WelcomeHero } from "@/components/dashboard/WelcomeHero";
import { StatCardEnhanced } from "@/components/dashboard/StatCardEnhanced";
import { ModuleCardEnhanced } from "@/components/dashboard/ModuleCardEnhanced";
import { QuickActionsEnhanced } from "@/components/dashboard/QuickActionsEnhanced";
import { RecentActivityEnhanced } from "@/components/dashboard/RecentActivityEnhanced";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { ExpenseBreakdownChart } from "@/components/dashboard/ExpenseBreakdownChart";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { useDashboardStats, formatIndianCurrency } from "@/hooks/useDashboardStats";
import { useSparklineData } from "@/hooks/useSparklineData";
import { useEmployeeStats } from "@/hooks/useEmployees";
import { Skeleton } from "@/components/ui/skeleton";
import { FloatingOrbs } from "@/components/ui/floating-orbs";
import { ManagerTeamSection } from "@/components/dashboard/ManagerTeamSection";
import { FinancialIntegrityBadge } from "@/components/dashboard/FinancialIntegrityBadge";
import { AIInsightsWidget } from "@/components/ai/AIInsightsWidget";

import {
  Wallet,
  Users,
  Target,
  DollarSign,
  TrendingDown,
  UserCheck,
  FileText,
  TrendingUp,
  Activity,
} from "lucide-react";

export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 6),
    to: new Date(),
  });

  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: sparklines } = useSparklineData();
  const employeeStats = useEmployeeStats();
  const { canShowDevTools } = useAppMode();
  const { activeRole, currentRoleInfo, isImpersonating } = useDevMode();

  // Only pass a complete range (both from + to) to charts — never undefined mid-selection
  const filterRange = dateRange?.from && dateRange?.to
    ? { from: dateRange.from, to: dateRange.to }
    : { from: subMonths(new Date(), 6), to: new Date() };

  return (
    <MainLayout
      title="Dashboard"
      subtitle="Welcome back! Here's an overview of your business."
    >
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <FloatingOrbs className="opacity-30" />
      </div>

      <div className="relative z-10 space-y-8">
        {/* Role Preview Indicator */}
        {canShowDevTools && activeRole && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-xl border border-purple-500/30 bg-purple-500/10 backdrop-blur-sm px-4 py-3"
          >
            <Shield className="h-4 w-4 text-purple-400" />
            <span className="text-sm text-purple-300">Viewing as</span>
            <Badge className="bg-purple-600 text-purple-50 hover:bg-purple-600 uppercase text-xs font-bold tracking-wider">
              {activeRole}
            </Badge>
            {isImpersonating && currentRoleInfo?.user.actualRole && (
              <span className="text-xs text-muted-foreground ml-auto">
                Actual: {currentRoleInfo.user.actualRole}
              </span>
            )}
          </motion.div>
        )}

        {/* Welcome Hero */}
        <WelcomeHero />

        {/* Financial Integrity Status */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Financial Integrity Status</h3>
          <FinancialIntegrityBadge showDetails={true} />
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 items-stretch">
          {statsLoading ? (
            <>
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
            </>
          ) : (
            <>
              <StatCardEnhanced
                title="Total Revenue (This Month)"
                value={stats?.totalRevenue || 0}
                prefix="₹"
                change={{
                  value: `${Math.abs(stats?.revenueChange || 0)}%`,
                  type: (stats?.revenueChange || 0) >= 0 ? "increase" : "decrease",
                }}
                icon={<DollarSign className="h-5 w-5" />}
                glowColor="primary"
                index={0}
                sparklineData={sparklines?.revenue}
                sparklineColor="primary"
              />
              <StatCardEnhanced
                title="Total Expenses (This Month)"
                value={stats?.totalExpenses || 0}
                prefix="₹"
                change={{
                  value: `${Math.abs(stats?.expenseChange || 0)}%`,
                  type: (stats?.expenseChange || 0) >= 0 ? "increase" : "decrease",
                }}
                icon={<TrendingDown className="h-5 w-5" />}
                glowColor="info"
                index={1}
                sparklineData={sparklines?.expenses}
                sparklineColor="destructive"
              />
              <StatCardEnhanced
                title="Net Income (This Month)"
                value={Math.abs(stats?.netIncome || 0)}
                prefix={(stats?.netIncome || 0) < 0 ? "-₹" : "₹"}
                change={{
                  value: (stats?.netIncome || 0) >= 0 ? "Profit" : "Loss",
                  type: (stats?.netIncome || 0) >= 0 ? "increase" : "decrease",
                }}
                icon={<Activity className="h-5 w-5" />}
                glowColor={(stats?.netIncome || 0) >= 0 ? "success" : "info"}
                index={2}
                sparklineData={sparklines?.netIncome}
                sparklineColor={(stats?.netIncome || 0) >= 0 ? "success" : "destructive"}
              />
              <StatCardEnhanced
                title="Active Employees"
                value={stats?.activeEmployees || 0}
                change={{
                  value: String(Math.abs(stats?.employeeChange || 0)),
                  type: (stats?.employeeChange || 0) >= 0 ? "increase" : "decrease",
                }}
                icon={<UserCheck className="h-5 w-5" />}
                glowColor="hrms"
                index={3}
              />
              <StatCardEnhanced
                title="Pending Invoices"
                value={stats?.pendingInvoices || 0}
                change={{
                  value: String(Math.abs(stats?.invoiceChange || 0)),
                  type: (stats?.invoiceChange || 0) <= 0 ? "decrease" : "increase",
                }}
                icon={<FileText className="h-5 w-5" />}
                glowColor="info"
                index={4}
              />
              <StatCardEnhanced
                title="Goals Progress"
                value={stats?.goalsAchieved || 0}
                suffix="%"
                change={{
                  value: `${Math.abs(stats?.goalsChange || 0)}%`,
                  type: (stats?.goalsChange || 0) >= 0 ? "increase" : "decrease",
                }}
                icon={<Target className="h-5 w-5" />}
                glowColor="success"
                index={5}
              />
            </>
          )}
        </div>

        {/* Manager Team Section */}
        <ManagerTeamSection />

        {/* AI Insights */}
        <AIInsightsWidget module="dashboard" />

        {/* Quick Actions */}
        <QuickActionsEnhanced />

        {/* Module Cards */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Business Modules</h3>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <ModuleCardEnhanced
              title="Financial Suite"
              description="Manage accounting, invoicing, and banking operations with real-time insights"
              icon={<Wallet className="h-6 w-6" />}
              variant="financial"
              linkTo="/financial/accounting"
              stats={[
                { label: "Revenue", value: formatIndianCurrency(stats?.totalRevenue || 0), numericValue: stats?.totalRevenue || 0 },
                { label: "Pending Invoices", value: String(stats?.pendingInvoices || 0), numericValue: stats?.pendingInvoices || 0 },
              ]}
              index={0}
            />
            <ModuleCardEnhanced
              title="HRMS"
              description="Employee management, attendance tracking, and automated payroll"
              icon={<Users className="h-6 w-6" />}
              variant="hrms"
              linkTo="/hrms/employees"
              stats={[
                { label: "Total Employees", value: String(employeeStats.total), numericValue: employeeStats.total },
                { label: "On Leave", value: String(employeeStats.onLeave), numericValue: employeeStats.onLeave },
              ]}
              index={1}
            />
            <ModuleCardEnhanced
              title="Performance OS"
              description="Goals tracking, OKRs, and performance memos for your team"
              icon={<Target className="h-6 w-6" />}
              variant="performance"
              linkTo="/performance/goals"
              stats={[
                { label: "Goals Progress", value: `${stats?.goalsAchieved || 0}%`, numericValue: stats?.goalsAchieved || 0 },
                { label: "Active Employees", value: String(employeeStats.active), numericValue: employeeStats.active },
              ]}
              index={2}
            />
          </div>
        </motion.div>

        {/* Date Range Filter */}
        <motion.div
          className="flex items-center justify-between"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <div className="flex items-center gap-2">
            <motion.div
              className="h-3 w-3 rounded-full bg-gradient-to-r from-primary to-hrms"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <h2 className="text-lg font-bold text-foreground">Financial Overview</h2>
          </div>
          <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />
        </motion.div>

        {/* Charts Grid */}
        <motion.div
          className="grid gap-6 lg:grid-cols-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <RecentActivityEnhanced />
          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm p-6 shadow-lg">
            <RevenueChart dateRange={filterRange} />
          </div>
        </motion.div>

        {/* Expense Chart */}
        <motion.div
          className="grid gap-6 lg:grid-cols-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm p-6 shadow-lg">
            <ExpenseBreakdownChart dateRange={filterRange} />
          </div>
        </motion.div>
      </div>
    </MainLayout>
  );
}