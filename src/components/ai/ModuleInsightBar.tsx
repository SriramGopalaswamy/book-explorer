import { Brain, RefreshCw, AlertTriangle, TrendingUp, CheckCircle, Zap } from "lucide-react";
import { useAIInsights } from "@/hooks/useAIInsights";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

const severityIcons = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  opportunity: TrendingUp,
  positive: CheckCircle,
};

const severityColors = {
  critical: "text-red-400",
  warning: "text-amber-400",
  opportunity: "text-blue-400",
  positive: "text-emerald-400",
};

interface Props {
  module: string;
}

export function ModuleInsightBar({ module }: Props) {
  const { data, isLoading, refetch, isFetching } = useAIInsights(module);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-primary/10 bg-card/60 backdrop-blur-sm p-4 mb-6 flex items-center gap-3">
        <Brain className="h-5 w-5 text-primary animate-pulse" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  if (!data) return null;

  const topInsight = data.insights[0];
  if (!topInsight) return null;

  const Icon = severityIcons[topInsight.severity] || Zap;
  const color = severityColors[topInsight.severity] || "text-primary";

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-primary/10 bg-card/60 backdrop-blur-sm p-4 mb-6"
    >
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Brain className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`h-4 w-4 ${color}`} />
            <span className="font-semibold text-sm text-foreground">{topInsight.title}</span>
            <Badge variant="outline" className="text-[10px]">{data.overall_grade}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{topInsight.commentary}</p>
          {data.insights.length > 1 && (
            <p className="text-xs text-muted-foreground mt-1">
              +{data.insights.length - 1} more insight{data.insights.length > 2 ? "s" : ""}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </motion.div>
  );
}
