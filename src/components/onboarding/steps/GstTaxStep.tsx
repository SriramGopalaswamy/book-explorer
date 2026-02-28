import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { ComplianceData } from "@/hooks/useOnboardingCompliance";

interface Props {
  data: ComplianceData;
  onChange: (updates: Partial<ComplianceData>) => void;
  locked?: boolean;
}

export function GstTaxStep({ data, onChange, locked }: Props) {
  const [newGstin, setNewGstin] = useState("");
  const gstins = data.gstin || [];

  const addGstin = () => {
    const trimmed = newGstin.trim().toUpperCase();
    if (trimmed.length === 15 && !gstins.includes(trimmed)) {
      onChange({ gstin: [...gstins, trimmed] });
      setNewGstin("");
    }
  };

  const removeGstin = (g: string) => {
    onChange({ gstin: gstins.filter((x) => x !== g) });
  };

  return (
    <div className="space-y-4">
      {locked && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning">
          GSTIN and registration fields are locked because this organization has existing transactions.
        </div>
      )}
      <div className="space-y-1.5">
        <Label>GSTIN(s)</Label>
        <div className="flex gap-2">
          <Input
            value={newGstin}
            onChange={(e) => setNewGstin(e.target.value.toUpperCase())}
            placeholder="15-character GSTIN"
            maxLength={15}
            className="flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={addGstin} disabled={newGstin.trim().length !== 15}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {gstins.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {gstins.map((g) => (
              <Badge key={g} variant="secondary" className="gap-1 pr-1">
                {g}
                <button onClick={() => removeGstin(g)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Registration Type <span className="text-destructive">*</span></Label>
          <Select value={data.registration_type || ""} onValueChange={(v) => onChange({ registration_type: v })}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="regular">Regular</SelectItem>
              <SelectItem value="composition">Composition</SelectItem>
              <SelectItem value="unregistered">Unregistered</SelectItem>
              <SelectItem value="uin">UIN Holder</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Filing Frequency <span className="text-destructive">*</span></Label>
          <Select value={data.filing_frequency || ""} onValueChange={(v) => onChange({ filing_frequency: v })}>
            <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly (QRMP)</SelectItem>
              <SelectItem value="annually">Annually</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { key: "reverse_charge_applicable", label: "Reverse Charge Applicable" },
          { key: "einvoice_applicable", label: "E-Invoice Applicable" },
          { key: "ewaybill_applicable", label: "E-Way Bill Applicable" },
          { key: "itc_eligible", label: "ITC Eligible" },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label className="text-sm cursor-pointer">{label}</Label>
            <Switch
              checked={(data as any)[key] ?? (key === "itc_eligible")}
              onCheckedChange={(v) => onChange({ [key]: v })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
