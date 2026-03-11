import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimal_places: number;
  is_active: boolean;
}

export interface ExchangeRate {
  id: string;
  organization_id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_date: string;
  source: string;
  created_at: string;
}

export function useCurrencies() {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies" as any).select("*").eq("is_active", true).order("code");
      if (error) throw error;
      return (data || []) as unknown as Currency[];
    },
  });
}

export function useExchangeRates() {
  return useQuery({
    queryKey: ["exchange-rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exchange_rates" as any).select("*").order("effective_date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ExchangeRate[];
    },
  });
}

export function useCreateExchangeRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { from_currency: string; to_currency: string; rate: number; effective_date: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!profile?.organization_id) throw new Error("No organization found");
      const { error } = await supabase.from("exchange_rates" as any).insert({ ...r, organization_id: profile.organization_id } as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exchange-rates"] }); toast.success("Exchange rate saved"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useGSTFilingStatus(financialYear: string) {
  return useQuery({
    queryKey: ["gst-filing-status", financialYear],
    queryFn: async () => {
      const { data, error } = await supabase.from("gst_filing_status" as any).select("*").eq("financial_year", financialYear).order("period_month");
      if (error) throw error;
      return (data || []) as unknown as GSTFilingStatus[];
    },
  });
}

export interface GSTFilingStatus {
  id: string;
  organization_id: string;
  filing_type: string;
  period_month: number;
  period_year: number;
  financial_year: string;
  status: string;
  filed_date: string | null;
  arn_number: string | null;
  total_tax_liability: number;
  total_itc_claimed: number;
  net_tax_payable: number;
  challan_number: string | null;
  challan_date: string | null;
  notes: string | null;
}

export function useUpdateFilingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (update: { id?: string; filing_type: string; period_month: number; period_year: number; financial_year: string; status: string; arn_number?: string; challan_number?: string; filed_date?: string; total_tax_liability?: number; total_itc_claimed?: number; net_tax_payable?: number }) => {
      if (update.id) {
        const { error } = await supabase.from("gst_filing_status" as any).update({
          status: update.status,
          arn_number: update.arn_number || null,
          challan_number: update.challan_number || null,
          filed_date: update.filed_date || null,
          total_tax_liability: update.total_tax_liability || 0,
          total_itc_claimed: update.total_itc_claimed || 0,
          net_tax_payable: update.net_tax_payable || 0,
          updated_at: new Date().toISOString(),
        } as any).eq("id", update.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("gst_filing_status" as any).insert({
          filing_type: update.filing_type,
          period_month: update.period_month,
          period_year: update.period_year,
          financial_year: update.financial_year,
          status: update.status,
          arn_number: update.arn_number || null,
          challan_number: update.challan_number || null,
          filed_date: update.filed_date || null,
          total_tax_liability: update.total_tax_liability || 0,
          total_itc_claimed: update.total_itc_claimed || 0,
          net_tax_payable: update.net_tax_payable || 0,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gst-filing-status"] }); toast.success("Filing status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}
