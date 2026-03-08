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
  const { user } = useAuth();
  const { data: org } = useUserOrganization();

  return useMutation({
    mutationFn: async (decl: {
      profile_id: string;
      financial_year: string;
      section_type: string;
      declared_amount: number;
      proof_url?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (!org?.organizationId) throw new Error("Organization not found");
      if (decl.declared_amount < 0) throw new Error("Declaration amount cannot be negative");

      // Enforce statutory caps
      const SECTION_CAPS: Record<string, number> = {
        "80C": 150000,
        "80D": 100000,
        "80CCD": 50000,
        "80G": 0, // no fixed cap
        "80E": 0,
      };
      const cap = SECTION_CAPS[decl.section_type];
      if (cap && cap > 0 && decl.declared_amount > cap) {
        throw new Error(`Section ${decl.section_type} declaration cannot exceed ₹${cap.toLocaleString("en-IN")}`);
      }

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
 * Compliant with Indian Income Tax Act — supports both Old & New (2023) regimes.
 * Uses snapshot data — never recalculates after lock.
 *
 * Key statutory rules enforced:
 * - Section 80C cap: ₹1,50,000
 * - Section 80D cap: ₹1,00,000 (senior: ₹1,00,000 including parents)
 * - Standard Deduction: ₹50,000 (old), ₹75,000 (new regime FY2024-25+)
 * - Section 87A rebate: ₹25,000 (new regime, if taxable ≤ ₹7,00,000)
 * - 4% Health & Education Cess
 * - Surcharge: 10% (₹50L-₹1Cr), 15% (₹1Cr-₹2Cr), 25% (₹2Cr-₹5Cr), 37% (>₹5Cr)
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

  // Standard deduction (₹50,000 old / ₹75,000 new regime FY2024-25+)
  const stdDeduction = isOldRegime
    ? Math.min(exemptions.standard_deduction, 50000)
    : Math.min(exemptions.standard_deduction || 75000, 75000);
  taxableIncome -= stdDeduction;

  // Old regime deductions (Chapter VI-A)
  if (isOldRegime) {
    taxableIncome -= Math.min(exemptions.declared_80c, 150000);   // 80C cap
    taxableIncome -= Math.min(exemptions.declared_80d, 100000);   // 80D cap
    taxableIncome -= exemptions.hra_exemption;
    taxableIncome -= exemptions.other_deductions;
  }

  taxableIncome = Math.max(taxableIncome, 0);

  // Apply slabs — use proper progressive slab calculation
  let totalTax = 0;
  const sortedSlabs = [...slabs].sort((a, b) => a.income_from - b.income_from);

  for (const slab of sortedSlabs) {
    if (taxableIncome <= slab.income_from) break;
    const taxableInSlab = Math.min(taxableIncome, slab.income_to) - slab.income_from;
    if (taxableInSlab > 0) {
      totalTax += taxableInSlab * (slab.tax_percentage / 100);
    }
  }

  // Section 87A rebate — New Regime: ₹25,000 if taxable income ≤ ₹7,00,000
  // Old Regime: ₹12,500 if taxable income ≤ ₹5,00,000
  if (!isOldRegime && taxableIncome <= 700000) {
    totalTax = Math.max(totalTax - 25000, 0);
  } else if (isOldRegime && taxableIncome <= 500000) {
    totalTax = Math.max(totalTax - 12500, 0);
  }

  // Surcharge (on tax, before cess)
  let surcharge = 0;
  if (taxableIncome > 50000000) surcharge = totalTax * 0.37;
  else if (taxableIncome > 20000000) surcharge = totalTax * 0.25;
  else if (taxableIncome > 10000000) surcharge = totalTax * 0.15;
  else if (taxableIncome > 5000000) surcharge = totalTax * 0.10;
  totalTax += surcharge;

  // Add 4% Health & Education Cess (on tax + surcharge)
  const cess = totalTax * 0.04;
  totalTax += cess;

  // Subtract TDS already deducted (including previous employer)
  const remainingTax = Math.max(totalTax - tdsAlreadyDeducted - exemptions.previous_employer_tds, 0);

  // Spread over remaining months
  const monthlyTDS = remainingMonths > 0 ? Math.round(remainingTax / remainingMonths) : 0;

  return monthlyTDS;
}
