import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useLogPlatformAction } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  FlaskConical,
  Plus,
  Trash2,
  RotateCcw,
  Play,
  Square,
  Shield,
  Users,
  Loader2,
  AlertTriangle,
  Link2,
  Copy,
  Check,
  Database,
  FileText,
  Receipt,
  UserCheck,
  CalendarDays,
  Briefcase,
  Target,
  Landmark,
  Package,
} from "lucide-react";

interface SandboxOrg {
  id: string;
  name: string;
  created_at: string;
  auto_reset_enabled: boolean;
  sandbox_expires_at: string | null;
}

interface SandboxUser {
  id: string;
  sandbox_org_id: string;
  persona_role: string;
  display_name: string;
  email: string;
}

/** Fetch all sandbox organizations */
function useSandboxOrgs() {
  return useQuery({
    queryKey: ["sandbox-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, created_at, auto_reset_enabled, sandbox_expires_at")
        .eq("environment_type", "sandbox")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SandboxOrg[];
    },
  });
}

/** Fetch sandbox users for a specific org */
function useSandboxUsers(orgId: string | null) {
  return useQuery({
    queryKey: ["sandbox-users", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("sandbox_users")
        .select("*")
        .eq("sandbox_org_id", orgId)
        .order("persona_role");
      if (error) throw error;
      return (data ?? []) as SandboxUser[];
    },
    enabled: !!orgId,
  });
}

interface SeedingStat {
  label: string;
  icon: React.ReactNode;
  count: number | null;
}

/** Fetch seeding summary counts for a sandbox org */
function useSeedingSummary(orgId: string | null) {
  return useQuery({
    queryKey: ["sandbox-seeding-summary", orgId],
    queryFn: async () => {
      if (!orgId) return null;

      const tables = [
        { key: "profiles", table: "profiles" as const, label: "Employees", icon: <UserCheck className="h-4 w-4" /> },
        { key: "invoices", table: "invoices" as const, label: "Invoices", icon: <FileText className="h-4 w-4" /> },
        { key: "bills", table: "bills" as const, label: "Bills", icon: <Receipt className="h-4 w-4" /> },
        { key: "expenses", table: "expenses" as const, label: "Expenses", icon: <Briefcase className="h-4 w-4" /> },
        { key: "journal_entries", table: "journal_entries" as const, label: "Journal Entries", icon: <Database className="h-4 w-4" /> },
        { key: "gl_accounts", table: "gl_accounts" as const, label: "GL Accounts", icon: <Landmark className="h-4 w-4" /> },
        { key: "attendance_daily", table: "attendance_daily" as const, label: "Attendance Records", icon: <CalendarDays className="h-4 w-4" /> },
        { key: "leave_balances", table: "leave_balances" as const, label: "Leave Balances", icon: <CalendarDays className="h-4 w-4" /> },
        { key: "payroll_runs", table: "payroll_runs" as const, label: "Payroll Runs", icon: <Package className="h-4 w-4" /> },
        { key: "goal_plans", table: "goal_plans" as const, label: "Goal Plans", icon: <Target className="h-4 w-4" /> },
        { key: "customers", table: "customers" as const, label: "Customers", icon: <Users className="h-4 w-4" /> },
        { key: "vendors", table: "vendors" as const, label: "Vendors", icon: <Users className="h-4 w-4" /> },
        { key: "assets", table: "assets" as const, label: "Assets", icon: <Package className="h-4 w-4" /> },
        { key: "compensation_structures", table: "compensation_structures" as const, label: "Comp. Structures", icon: <Briefcase className="h-4 w-4" /> },
        { key: "items", table: "items" as const, label: "Inventory Items", icon: <Package className="h-4 w-4" /> },
        { key: "warehouses", table: "warehouses" as const, label: "Warehouses", icon: <Landmark className="h-4 w-4" /> },
        { key: "purchase_orders", table: "purchase_orders" as const, label: "Purchase Orders", icon: <FileText className="h-4 w-4" /> },
        { key: "sales_orders", table: "sales_orders" as const, label: "Sales Orders", icon: <FileText className="h-4 w-4" /> },
        { key: "work_orders", table: "work_orders" as const, label: "Work Orders", icon: <Package className="h-4 w-4" /> },
        { key: "connectors", table: "connectors" as const, label: "Connectors", icon: <Database className="h-4 w-4" /> },
      ];

      const results: SeedingStat[] = await Promise.all(
        tables.map(async (t) => {
          const { count, error } = await supabase
            .from(t.table as any)
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId);
          return { label: t.label, icon: t.icon, count: error ? null : (count ?? 0) };
        })
      );

      return results;
    },
    enabled: !!orgId,
    staleTime: 1000 * 30,
  });
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  hr: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  finance: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  manager: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  employee: "bg-muted text-muted-foreground border-border",
};

export function SandboxContent() {
  return <SandboxContentInner />;
}

