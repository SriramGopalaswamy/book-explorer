import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ComplianceData } from "@/hooks/useOnboardingCompliance";

interface Props {
  data: ComplianceData;
  onChange: (updates: Partial<ComplianceData>) => void;
  locked?: boolean;
}

export function FinancialSetupStep({ data, onChange, locked }: Props) {
  return (
    <div className="space-y-4">
      {locked && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning">
          Financial year, books start date, and accounting method are locked because this organization has existing transactions.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Financial Year Start <span className="text-destructive">*</span></Label>
          <Select value={data.financial_year_start || ""} onValueChange={(v) => onChange({ financial_year_start: v })} disabled={locked}>
            <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="april">April (Indian standard)</SelectItem>
              <SelectItem value="january">January</SelectItem>
              <SelectItem value="july">July</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Books Start Date <span className="text-destructive">*</span></Label>
          <Input
            type="date"
            value={data.books_start_date || ""}
            onChange={(e) => onChange({ books_start_date: e.target.value })}
            disabled={locked}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Accounting Method <span className="text-destructive">*</span></Label>
          <Select value={data.accounting_method || "accrual"} onValueChange={(v) => onChange({ accounting_method: v })} disabled={locked}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="accrual">Accrual</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Base Currency</Label>
          <Select value={data.base_currency || "INR"} onValueChange={(v) => onChange({ base_currency: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="INR">INR — Indian Rupee</SelectItem>
              <SelectItem value="USD">USD — US Dollar</SelectItem>
              <SelectItem value="EUR">EUR — Euro</SelectItem>
              <SelectItem value="GBP">GBP — British Pound</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <Label className="text-sm cursor-pointer">MSME Registered</Label>
          <p className="text-xs text-muted-foreground">Mark if your entity is registered as an MSME</p>
        </div>
        <Switch
          checked={data.msme_status ?? false}
          onCheckedChange={(v) => onChange({ msme_status: v })}
        />
      </div>
    </div>
  );
}
