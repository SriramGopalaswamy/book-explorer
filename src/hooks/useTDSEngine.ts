import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface TaxRegime {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  financial_year: string;
}

export interface TaxSlab {
  id: string;
  regime_id: string;
  income_from: number;
  income_to: number;
  tax_percentage: number;
  cess_percentage: number;
}

export interface EmployeeTaxSettings {
  id: string;
  profile_id: string;
  organization_id: string;
  regime_id: string | null;
  financial_year: string;
  declared_80c: number;
  declared_80d: number;
  hra_exemption: number;
  standard_deduction: number;
  other_deductions: number;
  previous_employer_income: number;
  previous_employer_tds: number;
}

export interface InvestmentDeclaration {
  id: string;
  profile_id: string;
  organization_id: string;
  financial_year: string;
  section_type: string;
  declared_amount: number;
  approved_amount: number;
  proof_url: string | null;
  status: string;
  notes: string | null;
}

export function useTaxRegimes() {
  return useQuery({
    queryKey: ["tax-regimes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_regimes")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as TaxRegime[];
    },
  });
}

export function useTaxSlabs(regimeId: string | null) {
  return useQuery({
    queryKey: ["tax-slabs", regimeId],
    queryFn: async () => {
      if (!regimeId) return [];
      const { data, error } = await supabase
        .from("tax_slabs")
        .select("*")
        .eq("regime_id", regimeId)
        .order("income_from");
      if (error) throw error;
      return (data ?? []) as TaxSlab[];
    },
    enabled: !!regimeId,
  });
}

export function useEmployeeTaxSettings(profileId: string | null, fy: string) {
  const { data: org } = useUserOrganization();
  return useQuery({
    queryKey: ["employee-tax-settings", profileId, fy],
    queryFn: async () => {
      if (!profileId || !org?.organizationId) return null;
      const { data, error } = await supabase
        .from("employee_tax_settings")
        .select("*")
        .eq("profile_id", profileId)
        .eq("organization_id", org.organizationId)
        .eq("financial_year", fy)
        .maybeSingle();
      if (error) throw error;
      return data as EmployeeTaxSettings | null;
    },
    enabled: !!profileId && !!org?.organizationId,
  });
}

export function useInvestmentDeclarations(profileId: string | null, fy: string) {
  const { data: org } = useUserOrganization();
  return useQuery({
    queryKey: ["investment-declarations", profileId, fy],
    queryFn: async () => {
      if (!profileId || !org?.organizationId) return [];
      const { data, error } = await supabase
        .from("investment_declarations")
        .select("*")
        .eq("profile_id", profileId)
        .eq("organization_id", org.organizationId)
        .eq("financial_year", fy)
        .order("section_type");
      if (error) throw error;
      return (data ?? []) as InvestmentDeclaration[];
    },
    enabled: !!profileId && !!org?.organizationId,
  });
}

export function useSaveInvestmentDeclaration() {
  const queryClient = useQueryClient();
  const { data: org } = useUserOrganization();

  return useMutation({
    mutationFn: async (decl: {
      profile_id: string;
      financial_year: string;
      section_type: string;
      declared_amount: number;
      proof_url?: string;
    }) => {
      if (!org?.organizationId) throw new Error("Organization not found");
      const { error } = await supabase.from("investment_declarations").insert({
        ...decl,
        organization_id: org.organizationId,
        status: "submitted",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment-declarations"] });
      toast.success("Declaration submitted");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useApproveDeclaration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approved_amount }: { id: string; approved_amount: number }) => {
      const { error } = await supabase
        .from("investment_declarations")
        .update({
          status: "approved",
          approved_amount,
          reviewed_by: (await supabase.auth.getUser()).data.user?.id,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment-declarations"] });
      toast.success("Declaration approved");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

/**
 * Compute monthly TDS for an employee.
 * Uses snapshot data — never recalculates after lock.
 */
export function computeMonthlyTDS(params: {
  annualCTC: number;
  hra: number;
  slabs: TaxSlab[];
  exemptions: {
    standard_deduction: number;
    declared_80c: number;
    declared_80d: number;
    hra_exemption: number;
    other_deductions: number;
    previous_employer_income: number;
    previous_employer_tds: number;
  };
  tdsAlreadyDeducted: number;
  remainingMonths: number;
  isOldRegime: boolean;
}): number {
  const { annualCTC, slabs, exemptions, tdsAlreadyDeducted, remainingMonths, isOldRegime } = params;

  let taxableIncome = annualCTC + exemptions.previous_employer_income;

  // Standard deduction
  taxableIncome -= exemptions.standard_deduction;

  // Old regime deductions
  if (isOldRegime) {
    taxableIncome -= Math.min(exemptions.declared_80c, 150000);
    taxableIncome -= Math.min(exemptions.declared_80d, 100000);
    taxableIncome -= exemptions.hra_exemption;
    taxableIncome -= exemptions.other_deductions;
  }

  taxableIncome = Math.max(taxableIncome, 0);

  // Apply slabs
  let totalTax = 0;
  for (const slab of slabs) {
    if (taxableIncome <= 0) break;
    const slabRange = slab.income_to - slab.income_from + 1;
    const taxableInSlab = Math.min(
      Math.max(taxableIncome - slab.income_from, 0),
      slabRange
    );
    if (taxableInSlab > 0 && taxableIncome >= slab.income_from) {
      totalTax += taxableInSlab * (slab.tax_percentage / 100);
    }
  }

  // Add 4% health & education cess
  const cess = totalTax * 0.04;
  totalTax += cess;

  // Subtract TDS already deducted (including previous employer)
  const remainingTax = Math.max(totalTax - tdsAlreadyDeducted - exemptions.previous_employer_tds, 0);

  // Spread over remaining months
  const monthlyTDS = remainingMonths > 0 ? Math.round(remainingTax / remainingMonths) : 0;

  return monthlyTDS;
}
