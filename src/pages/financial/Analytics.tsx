import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp, TrendingDown, DollarSign, PieChart, BarChart3, FileText, Layers,
} from "lucide-react";
import { useProfitLoss, useBalanceSheet, useExpenseByCategory, useProfitLossForPeriod, useProfitLossAllTime } from "@/hooks/useAnalytics";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { OnboardingBanner } from "@/components/dashboard/OnboardingBanner";

// Report components
import { ProfitLossStatement } from "@/components/analytics/ProfitLossStatement";
import { BalanceSheetSummary } from "@/components/analytics/BalanceSheetSummary";
import { RevenueTrendChart, ProfitBarChart } from "@/components/analytics/RevenueTrendChart";
import { ExpenseBreakdownDonut, RevenueSourceDonut } from "@/components/analytics/CategoryBreakdowns";
import { AccountsReceivableAging } from "@/components/analytics/AccountsReceivableAging";
import { ChartOfAccountsTable } from "@/components/analytics/ChartOfAccountsTable";
import { ReportsDateFilter } from "@/components/analytics/ReportsDateFilter";

const formatCurrency = (v: number) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
};

export default function Analytics() {
  // Role-based access control
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  
  const pl = useProfitLoss(); // CoA-based — used for Reports tab P&L statement
  const bs = useBalanceSheet();
  const expenses = useExpenseByCategory();
  const [activeTab, setActiveTab] = useState("coa");
  
  // Date range filter for Reports tab
  const [reportFrom, setReportFrom] = useState<Date | undefined>();
  const [reportTo, setReportTo] = useState<Date | undefined>();
  const { data: periodPL } = useProfitLossForPeriod(reportFrom, reportTo);
  const hasDateFilter = !!(reportFrom || reportTo);

  // KPI cards always use financial_records (same source as the main dashboard)
  const { data: allTimePL } = useProfitLossAllTime();
  const kpiData = hasDateFilter ? periodPL : allTimePL;


  // Show loading state while checking permissions
  if (isCheckingRole) {
    return (
      <MainLayout title="Analytics">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Checking permissions...</p>
          </div>
        </div>
      </MainLayout>
    );
  }
  
  // Deny access if user doesn't have finance role
  if (!hasFinanceAccess) {
    return (
      <AccessDenied 
        message="Finance Access Required"
        description="You need finance or admin role to access the Analytics module. Contact your administrator for access."
      />
    );
  }

  const kpiExpenses = kpiData?.expenses ?? [];
  const topExpense = kpiExpenses.length > 0
    ? kpiExpenses.reduce((a, b) => a.amount > b.amount ? a : b)
    : expenses.length > 0 ? { name: expenses.reduce((a, b) => a.value > b.value ? a : b).name } : null;

  return (
    <MainLayout title="Analytics & Reports" subtitle="Comprehensive financial intelligence and standard reports">
      <div className="space-y-6 animate-fade-in">
        <OnboardingBanner />
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {hasDateFilter ? `Filtered period` : "All-time totals · same source as dashboard"}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(kpiData?.totalRevenue ?? 0)}</div>
              <p className="text-xs text-muted-foreground">From {kpiData?.revenue.length ?? 0} categories</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(kpiData?.totalExpenses ?? 0)}</div>
              <p className="text-xs text-muted-foreground">
                {topExpense ? `Largest: ${topExpense.name}` : "No expenses recorded"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Net Income</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(kpiData?.netIncome ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(kpiData?.netIncome ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">{(kpiData?.grossMargin ?? 0).toFixed(1)}% margin</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets</CardTitle>
              <Layers className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(bs.totalAssets)}</div>
              <p className="text-xs text-muted-foreground">Net worth: {formatCurrency(bs.totalAssets - bs.totalLiabilities)}</p>
            </CardContent>
          </Card>
        </div>


        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 max-w-lg">
            <TabsTrigger value="coa" className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              CoA
            </TabsTrigger>
            <TabsTrigger value="overview" className="flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="charts" className="flex items-center gap-1.5">
              <PieChart className="h-3.5 w-3.5" />
              Charts
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              <RevenueTrendChart />
              <ProfitBarChart />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <ExpenseBreakdownDonut />
              <RevenueSourceDonut />
            </div>
            <AccountsReceivableAging />
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-6 mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">
                {hasDateFilter ? "Showing filtered period" : "Showing all-time (CoA balances)"}
              </h3>
              <ReportsDateFilter
                from={reportFrom}
                to={reportTo}
                onFromChange={setReportFrom}
                onToChange={setReportTo}
                onClear={() => { setReportFrom(undefined); setReportTo(undefined); }}
              />
            </div>
            <ProfitLossStatement periodData={hasDateFilter ? periodPL : undefined} from={reportFrom} to={reportTo} />
            <BalanceSheetSummary asOfDate={reportTo} />
          </TabsContent>

          {/* Charts Tab */}
          <TabsContent value="charts" className="space-y-6 mt-6">
            <RevenueTrendChart />
            <div className="grid md:grid-cols-2 gap-6">
              <ExpenseBreakdownDonut />
              <RevenueSourceDonut />
            </div>
            <ProfitBarChart />
            <AccountsReceivableAging />
          </TabsContent>

          {/* Chart of Accounts Tab */}
          <TabsContent value="coa" className="space-y-6 mt-6">
            <ChartOfAccountsTable />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
