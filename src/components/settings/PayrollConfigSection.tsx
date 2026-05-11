/**
 * GBC-21 + GBC-20: extracted Settings → Payroll Configuration section.
 *
 * Field/handler inventory:
 *   - payroll_enabled (boolean Switch)
 *   - payroll_frequency (Select: monthly | biweekly | weekly)
 *   - weekend_policy (Select: sat_sun | sun_only | none) — stored on
 *     organizations.weekend_policy, NOT on the compliance blob.
 *   - pf_applicable / esi_applicable / professional_tax_applicable /
 *     gratuity_applicable (Switches; stored on compliance).
 *   - handleSave():
 *       1. upsert compliance blob (everything except weekend_policy).
 *       2. UPDATE organizations.weekend_policy.
 *
 *   Data sources:
 *     - useOnboardingCompliance() — compliance blob + upsert mutation.
 *     - useUserOrganization()    — orgId for the weekend_policy UPDATE.
 *     - useOrgWeekendPolicy()    — current weekend_policy value.
 *
 * Migrated to react-hook-form + zod. Watch payroll_enabled to drive
 * conditional rendering of the rest of the form.
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DollarSign, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useOnboardingCompliance } from "@/hooks/useOnboardingCompliance";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useOrgWeekendPolicy } from "@/hooks/useOrgWeekendPolicy";
import { toast } from "sonner";

const payrollSchema = z.object({
  payroll_enabled: z.boolean(),
  payroll_frequency: z.enum(["monthly", "biweekly", "weekly", ""]).optional(),
  weekend_policy: z.enum(["sat_sun", "sun_only", "none"]),
  pf_applicable: z.boolean(),
  esi_applicable: z.boolean(),
  professional_tax_applicable: z.boolean(),
  gratuity_applicable: z.boolean(),
});

type PayrollForm = z.infer<typeof payrollSchema>;

const DEFAULTS: PayrollForm = {
  payroll_enabled: false,
  payroll_frequency: "",
  weekend_policy: "sat_sun",
  pf_applicable: false,
  esi_applicable: false,
  professional_tax_applicable: false,
  gratuity_applicable: false,
};

const FLAGS: { key: keyof PayrollForm; label: string; desc: string }[] = [
  { key: "pf_applicable", label: "Provident Fund (PF)", desc: "EPF contributions for eligible employees" },
  { key: "esi_applicable", label: "ESI", desc: "Employee State Insurance deductions" },
  { key: "professional_tax_applicable", label: "Professional Tax", desc: "State professional tax deduction" },
  { key: "gratuity_applicable", label: "Gratuity", desc: "Gratuity provisioning for eligible employees" },
];

export default function PayrollConfigSection() {
  const { compliance, upsert } = useOnboardingCompliance();
  const { data: org } = useUserOrganization();
  const { data: weekendPolicy } = useOrgWeekendPolicy();

  const form = useForm<PayrollForm>({
    resolver: zodResolver(payrollSchema),
    defaultValues: DEFAULTS,
    mode: "onBlur",
  });
  const { register, handleSubmit, watch, setValue, reset, formState: { isSubmitting, isDirty } } = form;

  // Seed from compliance once.
  useEffect(() => {
    if (!compliance) return;
    reset({
      payroll_enabled: compliance.payroll_enabled ?? false,
      payroll_frequency: (compliance.payroll_frequency as PayrollForm["payroll_frequency"]) || "",
      weekend_policy: "sat_sun", // overwritten by useOrgWeekendPolicy effect below
      pf_applicable: compliance.pf_applicable ?? false,
      esi_applicable: compliance.esi_applicable ?? false,
      professional_tax_applicable: compliance.professional_tax_applicable ?? false,
      gratuity_applicable: compliance.gratuity_applicable ?? false,
    });
  }, [compliance, reset]);

  // Sync weekend_policy from its dedicated hook.
  useEffect(() => {
    if (weekendPolicy === "sat_sun" || weekendPolicy === "sun_only" || weekendPolicy === "none") {
      setValue("weekend_policy", weekendPolicy);
    }
  }, [weekendPolicy, setValue]);

  const payrollEnabled = watch("payroll_enabled");

  const onSubmit = async (values: PayrollForm) => {
    try {
      const { weekend_policy, ...complianceData } = values;
      await upsert.mutateAsync(complianceData);
      if (org?.organizationId) {
        const { error } = await supabase
          .from("organizations")
          .update({ weekend_policy } as any)
          .eq("id", org.organizationId);
        if (error) throw error;
      }
      toast.success("Payroll configuration saved");
      reset(values);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Payroll Configuration
          </CardTitle>
          <CardDescription>
            Manage payroll processing settings and statutory compliance flags.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <Label className="text-sm font-medium">Enable Payroll</Label>
                <p className="text-xs text-muted-foreground">Turn on payroll processing for this organization</p>
              </div>
              <Switch
                checked={payrollEnabled}
                onCheckedChange={(v) => setValue("payroll_enabled", v, { shouldDirty: true })}
              />
            </div>

            {payrollEnabled && (
              <>
                <div className="space-y-1.5">
                  <Label>Payroll Frequency</Label>
                  <Select
                    value={watch("payroll_frequency") || ""}
                    onValueChange={(v) => setValue("payroll_frequency", v as PayrollForm["payroll_frequency"], { shouldDirty: true })}
                  >
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
                  <p className="text-xs text-muted-foreground">Controls how working days are calculated for payroll</p>
                  <Select
                    value={watch("weekend_policy")}
                    onValueChange={(v) => setValue("weekend_policy", v as PayrollForm["weekend_policy"], { shouldDirty: true })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select weekend policy" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sat_sun">5-day week (Sat & Sun off)</SelectItem>
                      <SelectItem value="sun_only">6-day week (Only Sun off)</SelectItem>
                      <SelectItem value="none">7-day week (No weekends)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {FLAGS.map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <Label className="text-sm">{label}</Label>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <Switch
                        checked={Boolean(watch(key))}
                        onCheckedChange={(v) => setValue(key, v as any, { shouldDirty: true })}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