function SandboxContentInner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const logAction = useLogPlatformAction();

  const [newSandboxName, setNewSandboxName] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeImpersonation, setActiveImpersonation] = useState<{
    orgId: string;
    orgName: string;
    userId: string;
    role: string;
  } | null>(null);

  const { data: sandboxOrgs, isLoading: orgsLoading } = useSandboxOrgs();
  const { data: sandboxUsers, isLoading: usersLoading } = useSandboxUsers(selectedOrg);
  const { data: seedingSummary, isLoading: seedingLoading } = useSeedingSummary(selectedOrg);

  // Fetch invite links for selected org
  const { data: inviteLinks } = useQuery({
    queryKey: ["sandbox-invite-links", selectedOrg],
    queryFn: async () => {
      if (!selectedOrg) return [];
      const { data, error } = await supabase
        .from("sandbox_invite_links" as any)
        .select("*")
        .eq("sandbox_org_id", selectedOrg)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedOrg,
  });

  // Create sandbox org
  const createSandbox = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc("create_sandbox_org", {
        _name: name,
        _auto_reset: false,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (orgId) => {
      await logAction.mutateAsync({
        action: "sandbox_created",
        target_type: "organization",
        target_id: orgId,
        target_name: newSandboxName,
      });
      queryClient.invalidateQueries({ queryKey: ["sandbox-orgs"] });
      setNewSandboxName("");
      toast.success("Sandbox environment created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Reset sandbox org
  const resetSandbox = useMutation({
    mutationFn: async (orgId: string) => {
      const { error } = await supabase.rpc("reset_sandbox_org", { _org_id: orgId });
      if (error) throw error;
    },
    onSuccess: async (_, orgId) => {
      const org = sandboxOrgs?.find((o) => o.id === orgId);
      await logAction.mutateAsync({
        action: "sandbox_reset",
        target_type: "organization",
        target_id: orgId,
        target_name: org?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["sandbox-users", orgId] });
      toast.success("Sandbox reset to defaults");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete sandbox org
  const deleteSandbox = useMutation({
    mutationFn: async (orgId: string) => {
      const { error } = await supabase.rpc("delete_sandbox_org", { _org_id: orgId });
      if (error) throw error;
    },
    onSuccess: async (_, orgId) => {
      const org = sandboxOrgs?.find((o) => o.id === orgId);
      await logAction.mutateAsync({
        action: "sandbox_deleted",
        target_type: "organization",
        target_id: orgId,
        target_name: org?.name,
      });
      if (selectedOrg === orgId) setSelectedOrg(null);
      queryClient.invalidateQueries({ queryKey: ["sandbox-orgs"] });
      toast.success("Sandbox environment deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Enter sandbox impersonation
  const enterSandbox = async (sandboxUser: SandboxUser) => {
    try {
      const { error } = await supabase.rpc("set_sandbox_impersonation", {
        _sandbox_user_id: sandboxUser.id,
      });
      if (error) throw error;

      const org = sandboxOrgs?.find((o) => o.id === sandboxUser.sandbox_org_id);
      setActiveImpersonation({
        orgId: sandboxUser.sandbox_org_id,
        orgName: org?.name ?? "Sandbox",
        userId: sandboxUser.id,
        role: sandboxUser.persona_role,
      });

      await logAction.mutateAsync({
        action: "sandbox_impersonation_start",
        target_type: "sandbox_user",
        target_id: sandboxUser.id,
        target_name: `${sandboxUser.display_name} (${sandboxUser.persona_role})`,
        metadata: { sandbox_org_id: sandboxUser.sandbox_org_id },
      });

      toast.success(`Now viewing as ${sandboxUser.display_name} (${sandboxUser.persona_role})`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Exit sandbox impersonation
  const exitSandbox = async () => {
    try {
      const { error } = await supabase.rpc("clear_sandbox_impersonation");
      if (error) throw error;

      if (activeImpersonation) {
        await logAction.mutateAsync({
          action: "sandbox_impersonation_end",
          target_type: "sandbox_user",
          target_id: activeImpersonation.userId,
          metadata: { sandbox_org_id: activeImpersonation.orgId },
        });
      }

      setActiveImpersonation(null);
      toast.success("Exited sandbox impersonation");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Generate shareable invite link
  const generateLink = useMutation({
    mutationFn: async (orgId: string) => {
      const { data, error } = await supabase
        .from("sandbox_invite_links" as any)
        .insert({
          sandbox_org_id: orgId,
          created_by: user?.id,
          label: "Team testing link",
        })
        .select("token")
        .single();
      if (error) throw error;
      return (data as any).token as string;
    },
    onSuccess: (token) => {
      const link = `${window.location.origin}/sandbox/join/${token}`;
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      queryClient.invalidateQueries({ queryKey: ["sandbox-invite-links", selectedOrg] });
      toast.success("Invite link copied to clipboard!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Revoke invite link
  const revokeLink = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("sandbox_invite_links" as any)
        .update({ is_active: false })
        .eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandbox-invite-links", selectedOrg] });
      toast.success("Invite link revoked");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <>
      {/* Active Impersonation Banner */}
      {activeImpersonation && (
        <Card className="mb-6 border-amber-500/50 bg-amber-500/5">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Sandbox Impersonation Active
                </p>
                <p className="text-xs text-muted-foreground">
                  Viewing as <strong>{activeImpersonation.role}</strong> in{" "}
                  <strong>{activeImpersonation.orgName}</strong>
                </p>
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={exitSandbox}>
              <Square className="h-3.5 w-3.5 mr-1" />
              Exit Sandbox
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Sandbox Orgs List */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FlaskConical className="h-5 w-5" />
                Sandbox Tenants
              </CardTitle>
              <CardDescription>Isolated environments for role testing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Create new sandbox */}
              <div className="flex gap-2">
                <Input
                  placeholder="Sandbox name..."
                  value={newSandboxName}
                  onChange={(e) => setNewSandboxName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => createSandbox.mutate(newSandboxName)}
                  disabled={!newSandboxName.trim() || createSandbox.isPending}
                >
                  {createSandbox.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <Separator />

              {orgsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (sandboxOrgs ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No sandbox environments yet
                </p>
              ) : (
                <div className="space-y-2">
                  {(sandboxOrgs ?? []).map((org) => (
                    <div
                      key={org.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedOrg === org.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                      onClick={() => setSelectedOrg(org.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{org.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(org.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              resetSandbox.mutate(org.id);
                            }}
                            title="Reset sandbox"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSandbox.mutate(org.id);
                            }}
                            title="Delete sandbox"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Role Switcher + Sandbox Users */}
        <div className="lg:col-span-2">
          {!selectedOrg ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Shield className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Select a Sandbox</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Select a sandbox tenant from the left panel to view its personas and start role simulation.
                  All actions are logged and isolated from production data.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Sandbox Personas
                </CardTitle>
                <CardDescription>
                  Click "Enter" to simulate viewing the app as this role. All impersonation is server-side
                  via <code className="text-xs bg-muted px-1 rounded">set_sandbox_impersonation()</code> RPC.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Persona</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(sandboxUsers ?? []).map((su) => (
                        <TableRow key={su.id}>
                          <TableCell className="font-medium text-foreground">
                            {su.display_name}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={ROLE_COLORS[su.persona_role] ?? ""}
                            >
                              {su.persona_role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {su.email}
                          </TableCell>
                          <TableCell className="text-right">
                            {activeImpersonation?.userId === su.id ? (
                              <Button variant="destructive" size="sm" onClick={exitSandbox}>
                                <Square className="h-3.5 w-3.5 mr-1" />
                                Exit
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => enterSandbox(su)}
                                disabled={!!activeImpersonation}
                              >
                                <Play className="h-3.5 w-3.5 mr-1" />
                                Enter
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Seeding Summary */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Seeding Summary
                </CardTitle>
                <CardDescription>
                  Data seeded into this sandbox tenant across all modules.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {seedingLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : !seedingSummary?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No seeding data found. Run a simulation to populate this sandbox.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {seedingSummary.map((stat) => (
                      <div
                        key={stat.label}
                        className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-muted/30"
                      >
                        <div className="text-muted-foreground shrink-0">{stat.icon}</div>
                        <div className="min-w-0">
                          <p className="text-lg font-semibold text-foreground leading-tight">
                            {stat.count !== null ? stat.count : "—"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Shareable Link Section */}
            {selectedOrg && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Team Access Link
                  </CardTitle>
                  <CardDescription>
                    Generate a shareable link so your team can join this sandbox and test workflows using the personas above.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    onClick={() => generateLink.mutate(selectedOrg)}
                    disabled={generateLink.isPending}
                    className="w-full"
                  >
                    {generateLink.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : copiedLink ? (
                      <Check className="h-4 w-4 mr-2" />
                    ) : (
                      <Link2 className="h-4 w-4 mr-2" />
                    )}
                    {copiedLink ? "Link Copied!" : "Generate & Copy Invite Link"}
                  </Button>

                  {/* Active links */}
                  {(inviteLinks as any[])?.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs font-medium text-muted-foreground">Active Links</p>
                      {(inviteLinks as any[]).map((link: any) => (
                        <div key={link.id} className="flex items-center justify-between p-2 rounded border border-border text-xs">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <code className="text-muted-foreground truncate">
                              /sandbox/join/{link.token.slice(0, 12)}...
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  `${window.location.origin}/sandbox/join/${link.token}`
                                );
                                toast.success("Link copied");
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive h-6 text-xs"
                            onClick={() => revokeLink.mutate(link.id)}
                          >
                            Revoke
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function PlatformSandbox() {
  return (
    <MainLayout title="Sandbox Environment" subtitle="Create isolated sandbox tenants and simulate roles securely">
      <SandboxContent />
    </MainLayout>
  );
}
