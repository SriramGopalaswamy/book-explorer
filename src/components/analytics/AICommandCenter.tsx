import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Sparkles, AlertTriangle, TrendingUp, Shield, RefreshCw, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useProfitLoss, useBalanceSheet } from "@/hooks/useAnalytics";
import { useHRAnalytics, usePayrollSummary } from "@/hooks/useCrossModuleAnalytics";

interface AIInsight {
  id: string;
  category: "anomaly" | "forecast" | "compliance" | "optimization";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  recommendation: string;
  module: string;
  confidence: number;
}

function generateLocalInsights(
  pl: ReturnType<typeof useProfitLoss>,
  bs: ReturnType<typeof useBalanceSheet>,
  hr?: { activeEmployees: number; onLeave: number; newHiresLast90Days: number; departments: { name: string; count: number }[] } | null,
  payroll?: { totalPayrollCost: number; costPerEmployee: number; avgCTC: number } | null
): AIInsight[] {
  const insights: AIInsight[] = [];

  // Financial analysis
  if (pl.grossMargin < 10 && pl.totalRevenue > 0) {
    insights.push({
      id: "low-margin",
      category: "anomaly",
      severity: "critical",
      title: "Critically Low Profit Margin",
      description: `Net margin is ${pl.grossMargin.toFixed(1)}%, significantly below healthy thresholds.`,
      recommendation: "Review expense categories and identify cost reduction opportunities. Consider renegotiating vendor contracts.",
      module: "Finance",
      confidence: 95,
    });
  } else if (pl.grossMargin > 0 && pl.grossMargin < 20) {
    insights.push({
      id: "moderate-margin",
      category: "optimization",
      severity: "warning",
      title: "Margin Below Target",
      description: `Net margin at ${pl.grossMargin.toFixed(1)}%. Industry benchmark suggests 20-30% for SaaS.`,
      recommendation: "Analyze expense-to-revenue ratios by category to identify optimization areas.",
      module: "Finance",
      confidence: 80,
    });
  }

  if (pl.totalExpenses > pl.totalRevenue && pl.totalRevenue > 0) {
    insights.push({
      id: "negative-income",
      category: "anomaly",
      severity: "critical",
      title: "Operating at a Loss",
      description: `Expenses (₹${(pl.totalExpenses / 100000).toFixed(1)}L) exceed revenue (₹${(pl.totalRevenue / 100000).toFixed(1)}L).`,
      recommendation: "Immediately review discretionary spending and prioritize revenue-generating activities.",
      module: "Finance",
      confidence: 100,
    });
  }

  // Balance sheet health
  if (bs.totalAssets > 0 && bs.totalLiabilities > bs.totalAssets * 0.7) {
    insights.push({
      id: "high-leverage",
      category: "compliance",
      severity: "warning",
      title: "High Debt-to-Asset Ratio",
      description: `Liabilities represent ${((bs.totalLiabilities / bs.totalAssets) * 100).toFixed(0)}% of total assets.`,
      recommendation: "Consider debt restructuring or accelerating receivables collection.",
      module: "Finance",
      confidence: 85,
    });
  }

  // HR insights
  if (hr) {
    if (hr.onLeave > hr.activeEmployees * 0.2 && hr.activeEmployees > 5) {
      insights.push({
        id: "high-absenteeism",
        category: "anomaly",
        severity: "warning",
        title: "Elevated Absenteeism",
        description: `${Math.round((hr.onLeave / hr.activeEmployees) * 100)}% of workforce currently on leave.`,
        recommendation: "Review leave patterns by department. Consider engagement surveys to identify underlying issues.",
        module: "HR",
        confidence: 75,
      });
    }

    if (hr.newHiresLast90Days > hr.activeEmployees * 0.3 && hr.activeEmployees > 3) {
      insights.push({
        id: "rapid-growth",
        category: "forecast",
        severity: "info",
        title: "Rapid Headcount Growth",
        description: `${hr.newHiresLast90Days} new hires in 90 days (${Math.round((hr.newHiresLast90Days / hr.activeEmployees) * 100)}% growth).`,
        recommendation: "Ensure onboarding processes scale. Monitor payroll cost projections against budget.",
        module: "HR",
        confidence: 90,
      });
    }
  }

  // Payroll insights
  if (payroll && pl.totalRevenue > 0) {
    const payrollToRevenueRatio = (payroll.totalPayrollCost / pl.totalRevenue) * 100;
    if (payrollToRevenueRatio > 60) {
      insights.push({
        id: "high-payroll-ratio",
        category: "optimization",
        severity: "warning",
        title: "Payroll-to-Revenue Ratio High",
        description: `Payroll costs represent ${payrollToRevenueRatio.toFixed(0)}% of total revenue.`,
        recommendation: "Evaluate workforce productivity metrics. Consider automation for repetitive tasks.",
        module: "Payroll",
        confidence: 85,
      });
    }
  }

  // Always provide at least one positive insight
  if (insights.length === 0 && pl.totalRevenue > 0) {
    insights.push({
      id: "healthy-ops",
      category: "compliance",
      severity: "info",
      title: "Operations Running Smoothly",
      description: "No anomalies or compliance issues detected across Finance, HR, and Payroll modules.",
      recommendation: "Continue monitoring. Set up automated alerts for key threshold breaches.",
      module: "System",
      confidence: 100,
    });
  }

  return insights;
}

