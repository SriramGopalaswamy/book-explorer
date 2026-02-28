import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { BookOpen, CheckCircle2 } from "lucide-react";
import { ComplianceData } from "@/hooks/useOnboardingCompliance";

const TEMPLATES = [
  { value: "standard_indian", label: "Standard Indian (Services)", desc: "Default for consulting, IT, services" },
  { value: "manufacturing", label: "Manufacturing", desc: "Includes inventory, WIP, COGS accounts" },
  { value: "trading", label: "Trading / Retail", desc: "Purchase, sales, and inventory-centric" },
  { value: "ngo", label: "Non-Profit / Trust", desc: "Fund accounting, grants, donations" },
];

interface Props {
  data: ComplianceData;
  onChange: (updates: Partial<ComplianceData>) => void;
}

export function ChartOfAccountsStep({ data, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Industry Template <span className="text-destructive">*</span></Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <Card
              key={t.value}
              className={`p-3 cursor-pointer transition-all border-2 ${
                data.industry_template === t.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              }`}
              onClick={() => onChange({ industry_template: t.value })}
            >
              <div className="flex items-start gap-2">
                <BookOpen className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </div>
                {data.industry_template === t.value && (
                  <CheckCircle2 className="h-4 w-4 text-primary ml-auto shrink-0" />
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {data.industry_template && (
        <div className="rounded-lg border border-border p-4 bg-muted/30">
          <p className="text-sm text-foreground mb-3">
            A base Chart of Accounts will be auto-generated based on the{" "}
            <strong>{TEMPLATES.find((t) => t.value === data.industry_template)?.label}</strong> template.
            This includes GST-ready tax ledgers and standard Indian accounting groups.
          </p>
          <div className="flex items-center gap-2">
            <Checkbox
              id="coa-confirm"
              checked={data.coa_confirmed ?? false}
              onCheckedChange={(v) => onChange({ coa_confirmed: !!v })}
            />
            <label htmlFor="coa-confirm" className="text-sm font-medium cursor-pointer text-foreground">
              I confirm the Chart of Accounts setup <span className="text-destructive">*</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
