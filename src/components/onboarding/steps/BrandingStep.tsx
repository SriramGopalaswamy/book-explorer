import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComplianceData } from "@/hooks/useOnboardingCompliance";

interface Props {
  data: ComplianceData;
  onChange: (updates: Partial<ComplianceData>) => void;
}

export function BrandingStep({ data, onChange }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        These settings customize your invoices, quotes, and official documents. You can update these later from Settings.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Brand Color</Label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={data.brand_color || "#d6336c"}
              onChange={(e) => onChange({ brand_color: e.target.value })}
              className="h-9 w-12 rounded border border-border cursor-pointer"
            />
            <Input
              value={data.brand_color || "#d6336c"}
              onChange={(e) => onChange({ brand_color: e.target.value })}
              placeholder="#d6336c"
              className="flex-1"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Authorized Signatory Name</Label>
          <Input
            value={data.authorized_signatory_name || ""}
            onChange={(e) => onChange({ authorized_signatory_name: e.target.value })}
            placeholder="Name on official documents"
          />
        </div>
      </div>

      <div className="text-xs text-muted-foreground italic">
        Logo and signature uploads can be configured later from Settings → Branding.
      </div>
    </div>
  );
}
