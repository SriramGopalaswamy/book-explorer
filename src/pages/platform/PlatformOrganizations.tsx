import { PlatformLayout } from "@/components/platform/PlatformLayout";
import { useOrganizations, useOrgMemberCounts, useLogPlatformAction } from "@/hooks/useSuperAdmin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Users, Eye, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function PlatformOrganizations() {
  const { data: orgs, isLoading } = useOrganizations();
  const { data: memberCounts } = useOrgMemberCounts();
  const logAction = useLogPlatformAction();

  const switchToOrg = async (orgId: string, orgName: string) => {
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
  };

  return (
    <PlatformLayout title="Organizations" subtitle="All registered tenants in the platform">
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{orgs?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {orgs?.filter((o) => (o as any).status !== "suspended").length ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Suspended</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {orgs?.filter((o) => (o as any).status === "suspended").length ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organizations
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
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(orgs ?? []).map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium text-foreground">
                      {org.name}
                      {org.slug && (
                        <span className="ml-2 text-xs text-muted-foreground">({org.slug})</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={(org as any).status === "suspended" ? "destructive" : "default"}
                        className={(org as any).status !== "suspended" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""}
                      >
                        {(org as any).status ?? "active"}
                      </Badge>
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
                        onClick={() => switchToOrg(org.id, org.name)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View as Org
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
