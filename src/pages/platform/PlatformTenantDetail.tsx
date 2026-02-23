import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  useOrgDetail,
  useIntegrityAudit,
  useControlledReinitialize,
  useOrgStateOverride,
} from "@/hooks/usePlatformOps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  ArrowLeft,
  Lock,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

function getOperationalBadge(status: string, orgState: string) {
  if (status === "active" && orgState === "active") {
    return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">🟢 Operational</Badge>;
  }
  if (orgState === "initializing" || orgState === "draft") {
    return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">🟡 Initializing</Badge>;
  }
  if (orgState === "locked" || status === "suspended") {
    return <Badge variant="destructive">🔴 Locked</Badge>;
  }
  if (orgState === "archived") {
    return <Badge className="bg-neutral-500/10 text-neutral-400 border-neutral-500/20">⚫ Archived</Badge>;
  }
  return <Badge variant="outline">{orgState}</Badge>;
}

function IntegrityCard({ label, passed }: { label: string; passed: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          {passed ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{passed ? "PASS" : "FAIL"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PlatformTenantDetail() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: org, isLoading: orgLoading } = useOrgDetail(orgId ?? null);
  const { data: audit, isLoading: auditLoading, refetch: refetchAudit } = useIntegrityAudit(orgId ?? null);
  const reinitialize = useControlledReinitialize();
  const stateOverride = useOrgStateOverride();

  // Reinitialization modal state
  const [reinitOpen, setReinitOpen] = useState(false);
  const [reinitStep, setReinitStep] = useState(1);
  const [reinitPassword, setReinitPassword] = useState("");
  const [reinitConfirmName, setReinitConfirmName] = useState("");
  const [reinitChecked, setReinitChecked] = useState(false);
  const [reinitVerifying, setReinitVerifying] = useState(false);

  // State override
  const [overrideState, setOverrideState] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  if (orgLoading) {
    return (
      <PlatformLayout title="Tenant Detail" subtitle="Loading...">
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PlatformLayout>
    );
  }

  if (!org) {
    return (
      <PlatformLayout title="Tenant Not Found">
        <p className="text-muted-foreground">Organization not found.</p>
      </PlatformLayout>
    );
  }

  const orgStatus = (org as any).status ?? "active";
  const orgState = (org as any).org_state ?? "active";

  const handleReinitOpen = () => {
    setReinitStep(1);
    setReinitPassword("");
    setReinitConfirmName("");
    setReinitChecked(false);
    setReinitOpen(true);
  };

  const handlePasswordVerify = async () => {
    if (!user?.email) return;
    setReinitVerifying(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: reinitPassword,
      });
      if (error) {
        toast.error("Authentication failed. Please verify your password.");
        return;
      }
      setReinitStep(3);
    } catch {
      toast.error("Authentication verification failed.");
    } finally {
      setReinitVerifying(false);
    }
  };

  const handleReinitExecute = async () => {
    try {
      await reinitialize.mutateAsync({ orgId: org.id, orgName: org.name });
      toast.success("Controlled reinitialization completed successfully.");
      setReinitOpen(false);
      refetchAudit();
    } catch {
      // Error handled by mutation
    }
  };

  const handleStateOverride = () => {
    if (!overrideState || !overrideReason.trim()) {
      toast.error("Please provide both a target state and reason.");
      return;
    }
    if (orgState === "archived" && overrideState !== "archived") {
      toast.error("Cannot override archived state without force flag. Contact engineering.");
      return;
    }
    stateOverride.mutate({
      orgId: org.id,
      orgName: org.name,
      previousState: orgState,
      newState: overrideState,
      reason: overrideReason,
    });
    setOverrideReason("");
  };

  const integrityScore = audit?.integrity_score ?? 0;
  const scoreColor =
    integrityScore >= 90
      ? "text-emerald-500"
      : integrityScore >= 70
      ? "text-yellow-500"
      : "text-destructive";

  return (
    <PlatformLayout title="Tenant Detail" subtitle={org.name}>
      {/* Back nav */}
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/platform")}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Tenants
      </Button>

      {/* Top Section: Org Info */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {org.name}
            </CardTitle>
            {getOperationalBadge(orgStatus, orgState)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Legal Name</p>
              <p className="text-sm font-medium text-foreground">{org.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Commercial Status</p>
              <Badge variant={orgStatus === "suspended" ? "destructive" : "outline"}>
                {orgStatus}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">System Lifecycle State</p>
              <Badge variant="outline">{orgState}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Created</p>
              <p className="text-sm text-foreground">{format(new Date(org.created_at), "MMM d, yyyy")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrity Monitor */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Platform Integrity Monitor
            </CardTitle>
            <CardDescription>Server-side structural integrity audit</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchAudit()} disabled={auditLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${auditLoading ? "animate-spin" : ""}`} />
            Re-run Audit
          </Button>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : audit ? (
            <>
              {integrityScore < 80 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 mb-4">
                  <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
                  <p className="text-sm text-destructive">
                    System integrity below threshold. Review failures before proceeding.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-4 mb-6">
                <div className="text-center">
                  <div className={`text-4xl font-bold ${scoreColor}`}>
                    {integrityScore}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">System Integrity</p>
                </div>
                <div className="text-xs text-muted-foreground">/ 100</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-4">
                <IntegrityCard label="FK Integrity" passed={audit.fk_ok} />
                <IntegrityCard label="RLS Isolation" passed={audit.rls_ok} />
                <IntegrityCard label="Audit Enforcement" passed={audit.audit_ok} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Transaction Count</p>
                    <p className="text-2xl font-bold text-foreground">{audit.transaction_count}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Safe Reset</p>
                    <p className={`text-2xl font-bold ${audit.safe_reset ? "text-emerald-500" : "text-destructive"}`}>
                      {audit.safe_reset ? "YES" : "NO"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">
              Click "Re-run Audit" to execute the integrity engine.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Controlled Reinitialization */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Controlled Reinitialization
          </CardTitle>
          <CardDescription>
            Remove all transactional data while preserving organizational structure and audit history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={handleReinitOpen}
            disabled={!audit?.safe_reset || reinitialize.isPending}
          >
            {reinitialize.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Begin Controlled Reinitialization
          </Button>
          {audit && !audit.safe_reset && (
            <p className="text-xs text-destructive mt-2">
              Reinitialization blocked: {audit.transaction_count} active transactions detected.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Reinitialization Modal */}
      <Dialog open={reinitOpen} onOpenChange={setReinitOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Controlled Reinitialization</DialogTitle>
            <DialogDescription>
              This process is irreversible. All transactional data will be permanently removed.
            </DialogDescription>
          </DialogHeader>

          {reinitStep === 1 && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Integrity Summary</h4>
              {audit && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">System Integrity</span>
                    <span className={`font-bold ${scoreColor}`}>{integrityScore}/100</span>
                  </div>
                  <div className="flex justify-between p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">Safe Reset</span>
                    <span className={`font-bold ${audit.safe_reset ? "text-emerald-500" : "text-destructive"}`}>
                      {audit.safe_reset ? "YES" : "NO"}
                    </span>
                  </div>
                  <div className="flex justify-between p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">FK Integrity</span>
                    <span>{audit.fk_ok ? "✓" : "✗"}</span>
                  </div>
                  <div className="flex justify-between p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">RLS Isolation</span>
                    <span>{audit.rls_ok ? "✓" : "✗"}</span>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setReinitOpen(false)}>Cancel</Button>
                <Button onClick={() => setReinitStep(2)}>Continue</Button>
              </DialogFooter>
            </div>
          )}

          {reinitStep === 2 && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Password Re-authentication</h4>
              <p className="text-sm text-muted-foreground">
                Enter your password to verify your identity.
              </p>
              <Input
                type="password"
                placeholder="Enter your password"
                value={reinitPassword}
                onChange={(e) => setReinitPassword(e.target.value)}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setReinitStep(1)}>Back</Button>
                <Button
                  onClick={handlePasswordVerify}
                  disabled={!reinitPassword || reinitVerifying}
                >
                  {reinitVerifying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Verify
                </Button>
              </DialogFooter>
            </div>
          )}

          {reinitStep === 3 && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Confirm Organization Identity</h4>
              <p className="text-sm text-muted-foreground">
                Type the exact legal name to confirm: <strong>{org.name}</strong>
              </p>
              <Input
                placeholder="Type organization legal name"
                value={reinitConfirmName}
                onChange={(e) => setReinitConfirmName(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="reinit-confirm"
                  checked={reinitChecked}
                  onCheckedChange={(checked) => setReinitChecked(checked === true)}
                />
                <label htmlFor="reinit-confirm" className="text-sm text-muted-foreground cursor-pointer">
                  I understand this action will remove all transactional data.
                </label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReinitStep(2)}>Back</Button>
                <Button
                  variant="destructive"
                  onClick={handleReinitExecute}
                  disabled={
                    reinitConfirmName !== org.name ||
                    !reinitChecked ||
                    reinitialize.isPending
                  }
                >
                  {reinitialize.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Execute Reinitialization
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lifecycle State Override */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Lifecycle State Override
          </CardTitle>
          <CardDescription>
            Manually override the system lifecycle state. All changes are audited.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
                Target State
              </label>
              <Select value={overrideState} onValueChange={setOverrideState}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">draft</SelectItem>
                  <SelectItem value="initializing">initializing</SelectItem>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="locked">locked</SelectItem>
                  <SelectItem value="archived">archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
                Reason (required)
              </label>
              <Textarea
                placeholder="Provide justification for this override..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleStateOverride}
            disabled={!overrideState || !overrideReason.trim() || stateOverride.isPending}
          >
            {stateOverride.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Apply Lifecycle Override
          </Button>
        </CardContent>
      </Card>
    </PlatformLayout>
  );
}