const categoryIcons: Record<string, React.ReactNode> = {
  anomaly: <AlertTriangle className="h-4 w-4" />,
  forecast: <TrendingUp className="h-4 w-4" />,
  compliance: <Shield className="h-4 w-4" />,
  optimization: <Sparkles className="h-4 w-4" />,
};

const severityColors: Record<string, string> = {
  info: "border-blue-500/30 bg-blue-500/5",
  warning: "border-yellow-500/30 bg-yellow-500/5",
  critical: "border-destructive/30 bg-destructive/5",
};

const severityBadge: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  warning: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  critical: "bg-destructive/10 text-destructive border-destructive/30",
};

export function AICommandCenter() {
  const pl = useProfitLoss();
  const bs = useBalanceSheet();
  const { data: hr } = useHRAnalytics();
  const { data: payroll } = usePayrollSummary();
  const [refreshKey, setRefreshKey] = useState(0);

  const insights = generateLocalInsights(pl, bs, hr, payroll);

  const anomalies = insights.filter((i) => i.category === "anomaly");
  const forecasts = insights.filter((i) => i.category === "forecast");
  const compliance = insights.filter((i) => i.category === "compliance");
  const optimizations = insights.filter((i) => i.category === "optimization");

  const overallScore = insights.length === 0
    ? 100
    : Math.max(
        0,
        100 -
          insights.filter((i) => i.severity === "critical").length * 25 -
          insights.filter((i) => i.severity === "warning").length * 10
      );

  return (
    <div className="space-y-6">
      {/* Score Header */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="lg:col-span-1">
          <CardContent className="pt-6">
            <div className="text-center">
              <Brain className="h-8 w-8 mx-auto mb-2 text-primary" />
              <div className={`text-3xl font-bold ${overallScore >= 70 ? "text-success" : overallScore >= 40 ? "text-yellow-500" : "text-destructive"}`}>
                {overallScore}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Health Score</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">{anomalies.length}</div>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <AlertTriangle className="h-3 w-3" /> Anomalies
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">{forecasts.length}</div>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3" /> Forecasts
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">{compliance.length}</div>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <Shield className="h-3 w-3" /> Compliance
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">{optimizations.length}</div>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <Sparkles className="h-3 w-3" /> Optimizations
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Insights List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI-Generated Insights
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {insights.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>No data available for analysis. Add financial records and employee data to enable AI insights.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  className={`rounded-lg border p-4 ${severityColors[insight.severity]}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {categoryIcons[insight.category]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-foreground">{insight.title}</h4>
                        <Badge variant="outline" className={`text-xs ${severityBadge[insight.severity]}`}>
                          {insight.severity}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {insight.module}
                        </Badge>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {insight.confidence}% confidence
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                      <div className="mt-2 p-2 rounded bg-muted/50 border border-border/50">
                        <p className="text-xs text-foreground">
                          <span className="font-medium">Recommendation:</span> {insight.recommendation}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
