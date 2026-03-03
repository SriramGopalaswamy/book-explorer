import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";

export interface PayrollFlags {
  payroll_enabled: boolean;
  payroll_frequency: string;
  pf_applicable: boolean;
  esi_applicable: boolean;
  professional_tax_applicable: boolean;
  gratuity_applicable: boolean;
}

const DEFAULTS: PayrollFlags = {
  payroll_enabled: true,
  payroll_frequency: "monthly",
  pf_applicable: false,
  esi_applicable: false,
  professional_tax_applicable: false,
  gratuity_applicable: false,
};

/**
 * Fetches org-level payroll compliance flags from organization_compliance.
 * These flags control whether PF, ESI, Professional Tax, and Gratuity
 * deductions are computed in payroll and shown in statutory filings.
 */
export function usePayrollFlags() {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();

  return useQuery({
    queryKey: ["payroll-flags", org?.organizationId],
    queryFn: async () => {
      if (!org?.organizationId) return DEFAULTS;

      const { data, error } = await supabase
        .from("organization_compliance")
        .select("payroll_enabled, payroll_frequency, pf_applicable, esi_applicable, professional_tax_applicable, gratuity_applicable")
        .eq("organization_id", org.organizationId)
        .maybeSingle();

      if (error) {
        console.warn("Failed to fetch payroll flags:", error.message);
        return DEFAULTS;
      }

      if (!data) return DEFAULTS;

      return {
        payroll_enabled: data.payroll_enabled ?? DEFAULTS.payroll_enabled,
        payroll_frequency: data.payroll_frequency ?? DEFAULTS.payroll_frequency,
        pf_applicable: data.pf_applicable ?? DEFAULTS.pf_applicable,
        esi_applicable: data.esi_applicable ?? DEFAULTS.esi_applicable,
        professional_tax_applicable: data.professional_tax_applicable ?? DEFAULTS.professional_tax_applicable,
        gratuity_applicable: data.gratuity_applicable ?? DEFAULTS.gratuity_applicable,
      } as PayrollFlags;
    },
    enabled: !!user && !!org?.organizationId,
    staleTime: 1000 * 60 * 10, // 10 min — flags rarely change
  });
}
