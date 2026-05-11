/**
 * GBC-21 + GBC-20: extracted Settings → Organization Details section.
 *
 * Per the audit decision, Settings.tsx (1846 lines) is being broken up
 * one section at a time, with each extracted section migrating from
 * raw `useState` to react-hook-form + zod. This is the first slice; it
 * also serves as the template for the remaining sections:
 *
 *   - BrandingSection
 *   - PayrollConfigSection
 *   - GoalCycleSection
 *   - LeadershipRolesSection
 *   - IntegrationsSection
 *   - UserManagementSection
 *
 * Public contract: default export rendered by Settings.tsx with no
 * props. All data is loaded via useOnboardingCompliance.
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOnboardingCompliance } from "@/hooks/useOnboardingCompliance";
import { toast } from "sonner";

// Validation schema. Mirrors the previous client behaviour (legal name +
// address are required; pincode is exactly 6 digits per the Indian
// address-field standard called out in CLAUDE.md).
const orgInfoSchema = z.object({
  legal_name: z.string().trim().min(1, "Legal name is required").max(200, "Legal name too long"),
  registered_address: z.string().trim().min(1, "Registered address is required").max(500, "Too long"),
  state: z.string().trim().min(1, "State is required").max(80, "Too long"),
  pincode: z.string().regex(/^\d{6}$/, "Pincode must be exactly 6 digits"),
});

type OrgInfoForm = z.infer<typeof orgInfoSchema>;

const EMPTY: OrgInfoForm = { legal_name: "", registered_address: "", state: "", pincode: "" };

export default function OrganizationInfoSection() {
  const { compliance, upsert } = useOnboardingCompliance();

  const form = useForm<OrgInfoForm>({
    resolver: zodResolver(orgInfoSchema),
    defaultValues: EMPTY,
    mode: "onBlur",
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = form;

  // Re-seed the form when compliance data arrives. `reset` keeps RHF state
  // consistent (so isDirty doesn't lie) and replaces the previous
  // initialized-once useState dance.
  useEffect(() => {
    if (!compliance) return;
    reset({
      legal_name: compliance.legal_name ?? "",
      registered_address: compliance.registered_address ?? "",
      state: compliance.state ?? "",
      pincode: compliance.pincode ?? "",
    });
  }, [compliance, reset]);

  const onSubmit = async (values: OrgInfoForm) => {
    try {
      await upsert.mutateAsync(values);
      toast.success("Organization info saved");
      reset(values); // keep new baseline so isDirty goes back to false
    } catch {
      toast.error("Failed to save organization info");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Organization Details
        </CardTitle>
        <CardDescription>
          This information appears on payslips and official documents.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="legal_name">Legal Name</Label>
              <Input id="legal_name" placeholder="e.g. Acme Technologies Pvt Ltd" {...register("legal_name")} />
              {errors.legal_name && (
                <p className="text-xs text-destructive">{errors.legal_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">State</Label>
              <Input id="state" placeholder="e.g. Karnataka" {...register("state")} />
              {errors.state && (
                <p className="text-xs text-destructive">{errors.state.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="registered_address">Registered Address</Label>
            <Textarea
              id="registered_address"
              placeholder="Full registered office address"
              rows={3}
              {...register("registered_address")}
            />
            {errors.registered_address && (
              <p className="text-xs text-destructive">{errors.registered_address.message}</p>
            )}
          </div>
          <div className="space-y-1.5 sm:w-1/3">
            <Label htmlFor="pincode">Pincode</Label>
            <Input id="pincode" placeholder="e.g. 560001" maxLength={6} {...register("pincode")} />
            {errors.pincode && (
              <p className="text-xs text-destructive">{errors.pincode.message}</p>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={isSubmitting || !isDirty} className="gap-2">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
