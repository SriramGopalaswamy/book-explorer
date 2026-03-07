import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Shield, Lock, FileX, AlertTriangle, Clock, CheckCircle2, Loader2, Save, Eye } from "lucide-react";
import { toast } from "sonner";
import { useConsentRecords, useDataErasureRequests, useDataBreachLog, useSessionPolicy } from "@/hooks/usePrivacyCompliance";
import { useIsAdminOrHR } from "@/hooks/useRoles";
import { format } from "date-fns";

const CONSENT_TYPES = [
  { type: "data_processing", label: "Essential Data Processing", desc: "Processing employee/financial data for core business operations", required: true },
  { type: "analytics", label: "Analytics & Reporting", desc: "Aggregated analytics and performance reporting", required: false },
  { type: "marketing", label: "Marketing Communications", desc: "Product updates and marketing emails", required: false },
  { type: "third_party_sharing", label: "Third-Party Data Sharing", desc: "Sharing data with statutory authorities and integration partners", required: false },
];

const DATA_CATEGORIES = [
  "Personal Information (Name, Email, Phone)",
  "Financial Records (Salary, Bank Details)",
  "Attendance & Leave Data",
  "Performance & Goal Data",
  "Documents & Attachments",
];

export function PrivacySecuritySection() {
  const { data: isAdmin } = useIsAdminOrHR();

  return (
    <div className="space-y-6">
      <ConsentManagement />
      <DataErasureSection />
      {isAdmin && <SessionPolicySection />}
      {isAdmin && <BreachLogSection />}
    </div>
  );
}

