import { useState } from "react";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import { useOrganizations, useOrgStatusAction } from "@/hooks/useSuperAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Zap, Ban, RotateCcw, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function PlatformActions() {
  const { data: orgs, isLoading } = useOrganizations();
  const orgStatusAction = useOrgStatusAction();
  const [confirmAction, setConfirmAction] = useState<{
    orgId: string;
    orgName: string;
    action: "suspend" | "reactivate";
  } | null>(null);

  const handleExport = async (orgId: string, orgName: string) => {
    // Export basic org data as JSON
    const [profiles, invoices, expenses] = await Promise.all([
      supabase.from("profiles").select("*").eq("organization_id", orgId),
      supabase.from("invoices").select("*").eq("organization_id", orgId),
      supabase.from("expenses").select("*").eq("organization_id", orgId),
    ]);

    const exportData = {
      organization: orgName,
      exported_at: new Date().toISOString(),
      profiles: profiles.data ?? [],
      invoices: invoices.data ?? [],
      expenses: expenses.data ?? [],
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${orgName.replace(/\s+/g, "_")}_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported data for ${orgName}`);
  };

  const executeAction = () => {
    if (!confirmAction) return;
    orgStatusAction.mutate({
      orgId: confirmAction.orgId,
      orgName: confirmAction.orgName,
      newStatus: confirmAction.action === "suspend" ? "suspended" : "active",
    });
    setConfirmAction(null);
  };

  return (
    <PlatformLayout title="Action Panel" subtitle="Manage organization lifecycle and data">
      <div className="grid gap-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          (orgs ?? []).map((org) => {
            const isSuspended = (org as any).status === "suspended";
            return (
              <Card key={org.id}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Zap className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{org.name}</p>
                        <p className="text-xs text-muted-foreground">{org.id}</p>
                      </div>
                      <Badge
                        variant={isSuspended ? "destructive" : "default"}
                        className={!isSuspended ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""}
                      >
                        {isSuspended ? "Suspended" : "Active"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {isSuspended ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setConfirmAction({
                              orgId: org.id,
                              orgName: org.name,
                              action: "reactivate",
                            })
                          }
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Reactivate
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() =>
                            setConfirmAction({
                              orgId: org.id,
                              orgName: org.name,
                              action: "suspend",
                            })
                          }
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" />
                          Suspend
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExport(org.id, org.name)}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Export
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === "suspend" ? "Suspend Organization?" : "Reactivate Organization?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "suspend"
                ? `This will suspend "${confirmAction?.orgName}". Users in this organization will lose access until reactivated.`
                : `This will reactivate "${confirmAction?.orgName}". Users will regain access immediately.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              className={confirmAction?.action === "suspend" ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {confirmAction?.action === "suspend" ? "Suspend" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PlatformLayout>
  );
}
