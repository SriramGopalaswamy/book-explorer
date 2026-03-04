import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Cloud,
  Link2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  Eye,
  EyeOff,
  Shield,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

interface OAuthConfig {
  provider: string;
  client_id: string;
  client_secret: string;
  tenant_id?: string;
  sender_email?: string;
  is_verified?: boolean;
}

export function IntegrationsStep() {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  const [msOpen, setMsOpen] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);

  // Microsoft fields
  const [msTenantId, setMsTenantId] = useState("");
  const [msClientId, setMsClientId] = useState("");
  const [msClientSecret, setMsClientSecret] = useState("");
  const [msSenderEmail, setMsSenderEmail] = useState("");
  const [msVerified, setMsVerified] = useState(false);
  const [msSaving, setMsSaving] = useState(false);
  const [msShowSecret, setMsShowSecret] = useState(false);

  // Google fields
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleVerified, setGoogleVerified] = useState(false);
  const [googleSaving, setGoogleSaving] = useState(false);
  const [googleShowSecret, setGoogleShowSecret] = useState(false);

  // Load existing configs
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from("organization_oauth_configs")
        .select("*")
        .eq("organization_id", orgId);
      if (data) {
        for (const row of data) {
          if (row.provider === "microsoft") {
            setMsTenantId(row.tenant_id || "");
            setMsClientId(row.client_id);
            setMsClientSecret(row.client_secret);
            setMsSenderEmail(row.sender_email || "");
            setMsVerified(!!row.is_verified);
            setMsOpen(true);
          }
          if (row.provider === "google") {
            setGoogleClientId(row.client_id);
            setGoogleClientSecret(row.client_secret);
            setGoogleVerified(!!row.is_verified);
            setGoogleOpen(true);
          }
        }
      }
    })();
  }, [orgId]);

  const saveMicrosoft = async () => {
    if (!orgId || !user) return;
    if (!msTenantId.trim() || !msClientId.trim() || !msClientSecret.trim() || !msSenderEmail.trim()) {
      toast.error("All Microsoft 365 fields are required");
      return;
    }
    setMsSaving(true);
    try {
      const { error } = await supabase.from("organization_oauth_configs").upsert(
        {
          organization_id: orgId,
          provider: "microsoft",
          client_id: msClientId.trim(),
          client_secret: msClientSecret.trim(),
          tenant_id: msTenantId.trim(),
          sender_email: msSenderEmail.trim(),
          scopes: ["Mail.Send", "User.Read"],
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,provider" }
      );
      if (error) throw error;
      setMsVerified(false); // Reset verification on credential change
      toast.success("Microsoft 365 credentials saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setMsSaving(false);
    }
  };

  const saveGoogle = async () => {
    if (!orgId || !user) return;
    if (!googleClientId.trim() || !googleClientSecret.trim()) {
      toast.error("All Google fields are required");
      return;
    }
    setGoogleSaving(true);
    try {
      const { error } = await supabase.from("organization_oauth_configs").upsert(
        {
          organization_id: orgId,
          provider: "google",
          client_id: googleClientId.trim(),
          client_secret: googleClientSecret.trim(),
          scopes: ["openid", "email", "profile"],
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,provider" }
      );
      if (error) throw error;
      setGoogleVerified(false);
      toast.success("Google OAuth credentials saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setGoogleSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure your organization's identity provider credentials. These enable SSO sign-in and
        email sending for your team.
      </p>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary flex items-start gap-2">
        <Shield className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Credentials are stored securely and scoped to your organization. They are never exposed
          to other tenants.
        </span>
      </div>

      {/* Microsoft 365 */}
      <Collapsible open={msOpen} onOpenChange={setMsOpen}>
        <Card className="border-border overflow-hidden">
          <CollapsibleTrigger asChild>
            <button className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[hsl(207,90%,41%)]/10 flex items-center justify-center">
                  <Cloud className="h-5 w-5 text-[hsl(207,90%,41%)]" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Microsoft 365 / Azure AD</p>
                  <p className="text-xs text-muted-foreground">SSO sign-in & email via MS Graph</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {msVerified && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                  </Badge>
                )}
                {msOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator />
            <div className="p-4 space-y-4">
              {/* Instructions */}
              <div className="rounded-md bg-muted/50 p-3 space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground text-sm">Setup Instructions</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Go to <strong>Azure Portal → Entra ID → App Registrations</strong></li>
                  <li>Register a new app (or use existing) with <strong>Web</strong> platform</li>
                  <li>Add redirect URI: <code className="bg-muted px-1 rounded">{window.location.origin}/auth/callback</code></li>
                  <li>Under <strong>API Permissions</strong>, add: <code>Mail.Send</code> (Application), <code>User.Read</code> (Delegated)</li>
                  <li>Click <strong>"Grant admin consent"</strong> for your tenant</li>
                  <li>Go to <strong>Certificates & Secrets</strong> → create a new client secret</li>
                  <li>Copy the values below</li>
                </ol>
                <a
                  href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline mt-1"
                >
                  Open Azure Portal <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="grid gap-3">
                <div>
                  <Label htmlFor="ms-tenant" className="text-xs">Azure Tenant ID</Label>
                  <Input
                    id="ms-tenant"
                    placeholder="e.g. 12345678-abcd-..."
                    value={msTenantId}
                    onChange={(e) => setMsTenantId(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="ms-client-id" className="text-xs">Application (Client) ID</Label>
                  <Input
                    id="ms-client-id"
                    placeholder="e.g. abcdef12-3456-..."
                    value={msClientId}
                    onChange={(e) => setMsClientId(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="ms-secret" className="text-xs">Client Secret</Label>
                  <div className="relative mt-1">
                    <Input
                      id="ms-secret"
                      type={msShowSecret ? "text" : "password"}
                      placeholder="Enter client secret value"
                      value={msClientSecret}
                      onChange={(e) => setMsClientSecret(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setMsShowSecret(!msShowSecret)}
                    >
                      {msShowSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="ms-sender" className="text-xs">Sender Email Address</Label>
                  <Input
                    id="ms-sender"
                    type="email"
                    placeholder="e.g. admin@yourdomain.com"
                    value={msSenderEmail}
                    onChange={(e) => setMsSenderEmail(e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    The mailbox used to send transactional emails (notifications, reminders).
                  </p>
                </div>
              </div>

              <Button size="sm" onClick={saveMicrosoft} disabled={msSaving} className="w-full">
                {msSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Save Microsoft 365 Configuration
              </Button>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Google Workspace */}
      <Collapsible open={googleOpen} onOpenChange={setGoogleOpen}>
        <Card className="border-border overflow-hidden">
          <CollapsibleTrigger asChild>
            <button className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[hsl(217,89%,61%)]/10 flex items-center justify-center">
                  <Link2 className="h-5 w-5 text-[hsl(217,89%,61%)]" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Google Workspace</p>
                  <p className="text-xs text-muted-foreground">Google SSO & Calendar integration</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {googleVerified && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                  </Badge>
                )}
                {googleOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator />
            <div className="p-4 space-y-4">
              <div className="rounded-md bg-muted/50 p-3 space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground text-sm">Setup Instructions</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Go to <strong>Google Cloud Console → APIs & Services → Credentials</strong></li>
                  <li>Create an <strong>OAuth 2.0 Client ID</strong> (Web application)</li>
                  <li>Add authorized redirect URI: <code className="bg-muted px-1 rounded">{window.location.origin}/auth/callback</code></li>
                  <li>Under <strong>OAuth consent screen</strong>, add scopes: <code>email</code>, <code>profile</code>, <code>openid</code></li>
                  <li>Copy the Client ID and Client Secret below</li>
                </ol>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline mt-1"
                >
                  Open Google Cloud Console <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="grid gap-3">
                <div>
                  <Label htmlFor="google-client-id" className="text-xs">Client ID</Label>
                  <Input
                    id="google-client-id"
                    placeholder="e.g. 123456789.apps.googleusercontent.com"
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="google-secret" className="text-xs">Client Secret</Label>
                  <div className="relative mt-1">
                    <Input
                      id="google-secret"
                      type={googleShowSecret ? "text" : "password"}
                      placeholder="Enter client secret"
                      value={googleClientSecret}
                      onChange={(e) => setGoogleClientSecret(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setGoogleShowSecret(!googleShowSecret)}
                    >
                      {googleShowSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <Button size="sm" onClick={saveGoogle} disabled={googleSaving} className="w-full">
                {googleSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Save Google Configuration
              </Button>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          These integrations are optional and can be configured later from <strong>Settings → Integrations</strong>.
          Email sending requires Microsoft 365 credentials with <code>Mail.Send</code> permission.
        </span>
      </div>
    </div>
  );
}
