/**
 * GBC-21: extracted Settings → Leadership Roles section.
 *
 * Field/handler inventory:
 *   - One row per role_type (CEO, Finance, HR, Compliance).
 *   - Each row: name (text), email (text).
 *   - editing state is a Record<role_type, { name, email }>; presence in
 *     this map indicates the row is in edit mode. Save removes the entry.
 *
 *   Data source: useOrganizationRoles() — list + upsertRole mutation.
 *
 *   Validation: name required, email required + must be a valid email.
 *   Validation is enforced at save time via a zod schema parse (kept
 *   simple — no RHF since each row has independent state).
 */

import { useState } from "react";
import { z } from "zod";
import { UserCheck, CheckCircle2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationRoles } from "@/hooks/useOnboardingCompliance";
import { toast } from "sonner";

const roleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Enter a valid email"),
});

const ROLES = [
  { type: "CEO", label: "CEO / Managing Director" },
  { type: "Finance", label: "Finance Head / CFO" },
  { type: "HR", label: "HR Head / CHRO" },
  { type: "Compliance", label: "Compliance Officer" },
];

export default function LeadershipRolesSection() {
  const { roles, isLoading, upsertRole } = useOrganizationRoles();
  const [editing, setEditing] = useState<Record<string, { name: string; email: string }>>({});

  const getExisting = (type: string) => roles.find((r: any) => r.role_type === type);

  const handleSave = async (type: string) => {
    const val = editing[type];
    if (!val) return;
    const parsed = roleSchema.safeParse(val);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    try {
      await upsertRole.mutateAsync({ role_type: type, name: parsed.data.name, email: parsed.data.email });
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing((p) => { const n = { ...p }; delete n[type]; return n; })}
                  >
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
