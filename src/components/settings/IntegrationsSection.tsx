/**
 * GBC-21: extracted Settings → Integrations section (Microsoft 365).
 *
 * Field/handler inventory:
 *   - status (object from supabase.functions.invoke "ms365-sync"
 *     action=check_status; { connected, domain, sso_only,
 *     ms365_user_count, provisioned_count, last_sync_at, reason })
 *   - ssoDomain (text input)
 *   - ssoOnly (Switch)
 *   - Actions: handleSyncManagers, handleProvision, handleSaveSettings
 *     — each calls the same Edge Function with different action verb.
 *
 *   Note: the initial check uses supabase.functions.invoke (Edge
 *   Function), not supabase.from(...). React Query is overkill for a
 *   single bootstrap call; the useEffect is intentional here. Comment
 *   distinguishes this from the GBC-22 useEffect+supabase.from pattern.
 */

import { useEffect, useState } from "react";
import { Cloud, Link2, RefreshCw, Loader2, Save, CheckCircle2, AlertCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { invokeEdge } from "@/lib/invoke-edge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function IntegrationsSection() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [ssoDomain, setSsoDomain] = useState("");
  const [ssoOnly, setSsoOnly] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // NOTE: This useEffect calls supabase.functions.invoke, NOT
  // supabase.from(...). Distinct from the GBC-22 anti-pattern — Edge
  // Function bootstraps don't currently have a shared React-Query hook;
  // a one-shot mount-time call is appropriate.
  useEffect(() => {
    (async () => {
      setChecking(true);
      try {
        const { data, error } = await invokeEdge("ms365-sync", {
          body: { action: "check_status" },
        });
        if (!error && data && !data.error) {
          setStatus(data);
          setSsoDomain(data.domain || "");
          setSsoOnly(data.sso_only || false);
        } else {
          setStatus({ connected: false, reason: data?.error || error?.message || "Could not check status" });
        }
      } catch {
        setStatus({ connected: false, reason: "Failed to check connection" });
      }
      setChecking(false);
    })();
  }, []);

  const handleSyncManagers = async () => {
    setIsSyncing(true);
    const { data, error } = await invokeEdge("ms365-sync", {
      body: { action: "sync_managers" },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Sync failed");
    } else {
      toast.success(`Sync complete — ${data.synced} manager assignment(s) updated.`);
      // Invalidate the org chart cache so the updated hierarchy is immediately
      // visible if the user navigates to the Org Chart page.
      queryClient.invalidateQueries({ queryKey: ["org-chart-profiles"] });
      // Refresh the last-sync timestamp shown in this panel.
      setStatus((prev: any) => prev ? { ...prev, last_sync_at: new Date().toISOString() } : prev);
    }
    setIsSyncing(false);
  };

  const handleProvision = async () => {
    setIsProvisioning(true);
    const { data, error } = await invokeEdge("ms365-sync", {
      body: { action: "provision_users" },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Provisioning failed");
    } else {
      const { created = 0, skipped = 0, errors = [] } = data;
      if (errors.length > 0) {
        toast.warning(`Provisioned ${created} user(s), ${errors.length} error(s). Check logs.`);
      } else {
        toast.success(`Provisioned ${created} new user(s). ${skipped} already existed.`);
      }
    }
    setIsProvisioning(false);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    const { data, error } = await invokeEdge("ms365-sync", {
      body: { action: "update_sso_settings", sso_domain: ssoDomain, sso_only: ssoOnly },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to save settings");
    } else {
      toast.success("SSO settings saved");
    }
    setSavingSettings(false);
  };

  return (
    <div className="space-y-6">
      {/* Microsoft 365 Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-[hsl(210,80%,50%)]" />
            Microsoft 365 Integration
          </CardTitle>
          <CardDescription>
            Azure AD SSO, user provisioning, and organization chart sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {checking ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
            </div>
          ) : status?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium text-green-600">Connected</span>
                <Badge variant="outline" className="text-xs ml-2">@{status.domain}</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-bold">{status.ms365_user_count || 0}</p>
                  <p className="text-xs text-muted-foreground">MS365 Users</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-bold">{status.provisioned_count || 0}</p>
                  <p className="text-xs text-muted-foreground">Provisioned</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Last Sync</p>
                  <p className="text-sm font-medium mt-1">
                    {status.last_sync_at
                      ? new Date(status.last_sync_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                      : "Never"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleSyncManagers} disabled={isSyncing} className="gap-2">
                  {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {isSyncing ? "Syncing…" : "Sync Managers"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleProvision} disabled={isProvisioning} className="gap-2">
                  {isProvisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  {isProvisioning ? "Provisioning…" : "Provision All Users"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="text-sm text-destructive">{status?.reason || "Not connected"}</span>
            </div>
          )}

          <div className="border-t border-border pt-4 space-y-4">
            <h4 className="text-sm font-medium">SSO Configuration</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Email Domain</Label>
                <Input
                  value={ssoDomain}
                  onChange={(e) => setSsoDomain(e.target.value)}
                  placeholder="grx10.com"
                />
                <p className="text-xs text-muted-foreground">Only users with this email domain can sign in via MS365.</p>
              </div>
              <div className="space-y-1.5">
                <Label>SSO-Primary Mode</Label>
                <div className="flex items-center gap-2 pt-1">
                  <Switch checked={ssoOnly} onCheckedChange={setSsoOnly} />
                  <span className="text-sm text-muted-foreground">
                    {ssoOnly ? "MS365 is primary login (email/password as fallback)" : "All login methods equally visible"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveSettings} disabled={savingSettings}>
                {savingSettings ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save Settings
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Google Workspace placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-[hsl(217,89%,61%)]" />
            Google Workspace
          </CardTitle>
          <CardDescription>Google SSO, Calendar, Drive</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="outline" className="text-xs">Coming Soon</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
