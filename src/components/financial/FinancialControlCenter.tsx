import { motion } from "framer-motion";
import {
  Shield, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Heart, Banknote, Clock, Users, Truck, RefreshCw, ChevronRight,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useFinancialSnapshot,
  useAIAlerts,
  useRiskScores,
  useResolveAlert,
  useRunFinancialEngine,
} from "@/hooks/useFinancialEngine";
import { toast } from "sonner";

const formatCurrency = (v: number) => {
  if (Math.abs(v) >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString("en-IN")}`;
};

const healthColor = (score: number) => {
  if (score >= 75) return "text-emerald-500";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
};

const healthLabel = (score: number) => {
  if (score >= 75) return "Healthy";
  if (score >= 50) return "Attention Needed";
  return "At Risk";
};

const riskColor = (risk: number) => {
  if (risk <= 25) return "bg-emerald-500";
  if (risk <= 50) return "bg-amber-500";
  return "bg-red-500";
};

const severityConfig = {
  critical: { color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", icon: AlertTriangle },
  high: { color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", icon: AlertTriangle },
  medium: { color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20", icon: Activity },
  low: { color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", icon: CheckCircle },
};

export function FinancialControlCenter() {
  const { data: snapshot, isLoading: snapLoading } = useFinancialSnapshot();
  const { data: alerts, isLoading: alertsLoading } = useAIAlerts();
  const { data: risk, isLoading: riskLoading } = useRiskScores();
  const resolveAlert = useResolveAlert();
  const runEngine = useRunFinancialEngine();

  const isLoading = snapLoading || alertsLoading || riskLoading;

  const handleRunEngine = async () => {
    try {
      await runEngine.mutateAsync(undefined);
      toast.success("Financial analysis updated");
    } catch {
      toast.error("Failed to refresh analysis");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold">Financial Risk Monitor</h3>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <Card className="border-dashed border-2 border-muted-foreground/20">
        <CardContent className="p-8 text-center">
          <Shield className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-2">Financial Risk Monitor</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Run the financial engine to generate your first analysis.
          </p>
          <Button onClick={handleRunEngine} disabled={runEngine.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${runEngine.isPending ? "animate-spin" : ""}`} />
            {runEngine.isPending ? "Analyzing..." : "Run Analysis"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const healthScore = Number(snapshot.health_score) || 0;
  const topAlerts = (alerts || []).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Financial Risk Monitor</h3>
          <Badge variant="outline" className="text-xs">
            {new Date(snapshot.snapshot_date).toLocaleDateString("en-IN")}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRunEngine}
          disabled={runEngine.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${runEngine.isPending ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Top Row: Health Score + Key Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Health Score */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Heart className={`h-4 w-4 ${healthColor(healthScore)}`} />
                  <span className="text-sm font-medium text-muted-foreground">Health Score</span>
                </div>
                <Badge variant="outline" className={`text-xs ${healthColor(healthScore)}`}>
                  {healthLabel(healthScore)}
                </Badge>
              </div>
              <div className={`text-3xl font-bold ${healthColor(healthScore)}`}>
                {healthScore.toFixed(0)}
                <span className="text-lg text-muted-foreground">/100</span>
              </div>
              <Progress value={healthScore} className="mt-3 h-2" />
            </CardContent>
          </Card>
        </motion.div>

        {/* Cash Status */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Banknote className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium text-muted-foreground">Cash Status</span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {formatCurrency(Number(snapshot.cash_position))}
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{snapshot.runway_days} days runway</span>
                {snapshot.runway_days && snapshot.runway_days < 30 && (
                  <Badge variant="destructive" className="text-[10px]">Low</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Receivables Risk */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium text-muted-foreground">Receivables</span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {formatCurrency(Number(snapshot.receivables_total))}
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs">
                <span className="text-muted-foreground">Overdue:</span>
                <span className={Number(snapshot.receivables_overdue) > 0 ? "text-red-500 font-semibold" : "text-emerald-500"}>
                  {formatCurrency(Number(snapshot.receivables_overdue))}
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Margin Movement */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                {Number(snapshot.net_margin_pct) >= 0
                  ? <TrendingUp className="h-4 w-4 text-emerald-500" />
                  : <TrendingDown className="h-4 w-4 text-red-500" />
                }
                <span className="text-sm font-medium text-muted-foreground">Net Margin (30d)</span>
              </div>
              <div className={`text-2xl font-bold ${Number(snapshot.net_margin_pct) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {Number(snapshot.net_margin_pct) > 999
                  ? ">999%"
                  : Number(snapshot.net_margin_pct) < -999
                    ? "<-999%"
                    : `${Number(snapshot.net_margin_pct).toFixed(1)}%`
                }
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>Rev: {formatCurrency(Number(snapshot.revenue_30d))}</span>
                <span>Exp: {formatCurrency(Number(snapshot.expenses_30d))}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Bottom Row: Risk Dimensions + Alerts */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Risk Dimensions */}
        {risk && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2"
          >
            <Card className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Risk Dimensions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Cash Risk", value: Math.min(100, Number(risk.cash_risk)) },
                  { label: "Receivables Risk", value: Math.min(100, Number(risk.receivables_risk)) },
                  { label: "Margin Risk", value: Math.min(100, Number(risk.margin_risk)) },
                  { label: "Compliance Risk", value: Math.min(100, Number(risk.compliance_risk)) },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <span className="text-xs font-mono font-semibold">{item.value.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${riskColor(item.value)}`}
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Top Alerts */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className={risk ? "lg:col-span-3" : "lg:col-span-5"}
        >
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Active Alerts
                  {topAlerts.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{topAlerts.length}</Badge>
                  )}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {topAlerts.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-500/50" />
                  <p className="text-sm">No active alerts — looking good!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topAlerts.map((alert) => {
                    const config = severityConfig[alert.severity as keyof typeof severityConfig] || severityConfig.medium;
                    const Icon = config.icon;
                    return (
                      <div
                        key={alert.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${config.border} ${config.bg}`}
                      >
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{alert.title}</span>
                            <Badge variant="outline" className={`text-[10px] ${config.color}`}>
                              {alert.severity}
                            </Badge>
                          </div>
                          {alert.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 h-7 text-xs"
                          onClick={() => {
                            resolveAlert.mutate(alert.id);
                            toast.success("Alert resolved");
                          }}
                        >
                          Resolve
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
