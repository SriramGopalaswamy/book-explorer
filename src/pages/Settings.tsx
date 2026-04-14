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
  Clock, Mail, Building2, RefreshCw, ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BulkUploadDialog } from "@/components/bulk-upload/BulkUploadDialog";
import { useUsersAndRolesBulkUpload } from "@/hooks/useBulkUpload";
import { BulkUploadHistory } from "@/components/bulk-upload/BulkUploadHistory";
import { useOnboardingCompliance, ComplianceData, useOrganizationRoles } from "@/hooks/useOnboardingCompliance";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useGoalCycleConfigs, useUpsertGoalCycleConfig, GoalCycleConfig } from "@/hooks/useGoalCycleConfig";
import { useIsAdminOrHR } from "@/hooks/useRoles";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { Target } from "lucide-react";
import { PrivacySecuritySection } from "@/components/settings/PrivacySecuritySection";
import { EmailAlertsConfigSection } from "@/components/settings/EmailAlertsConfigSection";

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
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-500 border-green-500/20",
  inactive: "bg-red-500/10 text-red-500 border-red-500/20",
  on_leave: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  pending_approval: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

// ─── Organization Info Section ────────────────────────────────────────────────
function OrganizationInfoSection() {
  const { compliance, upsert } = useOnboardingCompliance();
  const [local, setLocal] = useState({ legal_name: "", registered_address: "", state: "", pincode: "" });
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (compliance && !initialized) {
      setLocal({
        legal_name: compliance.legal_name || "",
        registered_address: compliance.registered_address || "",
        state: compliance.state || "",
        pincode: compliance.pincode || "",
      });
      setInitialized(true);
    }
  }, [compliance, initialized]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsert.mutateAsync({
        legal_name: local.legal_name,
        registered_address: local.registered_address,
        state: local.state,
        pincode: local.pincode,
      });
      toast.success("Organization info saved");
    } catch {
      toast.error("Failed to save organization info");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Organization Details
        </CardTitle>
        <CardDescription>
          This information appears on payslips and official documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="legal_name">Legal Name</Label>
            <Input
              id="legal_name"
              value={local.legal_name}
              onChange={(e) => setLocal((p) => ({ ...p, legal_name: e.target.value }))}
              placeholder="e.g. Acme Technologies Pvt Ltd"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              value={local.state}
              onChange={(e) => setLocal((p) => ({ ...p, state: e.target.value }))}
              placeholder="e.g. Karnataka"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="registered_address">Registered Address</Label>
          <Textarea
            id="registered_address"
            value={local.registered_address}
            onChange={(e) => setLocal((p) => ({ ...p, registered_address: e.target.value }))}
            placeholder="Full registered office address"
            rows={3}
          />
        </div>
        <div className="space-y-1.5 sm:w-1/3">
          <Label htmlFor="pincode">Pincode</Label>
          <Input
            id="pincode"
            value={local.pincode}
            onChange={(e) => setLocal((p) => ({ ...p, pincode: e.target.value }))}
            placeholder="e.g. 560001"
            maxLength={6}
          />
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

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
        .from("organization_settings")
        .select("logo_url, favicon_url")
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (settings) {
        setLogoUrl(settings.logo_url);
        setFaviconUrl(settings.favicon_url);
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
        .from("organization_settings")
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
      .from("organization_settings")
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

              <div className="space-y-1.5">
                <Label>Weekend Policy</Label>
                <p className="text-xs text-muted-foreground">Controls how working days are calculated for payroll</p>
                <Select value={local.weekend_policy} onValueChange={(v) => setLocal((p) => ({ ...p, weekend_policy: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select weekend policy" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sat_sun">5-day week (Sat & Sun off)</SelectItem>
                    <SelectItem value="sun_only">6-day week (Only Sun off)</SelectItem>
                    <SelectItem value="none">7-day week (No weekends)</SelectItem>
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

// ─── Goal Cycle Configuration Section ─────────────────────────────────────────
function GoalCycleSection() {
  const { data: configs, isLoading } = useGoalCycleConfigs();
  const upsert = useUpsertGoalCycleConfig();
  const [defaults, setDefaults] = useState({
    input_start_day: 1,
    input_deadline_day: 7,
    scoring_start_day: 25,
    scoring_deadline_day: 28,
  });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (configs && !initialized) {
      const defaultConfig = configs.find((c) => c.cycle_month === "*");
      if (defaultConfig) {
        setDefaults({
          input_start_day: defaultConfig.input_start_day,
          input_deadline_day: defaultConfig.input_deadline_day,
          scoring_start_day: defaultConfig.scoring_start_day,
          scoring_deadline_day: defaultConfig.scoring_deadline_day,
        });
      }
      setInitialized(true);
    }
  }, [configs, initialized]);

  const handleSave = async () => {
    await upsert.mutateAsync({
      cycle_month: "*",
      ...defaults,
    });
  };

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Goal Cycle Deadlines
        </CardTitle>
        <CardDescription>
          Configure when employees can submit their goal plans and actuals each month.
          These deadlines are enforced across all employees.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/20">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              📝 Goal Input Window
            </h4>
            <p className="text-xs text-muted-foreground">
              The date range each month when employees can create and submit their goal plans.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Opens on day</Label>
                <Input
                  type="number" min={1} max={28}
                  value={defaults.input_start_day}
                  onChange={(e) => setDefaults((p) => ({ ...p, input_start_day: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Closes on day</Label>
                <Input
                  type="number" min={1} max={28}
                  value={defaults.input_deadline_day}
                  onChange={(e) => setDefaults((p) => ({ ...p, input_deadline_day: Number(e.target.value) }))}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Employees can submit goal plans between the <strong>{defaults.input_start_day}th</strong> and <strong>{defaults.input_deadline_day}th</strong> of each month.
            </p>
          </div>

          <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/20">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              📊 Scoring / Actuals Window
            </h4>
            <p className="text-xs text-muted-foreground">
              The date range when employees submit their actuals for approved goals.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Opens on day</Label>
                <Input
                  type="number" min={1} max={31}
                  value={defaults.scoring_start_day}
                  onChange={(e) => setDefaults((p) => ({ ...p, scoring_start_day: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Closes on day</Label>
                <Input
                  type="number" min={1} max={31}
                  value={defaults.scoring_deadline_day}
                  onChange={(e) => setDefaults((p) => ({ ...p, scoring_deadline_day: Number(e.target.value) }))}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Scoring window: <strong>{defaults.scoring_start_day}th</strong> to <strong>{defaults.scoring_deadline_day}th</strong> of each month.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save Deadlines
          </Button>
        </div>
      </CardContent>
    </Card>
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
  const { data: users = [], isLoading: loading, refetch: refreshUsers } = useQuery({
    queryKey: ["user-roles"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("manage-roles", {
        body: { action: "list_users" },
      });
      return (data?.users || []) as UserWithRole[];
    },
    enabled: !!user,
  });
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
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
    }
    setUpdatingUser(null);
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
    }
    setActionUser(null);
  };

  // Activate an inactive user (Yes in the User Status dropdown).
  const handleActivateUser = async (userId: string) => {
    setUpdatingUser(userId);
    const { data, error } = await supabase.functions.invoke("manage-roles", {
      body: { action: "activate_user", user_id: userId },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Failed to activate user");
    } else {
      toast.success("User reactivated successfully");
      qc.invalidateQueries({ queryKey: ["user-roles"] });
    }
    setUpdatingUser(null);
  };

  // Always show the confirm dialog before deactivating/deleting.
  // The optional reassignment selector handles users with or without direct reports.
  const initiateDeactivateOrDelete = (targetUser: UserWithRole, action: "deactivate" | "delete") => {
    setManagerDialogTarget(targetUser);
    setManagerDialogAction(action);
    setReplacementManagerId("");
    setManagerDialogOpen(true);
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
      toast.error(data?.error || "Sync failed. Ensure the Azure app has User.Read.All application permission.");
    } else {
      const { synced = 0, errors = [] } = data;
      if (errors.length > 0) {
        toast.warning(`Sync complete: ${synced} updated, ${errors.length} error(s). Check function logs.`);
      } else {
        toast.success(`Sync complete — ${synced} manager assignment${synced !== 1 ? "s" : ""} updated from Microsoft 365.`);
      }
      qc.invalidateQueries({ queryKey: ["user-roles"] });
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
                        {/* Status: editable Yes/No for active/inactive; read-only badge for others */}
                        {(u.status === "active" || u.status === "inactive") && !isSelf ? (
                          <Select
                            value={u.status === "active" ? "yes" : "no"}
                            onValueChange={(val) => {
                              if (val === "yes") {
                                handleActivateUser(u.user_id);
                              } else {
                                initiateDeactivateOrDelete(u, "deactivate");
                              }
                            }}
                            disabled={actionUser === u.user_id || updatingUser === u.user_id}
                          >
                            <SelectTrigger className="h-6 w-[80px] text-xs px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes">Active</SelectItem>
                              <SelectItem value="no">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant="outline"
                            className={`text-xs shrink-0 ${STATUS_COLORS[u.status] || STATUS_COLORS.active}`}
                          >
                            {isPending && <Clock className="h-3 w-3 mr-1 inline" />}
                            {STATUS_LABELS[u.status] || u.status}
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

                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
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

                      {/* Role badge */}
                      <Badge
                        variant="outline"
                        className={ROLE_COLORS[currentRole] || ROLE_COLORS.employee}
                      >
                        {ROLE_LABELS[currentRole] || currentRole}
                      </Badge>

                      {/* Role selector (disabled for inactive/pending or self) */}
                      {!isInactive && (
                        <Select
                          value={currentRole}
                          onValueChange={(val) => handleRoleChange(u.user_id, val)}
                          disabled={isSelf || updatingUser === u.user_id}
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
                      )}

                      {/* Manager info button — opens read-only dialog with MS365 guidance */}
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
        </Tabs>
      </div>
    </MainLayout>
  );
}
