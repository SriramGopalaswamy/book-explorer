import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComplianceData } from "@/hooks/useOnboardingCompliance";

interface Props {
  data: ComplianceData;
  onChange: (updates: Partial<ComplianceData>) => void;
}

export function PayrollFlagsStep({ data, onChange }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure payroll defaults. These can be changed later from HRMS → Settings.
      </p>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <Label className="text-sm">Enable Payroll</Label>
          <p className="text-xs text-muted-foreground">Turn on payroll processing for this organization</p>
        </div>
        <Switch
          checked={data.payroll_enabled ?? false}
          onCheckedChange={(v) => onChange({ payroll_enabled: v })}
        />
      </div>

      {data.payroll_enabled && (
        <>
          <div className="space-y-1.5">
            <Label>Payroll Frequency</Label>
            <Select value={data.payroll_frequency || ""} onValueChange={(v) => onChange({ payroll_frequency: v })}>
              <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="biweekly">Bi-weekly</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Weekend Policy</Label>
            <p className="text-xs text-muted-foreground">Used to auto-calculate working days for payroll</p>
            <Select value={(data as any).weekend_policy || "sat_sun"} onValueChange={(v) => onChange({ weekend_policy: v } as any)}>
              <SelectTrigger><SelectValue placeholder="Select weekend policy" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sat_sun">5-day week (Sat & Sun off)</SelectItem>
                <SelectItem value="sun_only">6-day week (Only Sun off)</SelectItem>
                <SelectItem value="none">7-day week (No weekends)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { key: "pf_applicable", label: "Provident Fund (PF)", desc: "EPF contributions" },
              { key: "esi_applicable", label: "ESI", desc: "Employee State Insurance" },
              { key: "professional_tax_applicable", label: "Professional Tax", desc: "State professional tax" },
              { key: "gratuity_applicable", label: "Gratuity", desc: "Gratuity provisioning" },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="text-sm">{label}</Label>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Switch
                  checked={(data as any)[key] ?? false}
                  onCheckedChange={(v) => onChange({ [key]: v })}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
