import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Shield, Users, AlertCircle, Trash2, Search, Image, Upload, X,
  Settings as SettingsIcon, Palette, DollarSign, UserCheck, Link2,
  Cloud, CheckCircle2, Loader2, Save, History, Lock, UserX, ChevronDown,
  Clock, Mail, Building2, RefreshCw, ExternalLink, ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BulkUploadDialog } from "@/components/bulk-upload/BulkUploadDialog";
import { useUsersAndRolesBulkUpload } from "@/hooks/useBulkUpload";
import { BulkUploadHistory } from "@/components/bulk-upload/BulkUploadHistory";
import { useOnboardingCompliance, ComplianceData, useOrganizationRoles } from "@/hooks/useOnboardingCompliance";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useOrgBranding } from "@/hooks/useOrgBranding";
import { useOrgWeekendPolicy } from "@/hooks/useOrgWeekendPolicy";
// GBC-21 + GBC-20: Settings.tsx extraction starts here. Each Section
// component lives under src/components/settings/ and uses react-hook-form
// + zod (the deps are already in package.json). Migrate sections one at
// a time so any regression can be bisected.
import OrganizationInfoSection from "@/components/settings/OrganizationInfoSection";
import BrandingSection from "@/components/settings/BrandingSection";
import PayrollConfigSection from "@/components/settings/PayrollConfigSection";
import GoalCycleSection from "@/components/settings/GoalCycleSection";
import LeadershipRolesSection from "@/components/settings/LeadershipRolesSection";
import IntegrationsSection from "@/components/settings/IntegrationsSection";
import { useGoalCycleConfigs, useUpsertGoalCycleConfig, GoalCycleConfig } from "@/hooks/useGoalCycleConfig";
import { useIsAdminOrHR } from "@/hooks/useRoles";
import { ExitProcessingDialog } from "@/components/employees/ExitProcessingDialog";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { Target } from "lucide-react";
import { PrivacySecuritySection } from "@/components/settings/PrivacySecuritySection";
import { EmailAlertsConfigSection } from "@/components/settings/EmailAlertsConfigSection";
import { RolePermissionsTab } from "@/components/settings/RolePermissionsTab";

interface UserWithRole {
  profile_id: string;            // profiles.id — used to resolve manager_id
  user_id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  job_title: string | null;
  roles: string[];
  status: string;
  manager_id: string | null;     // references profiles.id of the manager
  pending_manager_email: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  hr: "HR",
  manager: "Manager",
  finance: "Finance",
  payroll: "Payroll",
  employee: "Employee",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  hr: "bg-primary/10 text-primary border-primary/20",
  manager: "bg-accent/50 text-accent-foreground border-accent",
  finance: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  payroll: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  employee: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  on_leave: "On Leave",
  pending_approval: "Pending Approval",
  exited: "Exited",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-500 border-green-500/20",
  inactive: "bg-red-500/10 text-red-500 border-red-500/20",
  on_leave: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  pending_approval: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  exited: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

// ─── Organization Info Section ────────────────────────────────────────────────
// OrganizationInfoSection extracted to src/components/settings/OrganizationInfoSection.tsx
// (GBC-21 + GBC-20). See import at top of file.

// BrandingSection extracted to src/components/settings/BrandingSection.tsx
// (GBC-21 + GBC-20). See import at top of file.

// PayrollConfigSection extracted to src/components/settings/PayrollConfigSection.tsx

// ─── Goal Cycle Configuration Section ─────────────────────────────────────────
// GoalCycleSection extracted to src/components/settings/GoalCycleSection.tsx

// ─── Leadership Roles Section ─────────────────────────────────────────────────
// LeadershipRolesSection extracted to src/components/settings/LeadershipRolesSection.tsx

// ─── Integrations Section ─────────────────────────────────────────────────────
// IntegrationsSection extracted to src/components/settings/IntegrationsSection.tsx

// ─── User Management Section (lazy-loaded) ────────────────────────────────────
function UserManagementSection() {
  const { user } = useAuth();
  const bulkUploadConfig = useUsersAndRolesBulkUpload();
  const { data: users = [], isLoading: loading, refetch: refreshUsers, error: usersError } = useQuery({
    queryKey: ["user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-roles", {
        body: { action: "list_users" },
      });
      if (error) {
        const msg = error.message || "Failed to load users";
        throw new Error(msg);
      }
      if (data?.error) {
        throw new Error(data.error);
      }
      return (data?.users || []) as UserWithRole[];
    },
    enabled: !!user,
    retry: 1,
  });

