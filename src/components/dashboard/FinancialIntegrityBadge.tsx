import { useFinancialIntegrity, useIntegrityAlerts } from "@/hooks/useCanonicalViews";
import { AlertCircle, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";

interface FinancialIntegrityBadgeProps {
  organizationId?: string;
  showDetails?: boolean;
}

export const FinancialIntegrityBadge = ({ organizationId, showDetails = true }: FinancialIntegrityBadgeProps) => {
  const { data: integrity, isLoading } = useFinancialIntegrity(organizationId);
  const { data: alerts } = useIntegrityAlerts(organizationId);

  if (isLoading) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        Checking...
      </Badge>
    );
  }

  const status = integrity?.status || "unknown";
  const criticalAlerts = integrity?.criticalAlerts || 0;
  const unresolvedAlerts = integrity?.unresolvedAlerts || 0;
  const lastReconciled = integrity?.lastReconciledAt;

  // Determine badge variant and icon
  let variant: "default" | "destructive" | "secondary" | "outline" = "secondary";
  let Icon = Clock;
  let statusText = "Unknown";
  let tooltipText = "Financial integrity status unknown";

  if (criticalAlerts > 0) {
    variant = "destructive";
    Icon = AlertCircle;
    statusText = `${criticalAlerts} Critical Issue${criticalAlerts > 1 ? 's' : ''}`;
    tooltipText = `${criticalAlerts} critical financial integrity issue${criticalAlerts > 1 ? 's' : ''} detected`;
  } else if (unresolvedAlerts > 0) {
    variant = "outline";
    Icon = AlertTriangle;
    statusText = `${unresolvedAlerts} Warning${unresolvedAlerts > 1 ? 's' : ''}`;
    tooltipText = `${unresolvedAlerts} financial warning${unresolvedAlerts > 1 ? 's' : ''} detected`;
  } else if (status === "success") {
    variant = "default";
    Icon = CheckCircle;
    statusText = "Balanced";
    tooltipText = "All financial records are balanced and consistent";
  }

  const lastReconciledText = lastReconciled
    ? `Last reconciled ${formatDistanceToNow(new Date(lastReconciled), { addSuffix: true })}`
    : "Never reconciled";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <Badge variant={variant} className="gap-1.5 cursor-help">
              <Icon className="h-3.5 w-3.5" />
              {statusText}
            </Badge>
            {showDetails && lastReconciled && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {lastReconciledText}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <div className="space-y-2">
            <p className="font-semibold">{tooltipText}</p>
            <p className="text-xs">{lastReconciledText}</p>
            {alerts && alerts.length > 0 && (
              <div className="text-xs space-y-1 mt-2 pt-2 border-t">
                <p className="font-medium">Recent Alerts:</p>
                {alerts.slice(0, 3).map((alert) => (
                  <p key={alert.id} className="text-muted-foreground">
                    • {alert.title}
                  </p>
                ))}
                {alerts.length > 3 && (
                  <p className="text-muted-foreground italic">
                    + {alerts.length - 3} more
                  </p>
                )}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
