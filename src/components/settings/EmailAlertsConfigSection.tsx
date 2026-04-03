import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Mail, Bell, Save, Loader2, Clock, Users, Search,
  ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Target, DollarSign, CalendarCheck, UserCheck, FileText,
  Shield, Settings, BriefcaseBusiness,
} from "lucide-react";
import { toast } from "sonner";
import {
  useEmailAlertConfig,
  ALERT_RULE_DEFINITIONS,
  ALERT_CATEGORIES,
  FREQUENCY_LABELS,
  ROLE_LABELS,
  type AlertCategory,
  type AlertRuleConfig,
  type EmailAlertSettings,
  type AlertFrequency,
  type AlertRole,
} from "@/hooks/useEmailAlertConfig";

// ─── Category Icons ──────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<AlertCategory, typeof Mail> = {
  goals: Target,
  investment: FileText,
  payroll: DollarSign,
  attendance: CalendarCheck,
  leave: CalendarCheck,
  approvals: UserCheck,
  reimbursements: BriefcaseBusiness,
  compliance: Shield,
  system: Settings,
};

const ROLE_COLORS: Record<AlertRole, string> = {
  employee: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  manager: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  hr: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  finance: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  admin: "bg-red-500/10 text-red-600 border-red-500/20",
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ─── Single Alert Rule Row ───────────────────────────────────────────────────

function AlertRuleRow({
  ruleId,
  config,
  onChange,
}: {
  ruleId: string;
  config: AlertRuleConfig;
  onChange: (updated: AlertRuleConfig) => void;
}) {
  const def = ALERT_RULE_DEFINITIONS.find((d) => d.id === ruleId);
  if (!def) return null;

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        config.enabled
          ? "border-border bg-background"
          : "border-border/50 bg-muted/30 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{def.label}</p>
            {def.target_roles.map((role) => (
              <Badge
                key={role}
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[role]}`}
              >
                {ROLE_LABELS[role]}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{def.description}</p>

          {config.enabled && (
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <Select
                  value={config.frequency}
                  onValueChange={(v) =>
                    onChange({ ...config, frequency: v as AlertFrequency })
                  }
                >
                  <SelectTrigger className="h-7 text-xs w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {def.supported_frequencies.map((f) => (
                      <SelectItem key={f} value={f} className="text-xs">
                        {FREQUENCY_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {config.frequency === "weekly" && (
                <Select
                  value={String(config.day_of_week ?? 1)}
                  onValueChange={(v) =>
                    onChange({ ...config, day_of_week: Number(v) })
                  }
                >
                  <SelectTrigger className="h-7 text-xs w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i)} className="text-xs">
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {config.frequency === "monthly" && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Day</span>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    value={config.day_of_month ?? 1}
                    onChange={(e) =>
                      onChange({ ...config, day_of_month: Number(e.target.value) })
                    }
                    className="h-7 w-16 text-xs"
                  />
                </div>
              )}

              {config.frequency !== "on_event" && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">At</span>
                  <Input
                    type="time"
                    value={config.time_of_day}
                    onChange={(e) =>
                      onChange({ ...config, time_of_day: e.target.value })
                    }
                    className="h-7 w-[100px] text-xs"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <Switch
          checked={config.enabled}
          onCheckedChange={(v) => onChange({ ...config, enabled: v })}
        />
      </div>
    </div>
  );
}

// ─── Category Section ────────────────────────────────────────────────────────

function CategorySection({
  category,
  settings,
  onRuleChange,
  searchQuery,
  roleFilter,
}: {
  category: AlertCategory;
  settings: EmailAlertSettings;
  onRuleChange: (ruleId: string, updated: AlertRuleConfig) => void;
  searchQuery: string;
  roleFilter: AlertRole | "all";
}) {
  const [expanded, setExpanded] = useState(true);
  const meta = ALERT_CATEGORIES[category];
  const Icon = CATEGORY_ICONS[category];

  const rules = useMemo(() => {
    return ALERT_RULE_DEFINITIONS.filter((def) => {
      if (def.category !== category) return false;
      if (roleFilter !== "all" && !def.target_roles.includes(roleFilter)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          def.label.toLowerCase().includes(q) ||
          def.description.toLowerCase().includes(q) ||
          def.target_roles.some((r) => r.includes(q))
        );
      }
      return true;
    });
  }, [category, searchQuery, roleFilter]);

  if (rules.length === 0) return null;

  const enabledCount = rules.filter((r) => settings.rules[r.id]?.enabled).length;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{meta.label}</span>
          <Badge variant="outline" className="text-[10px] ml-1">
            {enabledCount}/{rules.length} active
          </Badge>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="p-3 space-y-2">
          <p className="text-xs text-muted-foreground px-1 mb-2">
            {meta.description}
          </p>
          {rules.map((def) => {
            const config = settings.rules[def.id];
            if (!config) return null;
            return (
              <AlertRuleRow
                key={def.id}
                ruleId={def.id}
                config={config}
                onChange={(updated) => onRuleChange(def.id, updated)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Summary Table ───────────────────────────────────────────────────────────

function AlertSummaryTable({ settings }: { settings: EmailAlertSettings }) {
  const roles: AlertRole[] = ["employee", "manager", "hr", "finance", "admin"];

  const summaryByRole = useMemo(() => {
    const result: Record<AlertRole, { total: number; enabled: number; alerts: string[] }> = {
      employee: { total: 0, enabled: 0, alerts: [] },
      manager: { total: 0, enabled: 0, alerts: [] },
      hr: { total: 0, enabled: 0, alerts: [] },
      finance: { total: 0, enabled: 0, alerts: [] },
      admin: { total: 0, enabled: 0, alerts: [] },
    };

    for (const def of ALERT_RULE_DEFINITIONS) {
      const config = settings.rules[def.id];
      for (const role of def.target_roles) {
        result[role].total++;
        if (config?.enabled) {
          result[role].enabled++;
          result[role].alerts.push(def.label);
        }
      }
    }

    return result;
  }, [settings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Alert Summary by Role
        </CardTitle>
        <CardDescription>
          Overview of how many email alerts each role will receive.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {roles.map((role) => {
            const info = summaryByRole[role];
            return (
              <div
                key={role}
                className={`rounded-lg border p-3 ${ROLE_COLORS[role]}`}
              >
                <p className="text-sm font-semibold">{ROLE_LABELS[role]}</p>
                <p className="text-2xl font-bold mt-1">
                  {info.enabled}
                  <span className="text-xs font-normal opacity-70">
                    /{info.total}
                  </span>
                </p>
                <p className="text-[10px] mt-1 opacity-70">active alerts</p>
              </div>
            );
          })}
        </div>

        <Separator className="my-4" />

        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Alert</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Category</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Recipients</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Frequency</th>
                <th className="text-center py-2 px-2 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {ALERT_RULE_DEFINITIONS.map((def) => {
                const config = settings.rules[def.id];
                return (
                  <tr key={def.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2 px-2 font-medium">{def.label}</td>
                    <td className="py-2 px-2 text-muted-foreground">
                      {ALERT_CATEGORIES[def.category].label}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1 flex-wrap">
                        {def.target_roles.map((r) => (
                          <Badge
                            key={r}
                            variant="outline"
                            className={`text-[9px] px-1 py-0 ${ROLE_COLORS[r]}`}
                          >
                            {ROLE_LABELS[r]}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-muted-foreground">
                      {config ? FREQUENCY_LABELS[config.frequency] : "-"}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {config?.enabled ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 inline" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground/50 inline" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EmailAlertsConfigSection() {
  const { settings: savedSettings, isLoading, saveSettings } = useEmailAlertConfig();
  const [local, setLocal] = useState<EmailAlertSettings>(savedSettings);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<AlertRole | "all">("all");
  const [activeTab, setActiveTab] = useState("configure");

  useEffect(() => {
    if (!initialized && savedSettings) {
      setLocal(savedSettings);
      setInitialized(true);
    }
  }, [savedSettings, initialized]);

  const handleRuleChange = (ruleId: string, updated: AlertRuleConfig) => {
    setLocal((prev) => ({
      ...prev,
      rules: { ...prev.rules, [ruleId]: updated },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings.mutateAsync(local);
      toast.success("Email alert configuration saved successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleEnableAll = () => {
    setLocal((prev) => {
      const rules = { ...prev.rules };
      for (const key of Object.keys(rules)) {
        rules[key] = { ...rules[key], enabled: true };
      }
      return { ...prev, rules };
    });
  };

  const handleDisableAll = () => {
    setLocal((prev) => {
      const rules = { ...prev.rules };
      for (const key of Object.keys(rules)) {
        rules[key] = { ...rules[key], enabled: false };
      }
      return { ...prev, rules };
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  const categories = Object.keys(ALERT_CATEGORIES) as AlertCategory[];
  const totalRules = ALERT_RULE_DEFINITIONS.length;
  const enabledRules = Object.values(local.rules).filter((r) => r.enabled).length;

  return (
    <div className="space-y-6">
      {/* Sender Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Sender Configuration
          </CardTitle>
          <CardDescription>
            Configure the email address and display name used for all automated email alerts.
            All notifications to employees and managers will appear to come from this address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Sender Email Address</Label>
              <p className="text-xs text-muted-foreground">
                The "From" email address for all alerts
              </p>
              <Input
                type="email"
                placeholder="noreply@company.com"
                value={local.sender_email}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, sender_email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Sender Display Name</Label>
              <p className="text-xs text-muted-foreground">
                Name shown in the recipient's inbox
              </p>
              <Input
                placeholder="HR & Admin"
                value={local.sender_name}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, sender_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Reply-To Email (Optional)</Label>
              <p className="text-xs text-muted-foreground">
                Where replies to alerts should go
              </p>
              <Input
                type="email"
                placeholder="hr@company.com"
                value={local.reply_to_email}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, reply_to_email: e.target.value }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert Rules Configuration */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Email Alert Rules
              </CardTitle>
              <CardDescription className="mt-1">
                Configure which alerts are active, their frequency, schedule, and target audience.
                <span className="ml-2 font-medium text-foreground">
                  {enabledRules}/{totalRules} alerts active
                </span>
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={handleEnableAll}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Enable All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={handleDisableAll}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Disable All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="configure" className="gap-1.5 text-xs">
                <Settings className="h-3.5 w-3.5" />
                Configure
              </TabsTrigger>
              <TabsTrigger value="summary" className="gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5" />
                Summary
              </TabsTrigger>
            </TabsList>

            <TabsContent value="configure" className="space-y-4">
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search alerts by name or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={roleFilter}
                  onValueChange={(v) => setRoleFilter(v as AlertRole | "all")}
                >
                  <SelectTrigger className="w-[160px]">
                    <Users className="h-4 w-4 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Category sections */}
              <div className="space-y-3">
                {categories.map((cat) => (
                  <CategorySection
                    key={cat}
                    category={cat}
                    settings={local}
                    onRuleChange={handleRuleChange}
                    searchQuery={searchQuery}
                    roleFilter={roleFilter}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="summary">
              <AlertSummaryTable settings={local} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end sticky bottom-4">
        <Button onClick={handleSave} disabled={saving} size="lg" className="shadow-lg">
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Email Alert Configuration
        </Button>
      </div>
    </div>
  );
}
