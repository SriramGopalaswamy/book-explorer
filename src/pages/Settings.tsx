import { useState, useEffect, useMemo, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, Users, AlertCircle, Trash2, Search, Image, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BulkUploadDialog } from "@/components/bulk-upload/BulkUploadDialog";
import { useUsersAndRolesBulkUpload } from "@/hooks/useBulkUpload";
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

// ─── Branding Section ─────────────────────────────────────────────────────────
function BrandingSection() {
  const { user } = useAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"logo" | "favicon" | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile?.organization_id) return;
      setOrgId(profile.organization_id);

      const { data: settings } = await supabase
        .from("organization_settings" as any)
        .select("logo_url, favicon_url")
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (settings) {
        setLogoUrl((settings as any).logo_url);
        setFaviconUrl((settings as any).favicon_url);
      }
    })();
  }, [user]);

  async function handleUpload(type: "logo" | "favicon", file: File) {
    if (!orgId || !user) return;
    setUploading(type);
    try {
      const ext = file.name.split(".").pop();
      const path = `${orgId}/${type}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("tenant-branding")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from("tenant-branding")
        .getPublicUrl(path);

      const url = publicData.publicUrl + "?v=" + Date.now();

      // Upsert organization_settings
      const { error: dbError } = await supabase
        .from("organization_settings" as any)
        .upsert(
          {
            organization_id: orgId,
            [type === "logo" ? "logo_url" : "favicon_url"]: url,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "organization_id" }
        );
      if (dbError) throw dbError;

      if (type === "logo") setLogoUrl(url);
      else setFaviconUrl(url);
      toast.success(`${type === "logo" ? "Logo" : "Favicon"} updated successfully`);
    } catch (err: any) {
      toast.error(`Failed to upload: ${err.message}`);
    } finally {
      setUploading(null);
    }
  }

  async function handleRemove(type: "logo" | "favicon") {
    if (!orgId) return;
    await supabase
      .from("organization_settings" as any)
      .update({ [type === "logo" ? "logo_url" : "favicon_url"]: null, updated_at: new Date().toISOString() } as any)
      .eq("organization_id", orgId);

    if (type === "logo") setLogoUrl(null);
    else setFaviconUrl(null);
    toast.success(`${type === "logo" ? "Logo" : "Favicon"} removed`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          Organization Branding
        </CardTitle>
        <CardDescription>
          Upload your company logo and favicon. These will appear on invoices, documents, and the browser tab.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Regular Logo */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Company Logo</Label>
            <p className="text-xs text-muted-foreground">Used on invoices, quotes, payslips, and the sidebar. Recommended: 400×100px PNG/SVG.</p>
            <div className="flex items-center gap-4">
              <div className="h-20 w-40 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">No logo</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={uploading === "logo"}
                  onClick={() => logoInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  {uploading === "logo" ? "Uploading…" : "Upload"}
                </Button>
                {logoUrl && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRemove("logo")}>
                    <X className="h-4 w-4 mr-1" /> Remove
                  </Button>
                )}
              </div>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload("logo", f);
                e.target.value = "";
              }}
            />
          </div>

          {/* Favicon / Short Logo */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Short Logo / Favicon</Label>
            <p className="text-xs text-muted-foreground">Used as browser favicon and in compact UI areas. Recommended: 512×512px square PNG.</p>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden">
                {faviconUrl ? (
                  <img src={faviconUrl} alt="Favicon" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground text-center">No icon</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={uploading === "favicon"}
                  onClick={() => faviconInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  {uploading === "favicon" ? "Uploading…" : "Upload"}
                </Button>
                {faviconUrl && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRemove("favicon")}>
                    <X className="h-4 w-4 mr-1" /> Remove
                  </Button>
                )}
              </div>
            </div>
            <input
              ref={faviconInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload("favicon", f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const bulkUploadConfig = useUsersAndRolesBulkUpload();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q) ||
        u.job_title?.toLowerCase().includes(q) ||
        u.roles.some((r) => r.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  useEffect(() => {
    checkAdminAndLoad();
  }, [user]);

  const checkAdminAndLoad = async () => {
    if (!user) return;

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

  const handleDeleteUser = async (userId: string, email: string | null) => {
    setDeletingUser(userId);
    const { data, error } = await supabase.functions.invoke("manage-roles", {
      body: { action: "delete_user", user_id: userId },
    });

    if (error || data?.error) {
      toast.error(data?.error || "Failed to delete user");
    } else {
      toast.success(`User ${email || "unknown"} deleted successfully`);
      setUsers((prev) => prev.filter((u) => u.user_id !== userId));
    }
    setDeletingUser(null);
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
          <p className="text-muted-foreground mt-1">Manage organization branding, user roles and access permissions</p>
        </div>

        {/* Organization Branding */}
        <BrandingSection />

        {/* Bulk Add Users & Roles */}

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
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, department, or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="space-y-3">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {users.length === 0
                    ? "No users found. Users will appear here after they sign in."
                    : "No users match your search."}
                </p>
              ) : (
                filteredUsers.map((u) => {
                  const currentRole = u.roles[0] || "employee";
                  const isSelf = u.user_id === user?.id;
                  const isProtected = u.email?.toLowerCase() === "sriram@grx10.com";

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
                          {isProtected && (
                            <Badge variant="outline" className="text-xs shrink-0 border-primary/30 text-primary">
                              Protected
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

                        {!isSelf && !isProtected && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                disabled={deletingUser === u.user_id}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete User</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete <strong>{u.full_name || u.email}</strong>? This will permanently remove their account, profile, and all associated roles. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => handleDeleteUser(u.user_id, u.email)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <BulkUploadHistory module="users" />
      </div>
    </MainLayout>
  );
}
