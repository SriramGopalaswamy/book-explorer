import { PlatformLayout } from "@/components/platform/PlatformLayout";
import { useTenantHealthMetrics, useOrganizations } from "@/hooks/useSuperAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, Wallet, ClipboardList, Loader2, Activity } from "lucide-react";

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{value.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PlatformHealth() {
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();
  const { data: globalMetrics, isLoading: metricsLoading } = useTenantHealthMetrics();

  const isLoading = orgsLoading || metricsLoading;

  return (
    <PlatformLayout title="Tenant Health" subtitle="Platform-wide health metrics and activity">
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4 mb-8">
            <MetricCard label="Active Users" value={globalMetrics?.activeUsers ?? 0} icon={Users} />
            <MetricCard label="Invoices" value={globalMetrics?.invoiceCount ?? 0} icon={FileText} />
            <MetricCard label="Expenses" value={globalMetrics?.expenseCount ?? 0} icon={Wallet} />
            <MetricCard label="Audit Entries" value={globalMetrics?.auditVolume ?? 0} icon={ClipboardList} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Organization Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {(orgs ?? []).map((org) => (
                  <div
                    key={org.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                  >
                    <div>
                      <p className="font-medium text-foreground">{org.name}</p>
                      <p className="text-xs text-muted-foreground">{org.id}</p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded ${
                          (org as any).status === "suspended"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-emerald-500/10 text-emerald-600"
                        }`}
                      >
                        {(org as any).status ?? "active"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </PlatformLayout>
  );
}
