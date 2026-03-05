import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { useOrganizations, useOrgMemberCounts, useLogPlatformAction } from "@/hooks/useSuperAdmin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Users, Eye, Loader2, Plus } from "lucide-react";
import { format, addMonths } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();
  const { data: orgs, isLoading } = useOrganizations();
  const { data: memberCounts } = useOrgMemberCounts();
  const logAction = useLogPlatformAction();
  const [switching, setSwitching] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrg, setNewOrg] = useState({
    name: "",
    slug: "",
    plan: "free",
    validMonths: 12,
  });

  const createOrganization = async () => {
    if (!newOrg.name || !newOrg.slug) {
      toast.error("Please fill in all required fields");
      return;
    }

    setCreating(true);
    try {
      // Create organization
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .insert([
          {
            name: newOrg.name,
            slug: newOrg.slug,
            status: "active",
            org_state: "active",
            environment_type: "production",
            settings: {},
          },
        ])
        .select()
        .single();

      if (orgError) {
        toast.error(`Failed to create organization: ${orgError.message}`);
        return;
      }

      // Create subscription
      const validUntil = addMonths(new Date(), newOrg.validMonths);
      const { error: subError } = await supabase
        .from("subscriptions")
        .insert([
          {
            organization_id: orgData.id,
            plan: newOrg.plan,
            status: "active",
            source: "platform_admin",
            valid_until: validUntil.toISOString(),
            is_read_only: false,
            enabled_modules: ["hrms", "accounting", "gst"],
          },
        ]);

      if (subError) {
        toast.error(`Organization created but subscription failed: ${subError.message}`);
        return;
      }

      await logAction.mutateAsync({
        action: "org_created",
        target_type: "organization",
        target_id: orgData.id,
        target_name: orgData.name,
        metadata: { plan: newOrg.plan, valid_months: newOrg.validMonths },
      });

      toast.success(`Organization "${newOrg.name}" created successfully!`);
      setCreateDialogOpen(false);
      setNewOrg({ name: "", slug: "", plan: "free", validMonths: 12 });
      queryClient.invalidateQueries({ queryKey: ["platform-organizations"] });
    } catch (err: any) {
      toast.error(`Failed to create organization: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

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
    <MainLayout title="Tenants" subtitle="All registered tenants in the platform">
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
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Tenants
            </CardTitle>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Organization
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Create New Organization</DialogTitle>
                  <DialogDescription>
                    Add a new organization to the platform with subscription details
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="org-name">Organization Name *</Label>
                    <Input
                      id="org-name"
                      placeholder="e.g., grx10 Technologies"
                      value={newOrg.name}
                      onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="org-slug">Slug (URL-friendly) *</Label>
                    <Input
                      id="org-slug"
                      placeholder="e.g., grx10"
                      value={newOrg.slug}
                      onChange={(e) =>
                        setNewOrg({ ...newOrg, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="subscription-plan">Subscription Plan</Label>
                    <Select value={newOrg.plan} onValueChange={(value) => setNewOrg({ ...newOrg, plan: value })}>
                      <SelectTrigger id="subscription-plan">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="valid-months">Subscription Duration (months)</Label>
                    <Input
                      id="valid-months"
                      type="number"
                      min="1"
                      max="36"
                      value={newOrg.validMonths}
                      onChange={(e) => setNewOrg({ ...newOrg, validMonths: parseInt(e.target.value) || 12 })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={creating}>
                    Cancel
                  </Button>
                  <Button onClick={createOrganization} disabled={creating}>
                    {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Organization
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
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
    </MainLayout>
  );
}
