import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import { useOrganizations, useOrgMemberCounts, useLogPlatformAction } from "@/hooks/useSuperAdmin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Users, Eye, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function getStateBadge(status: string, orgState: string) {
  if (status === "active" && orgState === "active") {
    return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">🟢 Operational</Badge>;
  }
  if (orgState === "initializing" || orgState === "draft") {
    return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">🟡 {orgState}</Badge>;
  }
  if (orgState === "locked" || status === "suspended") {
    return <Badge variant="destructive">🔴 {status === "suspended" ? "Suspended" : "Locked"}</Badge>;
  }
  if (orgState === "archived") {
    return <Badge className="bg-neutral-500/10 text-neutral-400 border-neutral-500/20">⚫ Archived</Badge>;
  }
  return <Badge variant="outline">{orgState}</Badge>;
}

export default function PlatformOrganizations() {
  const navigate = useNavigate();
  const { data: orgs, isLoading } = useOrganizations();
  const { data: memberCounts } = useOrgMemberCounts();
  const logAction = useLogPlatformAction();
  const [switching, setSwitching] = useState<string | null>(null);

  const switchToOrg = async (orgId: string, orgName: string) => {
    setSwitching(orgId);
    try {
      const { error: rpcError } = await supabase.rpc("set_org_context", { _org_id: orgId });
      if (rpcError) {
        toast.error(`Failed to set org context: ${rpcError.message}`);
        return;
      }
      sessionStorage.setItem(
        "platform_active_org",
        JSON.stringify({ id: orgId, name: orgName })
      );
      window.dispatchEvent(new Event("platform-org-changed"));
      await logAction.mutateAsync({
        action: "org_switch",
        target_type: "organization",
        target_id: orgId,
        target_name: orgName,
      });
      toast.success(`Switched to ${orgName}`);
    } catch (err: any) {
      toast.error(`Org switch failed: ${err.message}`);
    } finally {
      setSwitching(null);
    }
  };

  return (
    <PlatformLayout title="Tenants" subtitle="All registered tenants in the platform">
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{orgs?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Operational</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {orgs?.filter((o) => (o as any).status !== "suspended" && (o as any).org_state === "active").length ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Suspended / Locked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {orgs?.filter((o) => (o as any).status === "suspended" || (o as any).org_state === "locked").length ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Tenants
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Legal Name</TableHead>
                  <TableHead>Operational Readiness</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(orgs ?? []).map((org) => (
                  <TableRow key={org.id} className="cursor-pointer" onClick={() => navigate(`/platform/tenant/${org.id}`)}>
                    <TableCell className="font-medium text-foreground">
                      {org.name}
                      {org.slug && (
                        <span className="ml-2 text-xs text-muted-foreground">({org.slug})</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStateBadge((org as any).status ?? "active", (org as any).org_state ?? "active")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(org.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        {memberCounts?.[org.id] ?? 0}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          switchToOrg(org.id, org.name);
                        }}
                        disabled={switching === org.id}
                      >
                        {switching === org.id ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 mr-1" />
                        )}
                        {switching === org.id ? "Switching..." : "View as Org"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PlatformLayout>
  );
}
