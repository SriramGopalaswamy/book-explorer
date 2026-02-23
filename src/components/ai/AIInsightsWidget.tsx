import { motion, AnimatePresence } from "framer-motion";
import { Brain, AlertTriangle, TrendingUp, Zap, CheckCircle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useAIInsights, AIInsight } from "@/hooks/useAIInsights";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { AI_ANALYTICS_ENABLED } from "@/config/systemFlags";

const severityConfig = {
  critical: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", badge: "bg-red-500/20 text-red-300" },
  warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", badge: "bg-amber-500/20 text-amber-300" },
  opportunity: { icon: TrendingUp, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", badge: "bg-blue-500/20 text-blue-300" },
  positive: { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", badge: "bg-emerald-500/20 text-emerald-300" },
};

const gradeColors: Record<string, string> = {
  A: "text-emerald-400 border-emerald-500/50 bg-emerald-500/10",
  B: "text-blue-400 border-blue-500/50 bg-blue-500/10",
  C: "text-amber-400 border-amber-500/50 bg-amber-500/10",
  D: "text-orange-400 border-orange-500/50 bg-orange-500/10",
  F: "text-red-400 border-red-500/50 bg-red-500/10",
};

interface Props {
  module?: string;
  compact?: boolean;
}

export function AIInsightsWidget({ module = "dashboard", compact = false }: Props) {
  const { data, isLoading, error, refetch, isFetching } = useAIInsights(module);
  const [expanded, setExpanded] = useState(!compact);

  // Phase 1: Feature flag kill switch — render nothing when disabled
  if (!AI_ANALYTICS_ENABLED) return null;

  if (isLoading) {
    return (
      <Card className="p-6 border-primary/20 bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Brain className="h-5 w-5 text-primary animate-pulse" />
          </div>
          <div>
            <Skeleton className="h-5 w-48 mb-1" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6 border-destructive/20 bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">AI analysis unavailable</span>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-primary/20 bg-card/80 backdrop-blur-sm">
      <div
        className="p-6 pb-4 cursor-pointer"
        onClick={() => compact && setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Brain className="h-5 w-5 text-primary" />
            </motion.div>
            <div>
              <h3 className="font-bold text-foreground flex items-center gap-2">
                AI Analysis
                <Badge className={`text-xs ${gradeColors[data.overall_grade] || ""}`}>
                  Grade: {data.overall_grade}
                </Badge>
              </h3>
              <p className="text-sm font-semibold text-primary">{data.headline}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => { e.stopPropagation(); refetch(); }}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
            {compact && (
              expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      <div className="px-6 pb-3">
        <p className="text-sm italic text-muted-foreground border-l-2 border-primary/50 pl-3">
          "{data.one_liner}"
        </p>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={compact ? { height: 0, opacity: 0 } : false}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-6 pb-6 space-y-3 overflow-hidden"
          >
            {data.insights.map((insight, i) => (
              <InsightCard key={i} insight={insight} index={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function InsightCard({ insight, index }: { insight: AIInsight; index: number }) {
  const config = severityConfig[insight.severity];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`rounded-xl border ${config.border} ${config.bg} p-4`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 ${config.color} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-sm text-foreground">{insight.title}</h4>
            <Badge variant="outline" className={`text-[10px] ${config.badge} border-0`}>
              {insight.severity}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{insight.commentary}</p>
          <div className="mt-2 flex items-center gap-1">
            <Zap className={`h-3 w-3 ${config.color}`} />
            <span className={`text-xs font-mono font-bold ${config.color}`}>{insight.metric}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
