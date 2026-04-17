import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import {
  RESOURCE_GROUPS,
  RESOURCE_LABELS,
  CONFIGURABLE_ROLES,
  LOCKED_ROLES,
  ACTIONS,
  DEFAULT_PERMISSIONS,
  ResourceKey,
  ActionKey,
  ConfigurableRole,
} from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ShieldCheck, Save, RotateCcw, Lock, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
type PermCell = {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
};

type MatrixState = Record<ConfigurableRole, Record<ResourceKey, PermCell>>;

const ACTIONS_ORDER: { key: ActionKey; short: string; label: string }[] = [
  { key: ACTIONS.VIEW,   short: "V", label: "View"   },
  { key: ACTIONS.CREATE, short: "C", label: "Create" },
  { key: ACTIONS.EDIT,   short: "E", label: "Edit"   },
  { key: ACTIONS.DELETE, short: "D", label: "Delete" },
  { key: ACTIONS.EXPORT, short: "X", label: "Export" },
];

const ROLE_COLORS: Record<string, string> = {
  hr:       "bg-primary/10 text-primary border-primary/20",
  manager:  "bg-accent/50 text-accent-foreground border-accent",
  finance:  "bg-chart-2/10 text-chart-2 border-chart-2/20",
  payroll:  "bg-purple-500/10 text-purple-600 border-purple-500/20",
  employee: "bg-muted text-muted-foreground border-border",
};

