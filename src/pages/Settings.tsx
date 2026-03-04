import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Shield, Users, AlertCircle, Trash2, Search, Image, Upload, X,
  Settings as SettingsIcon, Palette, DollarSign, UserCheck, Link2,
  Cloud, CheckCircle2, Loader2, Save, History,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { BulkUploadDialog } from "@/components/bulk-upload/BulkUploadDialog";
import { useUsersAndRolesBulkUpload } from "@/hooks/useBulkUpload";
import { BulkUploadHistory } from "@/components/bulk-upload/BulkUploadHistory";
import { useOnboardingCompliance, ComplianceData, useOrganizationRoles } from "@/hooks/useOnboardingCompliance";
import { useUserOrganization } from "@/hooks/useUserOrganization";

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
  const { compliance, upsert } = useOnboardingCompliance();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"logo" | "favicon" | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // Local state for compliance-stored branding fields
  const [brandColor, setBrandColor] = useState(compliance?.brand_color || "#d6336c");
  const [signatoryName, setSignatoryName] = useState(compliance?.authorized_signatory_name || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (compliance) {
      setBrandColor(compliance.brand_color || "#d6336c");
      setSignatoryName(compliance.authorized_signatory_name || "");
    }
  }, [compliance]);

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

  async function handleSaveBranding() {
    setSaving(true);
    try {
      await upsert.mutateAsync({ brand_color: brandColor, authorized_signatory_name: signatoryName });
      toast.success("Branding settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Logo & Favicon
          </CardTitle>
          <CardDescription>
            Upload your company logo and favicon. These appear on invoices, documents, and the browser tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
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
                  <Button size="sm" variant="outline" disabled={uploading === "logo"} onClick={() => logoInputRef.current?.click()}>
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
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload("logo", f); e.target.value = ""; }} />
            </div>
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
                  <Button size="sm" variant="outline" disabled={uploading === "favicon"} onClick={() => faviconInputRef.current?.click()}>
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
              <input ref={faviconInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload("favicon", f); e.target.value = ""; }} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Brand Identity
          </CardTitle>
          <CardDescription>
            Customize your brand color and authorized signatory for official documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Brand Color</Label>
              <p className="text-xs text-muted-foreground">Used on invoices, quotes, and document headers.</p>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-9 w-12 rounded border border-border cursor-pointer"
                />
                <Input
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  placeholder="#d6336c"
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Authorized Signatory Name</Label>
              <p className="text-xs text-muted-foreground">Printed on official documents.</p>
              <Input
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
                placeholder="Name on official documents"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSaveBranding} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Payroll Configuration Section ────────────────────────────────────────────
