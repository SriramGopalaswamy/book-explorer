import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  FlaskConical,
  Play,
  Square,
  Shield,
  Users,
  Loader2,
  AlertTriangle,
  LogOut,
  ExternalLink,
} from "lucide-react";

interface SandboxUser {
  id: string;
  sandbox_org_id: string;
  persona_role: string;
  display_name: string;
  email: string;
}

interface InviteLink {
  id: string;
  sandbox_org_id: string;
  expires_at: string | null;
  is_active: boolean;
  label: string | null;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  hr: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  finance: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  manager: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  employee: "bg-muted text-muted-foreground border-border",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Full access to all modules, settings, and configurations",
  hr: "Employee management, attendance, leaves, and HR operations",
  finance: "Financial suite, invoicing, banking, and accounting",
  manager: "Team management, approvals, and manager inbox",
  employee: "Self-service: payslips, attendance, leave requests",
};

export default function SandboxJoin() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeSandbox, setActiveSandbox] = useState<{
    orgId: string;
    orgName: string;
    role: string;
    displayName: string;
  } | null>(null);

  // Validate token and fetch invite details
  const { data: invite, isLoading: inviteLoading, error: inviteError } = useQuery({
    queryKey: ["sandbox-invite", token],
    queryFn: async () => {
      if (!token) throw new Error("No token provided");
      const { data, error } = await supabase
        .from("sandbox_invite_links" as any)
        .select("id, sandbox_org_id, expires_at, is_active, label")
        .eq("token", token)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Invalid or expired invite link");
      // Check expiry client-side too
      if ((data as any).expires_at && new Date((data as any).expires_at) < new Date()) {
        throw new Error("This invite link has expired");
      }
      return data as unknown as InviteLink;
    },
    enabled: !!token,
  });

  // Fetch org name
  const { data: orgInfo } = useQuery({
    queryKey: ["sandbox-org-info", invite?.sandbox_org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("id", invite!.sandbox_org_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!invite?.sandbox_org_id,
  });

  // Fetch personas for this sandbox org
  const { data: personas, isLoading: personasLoading } = useQuery({
    queryKey: ["sandbox-personas", invite?.sandbox_org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sandbox_users")
        .select("*")
        .eq("sandbox_org_id", invite!.sandbox_org_id)
        .order("persona_role");
      if (error) throw error;
      return (data ?? []) as SandboxUser[];
    },
    enabled: !!invite?.sandbox_org_id,
  });

  const enterSandbox = async (persona: SandboxUser) => {
    try {
      const { data, error } = await supabase.rpc("join_sandbox_via_token" as any, {
        _token: token,
        _sandbox_user_id: persona.id,
      });
      if (error) throw error;

      setActiveSandbox({
        orgId: persona.sandbox_org_id,
        orgName: orgInfo?.name ?? "Sandbox",
        role: persona.persona_role,
        displayName: persona.display_name,
      });

      toast.success(`Now testing as ${persona.display_name} (${persona.persona_role})`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const exitSandbox = () => {
    setActiveSandbox(null);
    toast.success("Exited sandbox session");
  };

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Shield className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Authentication Required</h3>
            <p className="text-sm text-muted-foreground mb-6">
              You need to be logged in to access this sandbox environment.
            </p>
            <Button onClick={() => navigate("/auth", { state: { returnTo: `/sandbox/join/${token}` } })}>
              Sign In to Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading
  if (inviteLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Invalid token
  if (inviteError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive/50 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Invalid Invite Link</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {inviteError instanceof Error ? inviteError.message : "This sandbox invite link is invalid or has expired."}
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Active sandbox session — show navigation options
  if (activeSandbox) {
    return (
      <div className="min-h-screen bg-background">
        {/* Sandbox banner */}
        <div className="border-b border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FlaskConical className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Sandbox Mode — {activeSandbox.orgName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Testing as <strong>{activeSandbox.displayName}</strong> ({activeSandbox.role})
                  • All data is isolated from production
                </p>
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={exitSandbox}>
              <Square className="h-3.5 w-3.5 mr-1" />
              Exit Sandbox
            </Button>
          </div>
        </div>

        <div className="max-w-2xl mx-auto py-12 px-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5 text-primary" />
                You're In — Start Testing
              </CardTitle>
              <CardDescription>
                You're now operating as <strong>{activeSandbox.displayName}</strong> with{" "}
                <Badge variant="outline" className={ROLE_COLORS[activeSandbox.role] ?? ""}>
                  {activeSandbox.role}
                </Badge>{" "}
                role. Navigate to any module to test workflows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Quick links based on your persona role:
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {activeSandbox.role === "admin" || activeSandbox.role === "hr" ? (
                  <>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Dashboard
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/hrms/employees")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Employees
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/hrms/leaves")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Leaves
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/hrms/payroll")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Payroll
                    </Button>
                  </>
                ) : activeSandbox.role === "finance" ? (
                  <>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Dashboard
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/financial/invoicing")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Invoicing
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/financial/accounting")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Accounting
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/financial/banking")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Banking
                    </Button>
                  </>
                ) : activeSandbox.role === "manager" ? (
                  <>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Dashboard
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/hrms/inbox")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Manager Inbox
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/performance/goals")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Goals
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Dashboard
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/hrms/my-payslips")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> My Payslips
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/hrms/my-attendance")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> My Attendance
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={() => navigate("/hrms/leaves")}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Leaves
                    </Button>
                  </>
                )}
              </div>

              <div className="pt-4 border-t border-border mt-4">
                <p className="text-xs text-muted-foreground">
                  💡 Want to switch personas? Exit the sandbox first, then select a different role.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Persona selection
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Sandbox Testing — {orgInfo?.name ?? "Loading..."}
              </h1>
              <p className="text-xs text-muted-foreground">
                {invite.label ? `${invite.label} • ` : ""}
                All actions are isolated from production data
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            <Shield className="h-3 w-3 mr-1" />
            Isolated Environment
          </Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Choose a Persona
            </CardTitle>
            <CardDescription>
              Select a role to test the application from that perspective.
              You'll have full access to create, edit, and interact with all workflows available to that role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {personasLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !personas?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No personas available in this sandbox. Ask the admin to reset the sandbox.
              </p>
            ) : (
              <div className="grid gap-3">
                {personas.map((persona) => (
                  <div
                    key={persona.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground">{persona.display_name}</span>
                        <Badge variant="outline" className={ROLE_COLORS[persona.persona_role] ?? ""}>
                          {persona.persona_role}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {ROLE_DESCRIPTIONS[persona.persona_role] ?? persona.email}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => enterSandbox(persona)}>
                      <Play className="h-3.5 w-3.5 mr-1" />
                      Enter
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <LogOut className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
