import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  KeyRound,
  Plus,
  Copy,
  Ban,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  BookOpen,
  Users,
  Target,
  Shield,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const ALL_MODULES = [
  { id: "financial", label: "Financial Suite", icon: BookOpen, description: "Invoicing, Bills, Banking, Expenses, Assets, Analytics" },
  { id: "hrms", label: "HRMS", icon: Users, description: "Employees, Attendance, Leaves, Payroll, Org Chart" },
  { id: "performance", label: "Performance OS", icon: Target, description: "Goals, Memos, Reviews" },
  { id: "audit", label: "CA Audit Console", icon: Shield, description: "Compliance runs, AI audit engine" },
  { id: "assets", label: "Asset Management", icon: Package, description: "Fixed assets, Depreciation tracking" },
] as const;

type ModuleId = (typeof ALL_MODULES)[number]["id"];

function generatePasskey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "";
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  for (let i = 0; i < 24; i++) {
    key += chars[array[i] % chars.length];
  }
  return key;
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function PlatformSubscriptionKeys() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [plan, setPlan] = useState("professional");
  const [maxUses, setMaxUses] = useState("1");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [enabledModules, setEnabledModules] = useState<ModuleId[]>(
    ALL_MODULES.map((m) => m.id)
  );

  const toggleModule = (moduleId: ModuleId) => {
    setEnabledModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((m) => m !== moduleId)
        : [...prev, moduleId]
    );
  };

  // Fetch keys
  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["subscription-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_keys")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch redemptions
  const { data: redemptions = [] } = useQuery({
    queryKey: ["subscription-redemptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_redemptions")
        .select("*, organizations:organization_id(name)")
        .order("redeemed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredKeys = useMemo(() => {
    if (filter === "all") return keys;
    return keys.filter((k: any) => k.status === filter);
  }, [keys, filter]);

  // Create key
  const createMutation = useMutation({
    mutationFn: async () => {
      if (enabledModules.length === 0) {
        throw new Error("At least one module must be enabled");
      }
      const plainKey = generatePasskey();
      const hash = await sha256(plainKey);
      const expiresAt = expiresInDays
        ? new Date(Date.now() + parseInt(expiresInDays) * 86400000).toISOString()
        : null;

      const { error } = await supabase.from("subscription_keys").insert({
        key_hash: hash,
        plan,
        max_uses: parseInt(maxUses),
        expires_at: expiresAt,
        created_by: user?.id,
        enabled_modules: enabledModules,
      });
      if (error) throw error;
      return plainKey;
    },
    onSuccess: (key) => {
      setGeneratedKey(key);
      queryClient.invalidateQueries({ queryKey: ["subscription-keys"] });
      toast.success("Subscription key generated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Revoke key
  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase
        .from("subscription_keys")
        .update({ status: "revoked" })
        .eq("id", keyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-keys"] });
      toast.success("Key revoked");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>;
      case "revoked":
        return <Badge variant="destructive"><Ban className="h-3 w-3 mr-1" />Revoked</Badge>;
      case "expired":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const modulesBadges = (modules: string[] | null) => {
    if (!modules || modules.length === 0) return <span className="text-xs text-muted-foreground">None</span>;
    if (modules.length === ALL_MODULES.length) {
      return <Badge variant="outline" className="text-xs">All Modules</Badge>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {modules.map((m) => (
          <Badge key={m} variant="outline" className="text-xs capitalize">{m}</Badge>
        ))}
      </div>
    );
  };

  return (
    <PlatformLayout title="Subscription Keys" subtitle="Generate and manage tenant activation keys">
      <div className="space-y-6">
        {/* Actions bar */}
        <div className="flex items-center justify-between">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Keys</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>

          <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setGeneratedKey(null); setEnabledModules(ALL_MODULES.map((m) => m.id)); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Generate Key</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Generate Subscription Key</DialogTitle>
                <DialogDescription>
                  Create a new passkey for tenant activation. Choose which modules to enable.
                </DialogDescription>
              </DialogHeader>

              {generatedKey ? (
                <div className="space-y-4 pt-2">
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-xs text-muted-foreground mb-2">
                      <AlertTriangle className="h-3 w-3 inline mr-1" />
                      This key is shown only once. Copy it now.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 font-mono text-lg tracking-widest text-primary font-bold">
                        {generatedKey}
                      </code>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(generatedKey)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Enabled modules:</span>{" "}
                    {enabledModules.map((m) => ALL_MODULES.find((am) => am.id === m)?.label).join(", ")}
                  </div>
                  <Button className="w-full" onClick={() => { setCreateOpen(false); setGeneratedKey(null); setEnabledModules(ALL_MODULES.map((m) => m.id)); }}>
                    Done
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Plan</Label>
                    <Select value={plan} onValueChange={setPlan}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Module selection */}
                  <div>
                    <Label className="mb-2 block">Enabled Modules</Label>
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      {ALL_MODULES.map((mod) => {
                        const Icon = mod.icon;
                        const checked = enabledModules.includes(mod.id);
                        return (
                          <label
                            key={mod.id}
                            className="flex items-start gap-3 p-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleModule(mod.id)}
                              className="mt-0.5"
                            />
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium leading-none">{mod.label}</p>
                                <p className="text-xs text-muted-foreground mt-1">{mod.description}</p>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    {enabledModules.length === 0 && (
                      <p className="text-xs text-destructive mt-1">At least one module must be selected</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Max Uses</Label>
                      <Input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
                    </div>
                    <div>
                      <Label>Expires In (days)</Label>
                      <Input type="number" min="1" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} placeholder="No expiry" />
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending || enabledModules.length === 0}
                  >
                    {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                    Generate
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Keys table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Keys ({filteredKeys.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filteredKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No subscription keys found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hash (prefix)</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Modules</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredKeys.map((key: any) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-mono text-xs">{key.key_hash?.substring(0, 12)}…</TableCell>
                      <TableCell><Badge variant="outline">{key.plan}</Badge></TableCell>
                      <TableCell>{modulesBadges(key.enabled_modules)}</TableCell>
                      <TableCell>{key.used_count}/{key.max_uses}</TableCell>
                      <TableCell>{statusBadge(key.status)}</TableCell>
                      <TableCell className="text-xs">
                        {key.expires_at ? format(new Date(key.expires_at), "MMM d, yyyy") : "Never"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(key.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {key.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => revokeMutation.mutate(key.id)}
                            disabled={revokeMutation.isPending}
                          >
                            <Ban className="h-3 w-3 mr-1" />Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Redemption history */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Redemption History</CardTitle>
            <CardDescription>Recent key activations across tenants</CardDescription>
          </CardHeader>
          <CardContent>
            {redemptions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No redemptions yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Key (prefix)</TableHead>
                    <TableHead>Redeemed At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {redemptions.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{(r.organizations as any)?.name ?? r.organization_id}</TableCell>
                      <TableCell className="font-mono text-xs">{r.subscription_key_id?.substring(0, 8)}…</TableCell>
                      <TableCell className="text-xs">{format(new Date(r.redeemed_at), "MMM d, yyyy HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PlatformLayout>
  );
}