function PayrollConfigSection() {
  const { compliance, upsert } = useOnboardingCompliance();
  const { data: org } = useUserOrganization();
  const [local, setLocal] = useState({
    payroll_enabled: false,
    payroll_frequency: "",
    pf_applicable: false,
    esi_applicable: false,
    professional_tax_applicable: false,
    gratuity_applicable: false,
    weekend_policy: "sat_sun",
  });
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (compliance && !initialized) {
      setLocal((prev) => ({
        ...prev,
        payroll_enabled: compliance.payroll_enabled ?? false,
        payroll_frequency: compliance.payroll_frequency || "",
        pf_applicable: compliance.pf_applicable ?? false,
        esi_applicable: compliance.esi_applicable ?? false,
        professional_tax_applicable: compliance.professional_tax_applicable ?? false,
        gratuity_applicable: compliance.gratuity_applicable ?? false,
      }));
      setInitialized(true);
    }
  }, [compliance, initialized]);

  // Fetch weekend_policy from organizations table
  useEffect(() => {
    if (org?.organizationId) {
      supabase
        .from("organizations")
        .select("weekend_policy")
        .eq("id", org.organizationId)
        .maybeSingle()
        .then(({ data }) => {
          if (data && (data as any).weekend_policy) {
            setLocal((prev) => ({ ...prev, weekend_policy: (data as any).weekend_policy }));
          }
        });
    }
  }, [org?.organizationId]);

  async function handleSave() {
    setSaving(true);
    try {
      const { weekend_policy, ...complianceData } = local;
      await upsert.mutateAsync(complianceData);
      // Save weekend_policy to organizations table
      if (org?.organizationId) {
        await supabase
          .from("organizations")
          .update({ weekend_policy } as any)
          .eq("id", org.organizationId);
      }
      toast.success("Payroll configuration saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const flags = [
    { key: "pf_applicable" as const, label: "Provident Fund (PF)", desc: "EPF contributions for eligible employees" },
    { key: "esi_applicable" as const, label: "ESI", desc: "Employee State Insurance deductions" },
    { key: "professional_tax_applicable" as const, label: "Professional Tax", desc: "State professional tax deduction" },
    { key: "gratuity_applicable" as const, label: "Gratuity", desc: "Gratuity provisioning for eligible employees" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Payroll Configuration
          </CardTitle>
          <CardDescription>
            Manage payroll processing settings and statutory compliance flags.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <Label className="text-sm font-medium">Enable Payroll</Label>
              <p className="text-xs text-muted-foreground">Turn on payroll processing for this organization</p>
            </div>
            <Switch
              checked={local.payroll_enabled}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, payroll_enabled: v }))}
            />
          </div>

          {local.payroll_enabled && (
            <>
              <div className="space-y-1.5">
                <Label>Payroll Frequency</Label>
                <Select value={local.payroll_frequency} onValueChange={(v) => setLocal((p) => ({ ...p, payroll_frequency: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {flags.map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <Label className="text-sm">{label}</Label>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch
                      checked={local[key]}
                      onCheckedChange={(v) => setLocal((p) => ({ ...p, [key]: v }))}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Leadership Roles Section ─────────────────────────────────────────────────
function LeadershipRolesSection() {
  const { roles, isLoading, upsertRole } = useOrganizationRoles();
  const [editing, setEditing] = useState<Record<string, { name: string; email: string }>>({});

  const ROLES = [
    { type: "CEO", label: "CEO / Managing Director" },
    { type: "Finance", label: "Finance Head / CFO" },
    { type: "HR", label: "HR Head / CHRO" },
    { type: "Compliance", label: "Compliance Officer" },
  ];

  const getExisting = (type: string) => roles.find((r: any) => r.role_type === type);

  const handleSave = async (type: string) => {
    const val = editing[type];
    if (!val?.name?.trim() || !val?.email?.trim()) {
      toast.error("Name and email are required");
      return;
    }
    try {
      await upsertRole.mutateAsync({ role_type: type, name: val.name, email: val.email });
      toast.success(`${type} role saved`);
      setEditing((prev) => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" />
          Leadership Roles
        </CardTitle>
        <CardDescription>
          Assign key leadership roles for your organization. These are displayed on official documents and compliance reports.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {ROLES.map(({ type, label }) => {
          const existing = getExisting(type);
          const isEditing = type in editing;

          if (existing && !isEditing) {
            return (
              <div key={type} className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{existing.name} — {existing.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing((p) => ({ ...p, [type]: { name: existing.name, email: existing.email } }))}
                  >
                    Edit
                  </Button>
                </div>
              </div>
            );
          }

          const val = editing[type] || { name: "", email: "" };
          return (
            <div key={type} className="rounded-lg border border-border p-4 space-y-2">
              <Label className="text-sm font-medium">{label}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  placeholder="Full name"
                  value={val.name}
                  onChange={(e) => setEditing((p) => ({ ...p, [type]: { ...val, name: e.target.value } }))}
                />
                <Input
                  placeholder="Email"
                  type="email"
                  value={val.email}
                  onChange={(e) => setEditing((p) => ({ ...p, [type]: { ...val, email: e.target.value } }))}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleSave(type)} disabled={upsertRole.isPending}>
                  {upsertRole.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                  Save
                </Button>
                {existing && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing((p) => { const n = { ...p }; delete n[type]; return n; })}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Integrations Section ─────────────────────────────────────────────────────
function IntegrationsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Integrations
        </CardTitle>
        <CardDescription>
          Connect third-party services to enable SSO, calendar sync, and more.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[hsl(210,80%,50%)]/10 flex items-center justify-center">
              <Cloud className="h-5 w-5 text-[hsl(210,80%,50%)]" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Microsoft 365</p>
              <p className="text-xs text-muted-foreground">Azure AD SSO, Outlook, Teams</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">Coming Soon</Badge>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[hsl(217,89%,61%)]/10 flex items-center justify-center">
              <Link2 className="h-5 w-5 text-[hsl(217,89%,61%)]" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Google Workspace</p>
              <p className="text-xs text-muted-foreground">Google SSO, Calendar, Drive</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">Coming Soon</Badge>
        </div>

        <p className="text-xs text-muted-foreground italic">
          OAuth integration will require server-side token exchange. Configuration will be available when these integrations launch.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── User Management Section (lazy-loaded) ────────────────────────────────────
function UserManagementSection() {
  const { user } = useAuth();
  const bulkUploadConfig = useUsersAndRolesBulkUpload();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
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
    if (!user) return;
    (async () => {
      const { data } = await supabase.functions.invoke("manage-roles", {
        body: { action: "list_users" },
      });
      if (data?.users) setUsers(data.users);
      setLoading(false);
    })();
  }, [user]);

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
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function Settings() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [activeTab, setActiveTab] = useState("general");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
      setCheckingAdmin(false);
    })();
  }, [user]);

  if (checkingAdmin) {
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
          <p className="text-muted-foreground mt-1">Manage your organization's branding, payroll, roles, integrations, and user access</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
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
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="upload-history" className="gap-1.5">
              <History className="h-4 w-4" />
              Upload History
            </TabsTrigger>
          </TabsList>

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

          <TabsContent value="users" className="mt-6">
            <UserManagementSection />
          </TabsContent>

          <TabsContent value="upload-history" className="mt-6">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Upload History
                  </CardTitle>
                  <CardDescription>
                    Track all bulk upload activity across modules — users, roles, attendance, payroll, and more.
                  </CardDescription>
                </CardHeader>
              </Card>
              <BulkUploadHistory />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
