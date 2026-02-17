import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, Users, AlertCircle } from "lucide-react";
import { BulkUploadDialog } from "@/components/bulk-upload/BulkUploadDialog";
import { useRolesBulkUpload } from "@/hooks/useBulkUpload";
import { BulkUploadHistory } from "@/components/bulk-upload/BulkUploadHistory";

interface UserWithRole {
  user_id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  job_title: string | null;
  roles: string[];
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  hr: "HR",
  manager: "Manager",
  finance: "Finance",
  employee: "Employee",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  hr: "bg-primary/10 text-primary border-primary/20",
  manager: "bg-accent/50 text-accent-foreground border-accent",
  finance: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  employee: "bg-muted text-muted-foreground border-border",
};

export default function Settings() {
  const { user } = useAuth();
  const bulkUploadConfig = useRolesBulkUpload();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);

  useEffect(() => {
    checkAdminAndLoad();
  }, [user]);

  const checkAdminAndLoad = async () => {
    if (!user) return;

    // Check if current user is admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    setIsAdmin(!!roleData);

    if (roleData) {
      await loadUsers();
    }
    setLoading(false);
  };

  const loadUsers = async () => {
    const { data, error } = await supabase.functions.invoke("manage-roles", {
      body: { action: "list_users" },
    });

    if (error || data?.error) {
      toast.error(data?.error || "Failed to load users");
      return;
    }

    setUsers(data.users || []);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingUser(userId);
    const { data, error } = await supabase.functions.invoke("manage-roles", {
      body: { action: "set_role", user_id: userId, role: newRole },
    });

    if (error || data?.error) {
      toast.error(data?.error || "Failed to update role");
    } else {
      toast.success("Role updated successfully");
      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, roles: [newRole] } : u))
      );
    }
    setUpdatingUser(null);
  };

  if (loading) {
    return (
      <MainLayout title="Settings">
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) {
    return (
      <MainLayout title="Settings">
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md w-full">
            <CardContent className="flex flex-col items-center gap-4 pt-6">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <div className="text-center">
                <h3 className="text-lg font-semibold">Access Restricted</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Only administrators can access settings.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Settings">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-1">Manage user roles and access permissions</p>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Role Management
              </CardTitle>
              <CardDescription>
                Assign roles to control what each user can access. Changes take effect on next sign-in.
              </CardDescription>
            </div>
            <BulkUploadDialog config={bulkUploadConfig} />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {users.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No users found. Users will appear here after they sign in.
                </p>
              ) : (
                users.map((u) => {
                  const currentRole = u.roles[0] || "employee";
                  const isSelf = u.user_id === user?.id;

                  return (
                    <div
                      key={u.user_id}
                      className="flex items-center justify-between gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">
                            {u.full_name || "Unnamed User"}
                          </p>
                          {isSelf && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              You
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {u.email}
                        </p>
                        {u.department && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {u.department} {u.job_title ? `· ${u.job_title}` : ""}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <Badge
                          variant="outline"
                          className={ROLE_COLORS[currentRole] || ROLE_COLORS.employee}
                        >
                          {ROLE_LABELS[currentRole] || currentRole}
                        </Badge>

                        <Select
                          value={currentRole}
                          onValueChange={(val) => handleRoleChange(u.user_id, val)}
                          disabled={isSelf || updatingUser === u.user_id}
                        >
                          <SelectTrigger className="w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="finance">Finance</SelectItem>
                            <SelectItem value="hr">HR</SelectItem>
                            <SelectItem value="employee">Employee</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bulk Upload History */}
        <BulkUploadHistory module="roles" />
      </div>
    </MainLayout>
  );
}
