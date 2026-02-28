import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useOrganizationRoles } from "@/hooks/useOnboardingCompliance";
import { toast } from "sonner";

const ROLES = [
  { type: "CEO", label: "CEO / Managing Director" },
  { type: "Finance", label: "Finance Head / CFO" },
  { type: "HR", label: "HR Head / CHRO" },
  { type: "Compliance", label: "Compliance Officer" },
];

export function LeadershipRolesStep() {
  const { roles, upsertRole } = useOrganizationRoles();
  const [editing, setEditing] = useState<Record<string, { name: string; email: string }>>({});

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

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Assign key leadership roles. These are informational and can be updated later.
      </p>
      {ROLES.map(({ type, label }) => {
        const existing = getExisting(type);
        const isEditing = type in editing;

        if (existing && !isEditing) {
          return (
            <div key={type} className="flex items-center justify-between rounded-lg border border-border p-3">
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
          <div key={type} className="rounded-lg border border-border p-3 space-y-2">
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
                {upsertRole.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Save
              </Button>
              {!existing && (
                <Button variant="ghost" size="sm" onClick={() => setEditing((p) => { const n = { ...p }; delete n[type]; return n; })}>
                  Skip
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