const ROLE_DISPLAY: Record<string, string> = {
  hr: "HR", manager: "Manager", finance: "Finance", payroll: "Payroll", employee: "Employee",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function defaultMatrix(): MatrixState {
  const matrix = {} as MatrixState;
  for (const role of CONFIGURABLE_ROLES) {
    matrix[role] = {} as Record<ResourceKey, PermCell>;
    const defaults = DEFAULT_PERMISSIONS[role];
    for (const group of RESOURCE_GROUPS) {
      for (const resource of group.resources) {
        const d = defaults[resource] ?? { can_view: false, can_create: false, can_edit: false, can_delete: false, can_export: false };
        matrix[role][resource] = { ...d };
      }
    }
  }
  return matrix;
}

function rowsToMatrix(rows: { role: string; resource: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean; can_export: boolean }[]): MatrixState {
  const matrix = defaultMatrix();
  for (const row of rows) {
    const role = row.role as ConfigurableRole;
    const resource = row.resource as ResourceKey;
    if (!CONFIGURABLE_ROLES.includes(role)) continue;
    matrix[role][resource] = {
      can_view:   row.can_view,
      can_create: row.can_create,
      can_edit:   row.can_edit,
      can_delete: row.can_delete,
      can_export: row.can_export,
    };
  }
  return matrix;
}

// ── Data hook ──────────────────────────────────────────────────────────────────
function useOrgPermissionRows(orgId: string | undefined) {
  return useQuery({
    queryKey: ["org-role-permissions-all", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role, resource, can_view, can_create, can_edit, can_delete, can_export")
        .eq("organization_id", orgId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 1000 * 60,
  });
}

// ── Checkbox cell ──────────────────────────────────────────────────────────────
interface PermCellProps {
  value: boolean;
  label: string;
  short: string;
  onChange: (v: boolean) => void;
  locked?: boolean;
}

function PermCheckbox({ value, label, short, onChange, locked }: PermCellProps) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] font-mono text-muted-foreground/70 uppercase">{short}</span>
      <Checkbox
        checked={locked ? true : value}
        disabled={locked}
        aria-label={label}
        onCheckedChange={(checked) => onChange(!!checked)}
        className={cn(
          "h-4 w-4",
          locked && "opacity-50 cursor-not-allowed"
        )}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function RolePermissionsTab() {
  const { data: orgData, isLoading: orgLoading } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();

  const { data: dbRows, isLoading: dbLoading } = useOrgPermissionRows(orgId);
  const [matrix, setMatrix] = useState<MatrixState>(() => defaultMatrix());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initialise matrix from DB rows (or defaults if no rows)
  useEffect(() => {
    if (dbLoading) return;
    setMatrix(rowsToMatrix(dbRows ?? []));
    setDirty(false);
  }, [dbRows, dbLoading]);

  const setCell = useCallback(
    (role: ConfigurableRole, resource: ResourceKey, action: ActionKey, value: boolean) => {
      setMatrix((prev) => ({
        ...prev,
        [role]: {
          ...prev[role],
          [resource]: {
            ...prev[role][resource],
            [action]: value,
          },
        },
      }));
      setDirty(true);
    },
    []
  );

  const handleReset = () => {
    setMatrix(defaultMatrix());
    setDirty(true);
  };

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const rows: {
        organization_id: string;
        role: string;
        resource: string;
        can_view: boolean;
        can_create: boolean;
        can_edit: boolean;
        can_delete: boolean;
        can_export: boolean;
        updated_at: string;
      }[] = [];

      for (const role of CONFIGURABLE_ROLES) {
        for (const group of RESOURCE_GROUPS) {
          for (const resource of group.resources) {
            const cell = matrix[role][resource];
            rows.push({
              organization_id: orgId,
              role,
              resource,
              can_view:   cell.can_view,
              can_create: cell.can_create,
              can_edit:   cell.can_edit,
              can_delete: cell.can_delete,
              can_export: cell.can_export,
              updated_at: new Date().toISOString(),
            });
          }
        }
      }

      const { error } = await supabase
        .from("role_permissions")
        .upsert(rows, { onConflict: "organization_id,role,resource" });

      if (error) throw error;

      await qc.invalidateQueries({ queryKey: ["org-role-permissions-all", orgId] });
      await qc.invalidateQueries({ queryKey: ["role-permissions"] });
      setDirty(false);
      toast.success("Role permissions saved successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save permissions. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const isLoading = orgLoading || dbLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Roles & Permissions
          </CardTitle>
          <CardDescription>
            Configure what each role can do in your organisation. Toggle actions per resource below.
            <strong className="block mt-1 text-foreground/70">
              Admin and Super Admin always have full access and cannot be restricted.
            </strong>
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" />
          <span>Actions per cell:</span>
        </div>
        {ACTIONS_ORDER.map(({ short, label }) => (
          <span key={short} className="font-mono">
            <span className="font-bold text-foreground">{short}</span> = {label}
          </span>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <Lock className="h-3.5 w-3.5" />
          <span>Locked = always granted</span>
        </div>
      </div>

      {/* Locked-role notice */}
      <div className="flex gap-2 flex-wrap">
        {LOCKED_ROLES.map((r) => (
          <Badge key={r} variant="outline" className="gap-1.5 text-xs">
            <Lock className="h-3 w-3" />
            {r === "admin" ? "Admin" : "Super Admin"} — Full access (locked)
          </Badge>
        ))}
      </div>

      {/* Permission matrix */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground w-48">Resource</th>
                  {CONFIGURABLE_ROLES.map((role) => (
                    <th key={role} className="px-3 py-3 text-center">
                      <Badge variant="outline" className={cn("text-xs", ROLE_COLORS[role])}>
                        {ROLE_DISPLAY[role]}
                      </Badge>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RESOURCE_GROUPS.map((group) => (
                  <>
                    {/* Group header row */}
                    <tr key={`group-${group.label}`} className="border-t-2 border-border/60">
                      <td
                        colSpan={CONFIGURABLE_ROLES.length + 1}
                        className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20"
                      >
                        {group.label}
                      </td>
                    </tr>
                    {/* Resource rows */}
                    {group.resources.map((resource, i) => (
                      <tr
                        key={resource}
                        className={cn(
                          "border-b border-border/40 transition-colors hover:bg-muted/10",
                          i % 2 === 0 ? "" : "bg-muted/5"
                        )}
                      >
                        <td className="px-4 py-2 font-medium text-sm text-foreground/80 whitespace-nowrap">
                          {RESOURCE_LABELS[resource]}
                        </td>
                        {CONFIGURABLE_ROLES.map((role) => {
                          const cell = matrix[role]?.[resource] ?? {
                            can_view: false, can_create: false, can_edit: false, can_delete: false, can_export: false,
                          };
                          return (
                            <td key={role} className="px-3 py-2">
                              <div className="flex items-center justify-center gap-2">
                                {ACTIONS_ORDER.map(({ key, short, label }) => (
                                  <PermCheckbox
                                    key={key}
                                    value={cell[key as keyof PermCell]}
                                    short={short}
                                    label={`${ROLE_DISPLAY[role]} — ${label} — ${RESOURCE_LABELS[resource]}`}
                                    onChange={(v) => setCell(role, resource, key, v)}
                                  />
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Action bar */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="gap-1.5"
          disabled={saving}
        >
          <RotateCcw className="h-4 w-4" />
          Reset to Defaults
        </Button>

        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="gap-1.5"
          >
            {saving ? (
              <>Saving…</>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Permissions
              </>
            )}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground px-1">
        Changes take effect immediately for all users of this organisation on their next page navigation.
        Note: database-level security (RLS) is the final enforcement layer — permissions configured here
        cannot exceed what the underlying database policy allows.
      </p>
    </div>
  );
}