  // Surface errors to the user
  useEffect(() => {
    if (usersError) {
      toast.error(`User list failed: ${(usersError as Error).message}`);
    }
  }, [usersError]);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [actionUser, setActionUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Role picker state for the Pending Activation section (keyed by user_id)
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});
  // MS365 manager sync state
  const [isSyncing, setIsSyncing] = useState(false);

  // Manager reassignment dialog state
  const [managerDialogOpen, setManagerDialogOpen] = useState(false);
  const [managerDialogTarget, setManagerDialogTarget] = useState<UserWithRole | null>(null);
  const [managerDialogAction, setManagerDialogAction] = useState<"deactivate" | "delete" | null>(null);
  const [replacementManagerId, setReplacementManagerId] = useState<string>("");

  // Exit processing dialog state
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [exitTarget, setExitTarget] = useState<UserWithRole | null>(null);

  // Set manager dialog state
  const [assignManagerDialogOpen, setAssignManagerDialogOpen] = useState(false);
  const [setManagerTarget, setSetManagerTarget] = useState<UserWithRole | null>(null);
  const [newManagerUserId, setNewManagerUserId] = useState<string>("");
  const [updatingManager, setUpdatingManager] = useState(false);

  const qc = useQueryClient();

  const activeUsers = useMemo(
    () => users.filter((u) => u.status === "active" || u.status === "on_leave"),
    [users]
  );

  // Always visible regardless of search — shown in the Pending Activation banner
  const pendingUsers = useMemo(
    () => users.filter((u) => u.status === "pending_approval"),
    [users]
  );

  // Map from profiles.id → display name — used to resolve manager_id to a name
  const profileIdToName = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) {
      if (u.profile_id) map.set(u.profile_id, u.full_name || u.email || "Unknown");
    }
    return map;
  }, [users]);

  // Excludes pending_approval — those are handled in their own section above
  const filteredUsers = useMemo(() => {
    const nonPending = users.filter((u) => u.status !== "pending_approval");
    if (!searchQuery.trim()) return nonPending;
    const q = searchQuery.toLowerCase();
    return nonPending.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q) ||
        u.job_title?.toLowerCase().includes(q) ||
        u.status?.toLowerCase().includes(q) ||
        u.roles.some((r) => r.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    totalItems,
    paginatedItems: pagedUsers,
    from,
    to,
  } = usePagination(filteredUsers, 10);

  // Reset to page 1 whenever the search query changes
  useEffect(() => { setPage(1); }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingUser(userId);
    const { data, error } = await supabase.functions.invoke("manage-roles", {
      body: { action: "set_role", user_id: userId, role: newRole },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Failed to update role");
    } else {
      toast.success("Role updated successfully");
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      qc.invalidateQueries({ queryKey: ["session-context"] });
    }
    setUpdatingUser(null);
  };

  const handleStatusChange = async (u: UserWithRole, newVal: string) => {
    if (newVal === "no") {
      // Route through the existing confirmation dialog (handles report reassignment too)
      initiateDeactivateOrDelete(u, "deactivate");
    } else {
      // Reactivate — pass currentRole so the org-scoped user_roles row deleted
      // by deactivate_user is restored to whatever role the admin currently sees.
      const restoreRole = u.roles[0] || "employee";
      setUpdatingStatus(u.user_id);
      const { data, error } = await supabase.functions.invoke("manage-roles", {
        body: { action: "activate_user", user_id: u.user_id, role: restoreRole },
      });
      if (error || data?.error) {
        toast.error(data?.error || "Failed to reactivate user");
      } else {
        toast.success(`${u.full_name || u.email} reactivated`);
        qc.invalidateQueries({ queryKey: ["user-roles"] });
      qc.invalidateQueries({ queryKey: ["session-context"] });
      }
      setUpdatingStatus(null);
    }
  };

  const handleApproveUser = async (userId: string, role: string) => {
    setActionUser(userId);
    const { data, error } = await supabase.functions.invoke("manage-roles", {
      body: { action: "approve_user", user_id: userId, role },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Failed to approve user");
    } else {
      toast.success("User approved and activated");
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      qc.invalidateQueries({ queryKey: ["session-context"] });
    }
    setActionUser(null);
  };

  // Always show the confirm dialog before deactivating/deleting.
  // The optional reassignment selector handles users with or without direct reports.
  const initiateDeactivateOrDelete = (targetUser: UserWithRole, action: "deactivate" | "delete") => {
    setManagerDialogTarget(targetUser);
    setManagerDialogAction(action);
    setReplacementManagerId("");
    setManagerDialogOpen(true);
  };

  const initiateExit = (targetUser: UserWithRole) => {
    setExitTarget(targetUser);
    setExitDialogOpen(true);
  };

  const executeDeactivateOrDelete = async () => {
    if (!managerDialogTarget || !managerDialogAction) return;
    const userId = managerDialogTarget.user_id;
    setActionUser(userId);
    setManagerDialogOpen(false);

    const actionName = managerDialogAction === "deactivate" ? "deactivate_user" : "delete_user";
    const { data, error } = await supabase.functions.invoke("manage-roles", {
      body: {
        action: actionName,
        user_id: userId,
        replacement_manager_id: replacementManagerId || undefined,
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || `Failed to ${managerDialogAction} user`);
    } else {
      if (managerDialogAction === "deactivate") {
        toast.success(`${managerDialogTarget.full_name || managerDialogTarget.email} has been deactivated`);
      } else {
        toast.success(`${managerDialogTarget.full_name || managerDialogTarget.email} has been removed`);
      }
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      qc.invalidateQueries({ queryKey: ["session-context"] });
    }

    setActionUser(null);
    setManagerDialogTarget(null);
    setManagerDialogAction(null);
  };

  const handleSyncManagers = async () => {
    setIsSyncing(true);
    const { data, error } = await supabase.functions.invoke("ms365-sync", {
      body: { action: "sync_managers" },
    });
    if (error || data?.error) {
      // data?.error covers versions where non-2xx body is returned in data.
      // For versions where it's null, read the response body from error.context.
      let msg: string = data?.error ?? "";
      if (!msg && error) {
        try {
          const body = await (error as any).context?.json?.();
          msg = body?.error ?? "";
        } catch {
          // context already consumed or not JSON
        }
        if (!msg) msg = error.message;
      }
      toast.error(msg || "Sync failed. Check Supabase function logs for details.");
    } else {
      const { synced = 0, errors = [] } = data;
      if (errors.length > 0) {
        toast.warning(`Sync complete: ${synced} updated, ${errors.length} error(s). Check function logs.`);
      } else {
        toast.success(`Sync complete — ${synced} manager assignment${synced !== 1 ? "s" : ""} updated from Microsoft 365.`);
      }
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      qc.invalidateQueries({ queryKey: ["session-context"] });
    }
    setIsSyncing(false);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Manager Reassignment Dialog (shown before deactivate/delete) */}
      <Dialog open={managerDialogOpen} onOpenChange={setManagerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {managerDialogAction === "deactivate" ? "Deactivate" : "Remove"}{" "}
              {managerDialogTarget?.full_name || managerDialogTarget?.email}
            </DialogTitle>
            <DialogDescription>
              {managerDialogAction === "deactivate"
                ? "This user will lose all system access immediately. Their data and history will be preserved. If they manage other employees, reassign those reports now."
                : "This removes the user's login access. Their work history is retained but they cannot be recovered. If they manage other employees, reassign those reports now."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Reassign direct reports to (optional)</Label>
            <Select value={replacementManagerId} onValueChange={setReplacementManagerId}>
              <SelectTrigger>
                <SelectValue placeholder="Leave reports without manager..." />
              </SelectTrigger>
              <SelectContent>
                {activeUsers
                  .filter((u) => u.user_id !== managerDialogTarget?.user_id)
                  .map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManagerDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={executeDeactivateOrDelete}
              disabled={!!actionUser}
            >
              {managerDialogAction === "deactivate" ? (
                <><UserX className="h-4 w-4 mr-2" />Deactivate</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" />Remove</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manager Info Dialog — points admin to MS365 instead of manual override */}
      <Dialog open={assignManagerDialogOpen} onOpenChange={setAssignManagerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manager assignment for {setManagerTarget?.full_name || setManagerTarget?.email}</DialogTitle>
            <DialogDescription>
              Manager assignments are controlled by your Microsoft 365 organisation chart and synced automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            {setManagerTarget?.manager_id && profileIdToName.get(setManagerTarget.manager_id) ? (
              <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
                Current manager: <span className="font-medium">{profileIdToName.get(setManagerTarget.manager_id)}</span>
              </div>
            ) : setManagerTarget?.pending_manager_email ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
                Manager assigned in MS365 as <span className="font-medium">{setManagerTarget.pending_manager_email}</span> — will resolve once they log in, or click <strong>Sync from MS365</strong>.
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                No manager assigned in Microsoft 365.
              </div>
            )}
            <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-700 space-y-1">
              <p className="font-medium">To change this employee's manager:</p>
              <ol className="list-decimal list-inside space-y-1 text-blue-600">
                <li>Open the Microsoft 365 Admin Center</li>
                <li>Go to <strong>Users → Active users</strong></li>
                <li>Select the employee and edit their profile</li>
                <li>Update the <strong>Manager</strong> field</li>
                <li>Return here and click <strong>Sync from MS365</strong></li>
              </ol>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAssignManagerDialogOpen(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => window.open("https://admin.microsoft.com/Adminportal/Home#/users", "_blank")}
            >
              <ExternalLink className="h-4 w-4" />
              Open MS365 Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Management
            </CardTitle>
            <CardDescription>
              Employees appear here after signing in with Microsoft 365. Activate them and assign a role to grant access.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncManagers}
              disabled={isSyncing}
              className="gap-2"
              title="Pull latest manager assignments from Microsoft 365 org chart"
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {isSyncing ? "Syncing…" : "Sync from MS365"}
            </Button>
            <BulkUploadDialog config={bulkUploadConfig} />
          </div>
        </CardHeader>
        <CardContent>
          {/* ── Pending Activation Banner ── */}
          {pendingUsers.length > 0 && (
            <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-amber-600">
                  Pending Activation ({pendingUsers.length})
                </h3>
              </div>
              <div className="space-y-2">
                {pendingUsers.map((u) => {
                  const selectedRole = pendingRoles[u.user_id] ?? (u.roles[0] || "employee");
                  return (
                    <div
                      key={u.user_id}
                      className="flex items-center justify-between gap-4 rounded-md border border-amber-500/20 bg-background p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {u.full_name || "Unnamed User"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        {u.department && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {u.department}{u.job_title ? ` · ${u.job_title}` : ""}
                          </p>
                        )}
                        {u.manager_id && profileIdToName.get(u.manager_id) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Reports to: {profileIdToName.get(u.manager_id)}
                          </p>
                        )}
                        {!u.manager_id && u.pending_manager_email && (
                          <p className="text-xs text-yellow-600 mt-0.5">
                            Manager pending sync: {u.pending_manager_email}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={selectedRole}
                          onValueChange={(val) =>
                            setPendingRoles((prev) => ({ ...prev, [u.user_id]: val }))
                          }
                          disabled={actionUser === u.user_id}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="finance">Finance</SelectItem>
                            <SelectItem value="hr">HR</SelectItem>
                            <SelectItem value="payroll">Payroll</SelectItem>
                            <SelectItem value="employee">Employee</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                          disabled={actionUser === u.user_id}
                          onClick={() => handleApproveUser(u.user_id, selectedRole)}
                        >
                          {actionUser === u.user_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <UserCheck className="h-3 w-3 mr-1" />
                              Activate
                            </>
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              disabled={actionUser === u.user_id}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => initiateDeactivateOrDelete(u, "delete")}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove permanently
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, department, role, or status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="space-y-3">
            {filteredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {users.length === 0
                  ? "No users yet. Employees will appear here as they sign in with Microsoft 365."
                  : "No users match your search."}
              </p>
            ) : (
              pagedUsers.map((u) => {
                const currentRole = u.roles[0] || "employee";
                const isSelf = u.user_id === user?.id;
                const isPending = u.status === "pending_approval";
                const isInactive = u.status === "inactive";
                // Toggle only handles the active ↔ inactive transition. on_leave
                // and exited are HR-lifecycle states managed elsewhere; rendering
                // a Yes/No here would silently overwrite them on selection.
                const canEditStatus = u.status === "active" || u.status === "inactive";

                return (
                  <div
                    key={u.user_id}
                    className="flex items-start justify-between gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium truncate">
                          {u.full_name || "Unnamed User"}
                        </p>
                        {isSelf && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            You
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-xs shrink-0 ${STATUS_COLORS[u.status] || STATUS_COLORS.active}`}
                        >
                          {isPending && <Clock className="h-3 w-3 mr-1 inline" />}
                          {STATUS_LABELS[u.status] || u.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {u.email}
                      </p>
                      {u.department && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {u.department} {u.job_title ? `· ${u.job_title}` : ""}
                        </p>
                      )}
                      {u.manager_id && profileIdToName.get(u.manager_id) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Reports to: {profileIdToName.get(u.manager_id)}
                        </p>
                      )}
                      {!u.manager_id && u.pending_manager_email && (
                        <p className="text-xs text-yellow-600 mt-0.5">
                          Manager pending sync: {u.pending_manager_email}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
                      {/* Approve button for pending users */}
                      {isPending && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
                          disabled={actionUser === u.user_id}
                          onClick={() => handleApproveUser(u.user_id, currentRole)}
                        >
                          {actionUser === u.user_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <UserCheck className="h-3 w-3 mr-1" />
                          )}
                          Approve
                        </Button>
                      )}

                      {/* User Status — Yes / No (only for active/inactive; on_leave & exited keep status badge only) */}
                      {canEditStatus && (
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                            User Status
                          </span>
                          <Select
                            value={isInactive ? "no" : "yes"}
                            onValueChange={(val) => handleStatusChange(u, val)}
                            disabled={isSelf || updatingStatus === u.user_id}
                          >
                            <SelectTrigger className="w-[76px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes">Yes</SelectItem>
                              <SelectItem value="no">No</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Role */}
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                          Role
                        </span>
                        <Select
                          value={currentRole}
                          onValueChange={(val) => handleRoleChange(u.user_id, val)}
                          disabled={isSelf || updatingUser === u.user_id}
                        >
                          <SelectTrigger className="w-[120px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="finance">Finance</SelectItem>
                            <SelectItem value="hr">HR</SelectItem>
                            <SelectItem value="payroll">Payroll</SelectItem>
                            <SelectItem value="employee">Employee</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Manager info button — opens dialog with MS365 guidance */}
                      {!isSelf && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Manager info"
                          onClick={() => {
                            setSetManagerTarget(u);
                            setAssignManagerDialogOpen(true);
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}

                      {/* Delete dropdown */}
                      {!isSelf && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive self-end"
                              disabled={actionUser === u.user_id}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-orange-600 focus:text-orange-600"
                              onClick={() => initiateExit(u)}
                            >
                              <UserX className="h-4 w-4 mr-2" />
                              Exit Employee
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => initiateDeactivateOrDelete(u, "delete")}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove permanently
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {totalPages > 1 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              totalItems={totalItems}
              from={from}
              to={to}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </CardContent>
      </Card>

      <ExitProcessingDialog
        open={exitDialogOpen}
        onOpenChange={setExitDialogOpen}
        targetUser={exitTarget ? {
          user_id: exitTarget.user_id,
          profile_id: exitTarget.profile_id,
          full_name: exitTarget.full_name,
          email: exitTarget.email,
        } : null}
        activeUsers={activeUsers.map((u) => ({
          user_id: u.user_id,
          profile_id: u.profile_id,
          full_name: u.full_name,
          email: u.email,
        }))}
        onComplete={() => {
          qc.invalidateQueries({ queryKey: ["user-roles"] });
      qc.invalidateQueries({ queryKey: ["session-context"] });
        }}
      />
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
// Access is enforced at the route level by AdminRoute in App.tsx.
// No client-side role check needed here.
export default function Settings() {
  const [activeTab, setActiveTab] = useState("organization");

  return (
    <MainLayout title="Settings">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-1">Manage your organization's details, branding, payroll, roles, email alerts, integrations, and user access</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="organization" className="gap-1.5">
              <Building2 className="h-4 w-4" />
              Organization
            </TabsTrigger>
            <TabsTrigger value="general" className="gap-1.5">
              <Palette className="h-4 w-4" />
              Branding
            </TabsTrigger>
            <TabsTrigger value="payroll" className="gap-1.5">
              <DollarSign className="h-4 w-4" />
              Payroll
            </TabsTrigger>
            <TabsTrigger value="leadership" className="gap-1.5">
              <UserCheck className="h-4 w-4" />
              Leadership
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1.5">
              <Link2 className="h-4 w-4" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="goals" className="gap-1.5">
              <Target className="h-4 w-4" />
              Goals
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="upload-history" className="gap-1.5">
              <History className="h-4 w-4" />
              Upload History
            </TabsTrigger>
            <TabsTrigger value="email-alerts" className="gap-1.5">
              <Mail className="h-4 w-4" />
              Email Alerts
            </TabsTrigger>
            <TabsTrigger value="privacy" className="gap-1.5">
              <Lock className="h-4 w-4" />
              Privacy & Security
            </TabsTrigger>
            <TabsTrigger value="roles" className="gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              Roles & Permissions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="organization" className="mt-6">
            <OrganizationInfoSection />
          </TabsContent>

          <TabsContent value="general" className="mt-6">
            <BrandingSection />
          </TabsContent>

          <TabsContent value="payroll" className="mt-6">
            <PayrollConfigSection />
          </TabsContent>

          <TabsContent value="leadership" className="mt-6">
            <LeadershipRolesSection />
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
            <IntegrationsSection />
          </TabsContent>

          <TabsContent value="goals" className="mt-6">
            <GoalCycleSection />
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <UserManagementSection />
          </TabsContent>

          <TabsContent value="upload-history" className="mt-6">
              <BulkUploadHistory />
          </TabsContent>

          <TabsContent value="email-alerts" className="mt-6">
            <EmailAlertsConfigSection />
          </TabsContent>

          <TabsContent value="privacy" className="mt-6">
            <PrivacySecuritySection />
          </TabsContent>

          <TabsContent value="roles" className="mt-6">
            <RolePermissionsTab />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
