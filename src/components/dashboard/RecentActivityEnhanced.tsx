import { motion } from "framer-motion";
import { FileText, Users, Target, CreditCard, Check, Clock, ArrowRight, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuditLogs, ACTION_LABELS, ENTITY_LABELS } from "@/hooks/useAuditLogs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { LucideIcon } from "lucide-react";

const ENTITY_ICON_MAP: Record<string, { icon: LucideIcon; gradient: string; iconColor: string }> = {
  leave_request:          { icon: Check,      gradient: "from-success/20 to-success/5",       iconColor: "text-success" },
  attendance_correction:  { icon: Clock,      gradient: "from-amber-500/20 to-amber-500/5",   iconColor: "text-amber-500" },
  employee:               { icon: Users,      gradient: "from-hrms/20 to-hrms/5",             iconColor: "text-hrms" },
  payroll:                { icon: CreditCard, gradient: "from-primary/20 to-primary/5",       iconColor: "text-primary" },
  payroll_run:            { icon: CreditCard, gradient: "from-primary/20 to-primary/5",       iconColor: "text-primary" },
  memo:                   { icon: FileText,   gradient: "from-violet-500/20 to-violet-500/5", iconColor: "text-violet-500" },
  goal_plan:              { icon: Target,     gradient: "from-performance/20 to-performance/5", iconColor: "text-performance" },
  compensation:           { icon: CreditCard, gradient: "from-primary/20 to-primary/5",       iconColor: "text-primary" },
  organization:           { icon: Activity,   gradient: "from-muted-foreground/20 to-muted-foreground/5", iconColor: "text-muted-foreground" },
};

const DEFAULT_ICON = { icon: Activity, gradient: "from-muted-foreground/20 to-muted-foreground/5", iconColor: "text-muted-foreground" };

function formatActivityTitle(action: string, entityType: string, targetName: string | null) {
  const label = ACTION_LABELS[action] || action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return label;
}

function formatActivityDescription(action: string, entityType: string, actorName: string | null, targetName: string | null) {
  const parts: string[] = [];
  if (actorName) parts.push(`By ${actorName}`);
  if (targetName) parts.push(targetName);
  if (parts.length === 0) {
    const entityLabel = ENTITY_LABELS[entityType] || entityType.replace(/_/g, " ");
    parts.push(entityLabel);
  }
  return parts.join(" • ");
}

export function RecentActivityEnhanced() {
  const { data, isLoading } = useAuditLogs({}, 1, 6);
  const navigate = useNavigate();
  const activities = data?.logs ?? [];

  return (
    <motion.div
      className="rounded-2xl border bg-card/80 backdrop-blur-sm p-6 shadow-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.div
            className="h-2 w-2 rounded-full bg-primary"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <h3 className="text-lg font-bold text-foreground">Recent Activity</h3>
        </div>
        <motion.button
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          whileHover={{ x: 4 }}
          onClick={() => navigate("/admin/audit-log")}
        >
          View all
          <ArrowRight className="h-4 w-4" />
        </motion.button>
      </div>
      
      <div className="space-y-1">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4 p-3">
              <Skeleton className="h-11 w-11 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))
        ) : activities.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No recent activity to display
          </div>
        ) : (
          activities.map((activity, index) => {
            const iconConfig = ENTITY_ICON_MAP[activity.entity_type] || DEFAULT_ICON;
            const IconComponent = iconConfig.icon;
            const timeAgo = formatDistanceToNow(new Date(activity.created_at), { addSuffix: true });

            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
                whileHover={{ x: 4, backgroundColor: "hsl(var(--secondary) / 0.5)" }}
                className={cn(
                  "flex items-start gap-4 p-3 rounded-xl transition-colors cursor-pointer",
                  index !== activities.length - 1 && "mb-1"
                )}
              >
                <motion.div
                  className={cn(
                    "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br",
                    iconConfig.gradient
                  )}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 400 }}
                >
                  <IconComponent className={cn("h-5 w-5", iconConfig.iconColor)} />
                </motion.div>
                
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground mb-0.5">
                    {formatActivityTitle(activity.action, activity.entity_type, activity.target_name)}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {formatActivityDescription(activity.action, activity.entity_type, activity.actor_name, activity.target_name)}
                  </p>
                </div>
                
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                  <Clock className="h-3 w-3" />
                  {timeAgo}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