// ── Consent Management ─────────────────────────────────────────────
function ConsentManagement() {
  const { consents, upsertConsent } = useConsentRecords();

  const getConsentStatus = (type: string) => {
    const record = consents.find((c: any) => c.consent_type === type && !c.withdrawal_date);
    return record?.consent_given ?? false;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Data Processing Consent (DPDPA)
        </CardTitle>
        <CardDescription>
          Manage your data processing preferences as required under the Digital Personal Data Protection Act, 2023.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {CONSENT_TYPES.map(({ type, label, desc, required }) => (
          <div key={type} className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">{label}</Label>
                {required && <Badge variant="outline" className="text-xs">Required</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <Switch
              checked={required || getConsentStatus(type)}
              disabled={required || upsertConsent.isPending}
              onCheckedChange={(checked) => upsertConsent.mutate({ consent_type: type, consent_given: checked, purpose_description: desc })}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Under DPDPA 2023, you have the right to withdraw consent at any time. Essential data processing consent is required for system functionality.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Data Erasure Requests ──────────────────────────────────────────
function DataErasureSection() {
  const { requests, createRequest } = useDataErasureRequests();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [requestType, setRequestType] = useState("data_export");

  const handleSubmit = () => {
    if (selectedCategories.length === 0) {
      toast.error("Please select at least one data category");
      return;
    }
    createRequest.mutate({
      request_type: requestType,
      reason,
      data_categories: selectedCategories,
    });
    setSelectedCategories([]);
    setReason("");
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
    in_progress: "bg-blue-500/10 text-blue-700 border-blue-500/20",
    completed: "bg-green-500/10 text-green-700 border-green-500/20",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileX className="h-5 w-5" />
          Data Rights Requests
        </CardTitle>
        <CardDescription>
          Exercise your right to data export, erasure, or anonymization under DPDPA Section 12-13.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Request Type</Label>
            <Select value={requestType} onValueChange={setRequestType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="data_export">Export My Data</SelectItem>
                <SelectItem value="erasure">Delete My Data</SelectItem>
                <SelectItem value="anonymization">Anonymize My Data</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason (Optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you requesting this?" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Data Categories</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DATA_CATEGORIES.map((cat) => (
              <label key={cat} className="flex items-center gap-2 p-2 rounded border border-border cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(cat)}
                  onChange={(e) =>
                    setSelectedCategories((prev) =>
                      e.target.checked ? [...prev, cat] : prev.filter((c) => c !== cat)
                    )
                  }
                  className="rounded"
                />
                <span className="text-sm">{cat}</span>
              </label>
            ))}
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={selectedCategories.length === 0}>
              Submit Request
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Data Request</AlertDialogTitle>
              <AlertDialogDescription>
                You are submitting a <strong>{requestType.replace("_", " ")}</strong> request for {selectedCategories.length} data categories.
                Per DPDPA, this will be processed within 30 days. You'll receive an acknowledgment number.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSubmit}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {requests.length > 0 && (
          <div className="mt-4">
            <Label className="text-sm font-medium">Your Requests</Label>
            <div className="mt-2 space-y-2">
              {requests.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{r.acknowledgment_number}</p>
                    <p className="text-xs text-muted-foreground capitalize">{r.request_type?.replace("_", " ")} — {r.data_categories?.length || 0} categories</p>
                    {r.deadline_date && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Deadline: {format(new Date(r.deadline_date), "dd MMM yyyy")}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className={statusColors[r.status] || ""}>{r.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Session Policy (Admin) ─────────────────────────────────────────
function SessionPolicySection() {
  const { policy, upsertPolicy } = useSessionPolicy();
  const [local, setLocal] = useState({
    idle_timeout_minutes: 30,
    max_session_hours: 12,
    enforce_single_session: false,
    password_min_length: 8,
    password_require_uppercase: true,
    password_require_number: true,
    password_require_special: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (policy) {
      setLocal({
        idle_timeout_minutes: policy.idle_timeout_minutes ?? 30,
        max_session_hours: policy.max_session_hours ?? 12,
        enforce_single_session: policy.enforce_single_session ?? false,
        password_min_length: policy.password_min_length ?? 8,
        password_require_uppercase: policy.password_require_uppercase ?? true,
        password_require_number: policy.password_require_number ?? true,
        password_require_special: policy.password_require_special ?? false,
      });
    }
  }, [policy]);

  async function handleSave() {
    setSaving(true);
    try {
      await upsertPolicy.mutateAsync(local);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Session & Password Policy (ISO 27001)
        </CardTitle>
        <CardDescription>
          Configure security policies for session management and password requirements.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Idle Timeout (minutes)</Label>
            <Input
              type="number" min={5} max={480}
              value={local.idle_timeout_minutes}
              onChange={(e) => setLocal((p) => ({ ...p, idle_timeout_minutes: parseInt(e.target.value) || 30 }))}
            />
            <p className="text-xs text-muted-foreground">Auto-logout after inactivity (SOX/ISO 27001)</p>
          </div>
          <div className="space-y-1.5">
            <Label>Max Session Duration (hours)</Label>
            <Input
              type="number" min={1} max={72}
              value={local.max_session_hours}
              onChange={(e) => setLocal((p) => ({ ...p, max_session_hours: parseInt(e.target.value) || 12 }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Min Password Length</Label>
            <Input
              type="number" min={6} max={32}
              value={local.password_min_length}
              onChange={(e) => setLocal((p) => ({ ...p, password_min_length: parseInt(e.target.value) || 8 }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { key: "enforce_single_session" as const, label: "Single Session", desc: "Only one active session per user" },
            { key: "password_require_uppercase" as const, label: "Require Uppercase", desc: "At least one uppercase letter" },
            { key: "password_require_number" as const, label: "Require Number", desc: "At least one numeric digit" },
            { key: "password_require_special" as const, label: "Require Special Char", desc: "At least one special character" },
          ].map(({ key, label, desc }) => (
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

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save Policy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Breach Log (Admin) ─────────────────────────────────────────────
function BreachLogSection() {
  const { breaches, createBreach } = useDataBreachLog();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    breach_date: new Date().toISOString().split("T")[0],
    breach_type: "unauthorized_access",
    severity: "medium",
    description: "",
    estimated_affected_count: 0,
  });

  const handleSubmit = () => {
    if (!form.description) {
      toast.error("Description is required");
      return;
    }
    createBreach.mutate(form);
    setShowForm(false);
    setForm({ breach_date: new Date().toISOString().split("T")[0], breach_type: "unauthorized_access", severity: "medium", description: "", estimated_affected_count: 0 });
  };

  const severityColors: Record<string, string> = {
    low: "bg-green-500/10 text-green-700 border-green-500/20",
    medium: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
    high: "bg-orange-500/10 text-orange-700 border-orange-500/20",
    critical: "bg-destructive/10 text-destructive border-destructive/20",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Data Breach Register (DPDPA)
        </CardTitle>
        <CardDescription>
          Log and track data breach incidents. DPDPA mandates notification to the Data Protection Board within 72 hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showForm ? (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            Report Incident
          </Button>
        ) : (
          <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Breach Date</Label>
                <Input type="date" value={form.breach_date} onChange={(e) => setForm((p) => ({ ...p, breach_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.breach_type} onValueChange={(v) => setForm((p) => ({ ...p, breach_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unauthorized_access">Unauthorized Access</SelectItem>
                    <SelectItem value="data_leak">Data Leak</SelectItem>
                    <SelectItem value="system_compromise">System Compromise</SelectItem>
                    <SelectItem value="phishing">Phishing</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm((p) => ({ ...p, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Describe what happened..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSubmit} disabled={createBreach.isPending}>
                {createBreach.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Log Incident
              </Button>
            </div>
          </div>
        )}

        {breaches.length > 0 && (
          <div className="space-y-2">
            {breaches.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium capitalize">{b.breach_type?.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{b.description}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(b.breach_date), "dd MMM yyyy")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {b.authority_notified && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  <Badge variant="outline" className={severityColors[b.severity] || ""}>{b.severity}</Badge>
                  <Badge variant="outline">{b.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
