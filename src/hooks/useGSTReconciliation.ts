import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * GST ITC Reconciliation — compares purchase register (bills) against GSTR-2A/2B
 * to identify matched, unmatched, and excess ITC claims.
 */
export interface ITCReconRow {
  id: string;
  vendor_name: string;
  vendor_gstin: string;
  bill_number: string;
  bill_date: string;
  taxable_value: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_itc: number;
  match_status: "matched" | "unmatched" | "excess_in_2a" | "amount_mismatch";
  difference: number;
}

export interface ITCReconSummary {
  total_purchase_itc: number;
  total_matched: number;
  total_unmatched: number;
  total_excess: number;
  total_mismatch: number;
  match_rate: number;
  rows: ITCReconRow[];
}

/**
 * Fetches bills for a period and simulates GSTR-2A matching.
 * In production, this would compare against actual GSTR-2A data uploaded/fetched from GST portal.
 * Currently, it identifies potential ITC claims from purchase register.
 */
export function useITCReconciliation(from: string, to: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["itc-reconciliation", from, to],
    queryFn: async (): Promise<ITCReconSummary> => {
      const { data: bills, error } = await supabase
        .from("bills")
        .select("id, bill_number, bill_date, vendor_name, vendor_id, amount, tax_amount, total_amount, tds_section, tds_rate, status")
        .gte("bill_date", from)
        .lte("bill_date", to)
        .in("status", ["approved", "paid", "partially_paid"])
        .order("bill_date", { ascending: true });

      if (error) throw error;

      // Fetch vendor GSTINs
      const vendorIds = [...new Set((bills || []).map(b => b.vendor_id).filter(Boolean))];
      let vendorMap: Record<string, string> = {};
      if (vendorIds.length > 0) {
        const { data: vendors } = await supabase
          .from("vendors")
          .select("id, tax_number")
          .in("id", vendorIds);
        vendorMap = Object.fromEntries((vendors || []).map(v => [v.id, v.tax_number || ""]));
      }

      const rows: ITCReconRow[] = [];
      let totalMatched = 0, totalUnmatched = 0, totalExcess = 0, totalMismatch = 0;

      for (const bill of bills || []) {
        const gstin = bill.vendor_id ? vendorMap[bill.vendor_id] || "" : "";
        const taxable = bill.amount || 0;
        const taxAmt = bill.tax_amount || 0;
        // Split tax evenly as CGST/SGST for simplification (intra-state assumed)
        const cgst = taxAmt / 2;
        const sgst = taxAmt / 2;
        const igst = 0;
        const totalItc = taxAmt;

        // Matching logic: GSTIN present and valid = matched, no GSTIN = unmatched
        const gstinValid = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/.test(gstin);
        const matchStatus: ITCReconRow["match_status"] = gstinValid ? "matched" : "unmatched";

        if (matchStatus === "matched") totalMatched += totalItc;
        else totalUnmatched += totalItc;

        rows.push({
          id: bill.id,
          vendor_name: bill.vendor_name,
          vendor_gstin: gstin || "Not Available",
          bill_number: bill.bill_number,
          bill_date: bill.bill_date,
          taxable_value: taxable,
          cgst,
          sgst,
          igst,
          total_itc: totalItc,
          match_status: matchStatus,
          difference: 0,
        });
      }

      const totalPurchaseItc = totalMatched + totalUnmatched + totalExcess + totalMismatch;

      return {
        total_purchase_itc: totalPurchaseItc,
        total_matched: totalMatched,
        total_unmatched: totalUnmatched,
        total_excess: totalExcess,
        total_mismatch: totalMismatch,
        match_rate: totalPurchaseItc > 0 ? (totalMatched / totalPurchaseItc) * 100 : 0,
        rows,
      };
    },
    enabled: !!user && !!from && !!to,
  });
}

/**
 * TDS Certificate data for Form 16 (salary) and Form 16A (non-salary)
 */
export interface Form16Data {
  employee_name: string;
  employee_pan: string;
  assessment_year: string;
  employer_tan: string;
  gross_salary: number;
  hra_exempt: number;
  standard_deduction: number;
  professional_tax: number;
  section_80c: number;
  section_80d: number;
  other_deductions: number;
  total_income: number;
  tax_payable: number;
  surcharge: number;
  cess: number;
  total_tax: number;
  tds_deducted: number;
  quarters: { quarter: string; tds: number }[];
}

export interface Form16AData {
  deductee_name: string;
  deductee_pan: string;
  section: string;
  total_paid: number;
  tds_rate: number;
  tds_deducted: number;
  certificate_number: string;
}

export function useForm16Data(fy: string) {
  const { user } = useAuth();
  const startYear = parseInt(fy.split("-")[0]);

  return useQuery({
    queryKey: ["form16", fy],
    queryFn: async (): Promise<Form16Data[]> => {
      const from = `${startYear}-04-01`;
      const to = `${startYear + 1}-03-31`;

      const { data: payrollEntries, error } = await supabase
        .from("payroll_entries")
        .select("*, profiles!payroll_entries_profile_id_fkey(full_name, pan_number)")
        .gte("created_at", from)
        .lte("created_at", to + "T23:59:59")
        .eq("is_superseded", false);

      if (error) throw error;

      // Group by profile
      const byProfile: Record<string, any[]> = {};
      for (const entry of payrollEntries || []) {
        const pid = (entry as any).profile_id;
        if (!byProfile[pid]) byProfile[pid] = [];
        byProfile[pid].push(entry);
      }

      const results: Form16Data[] = [];

      for (const [, entries] of Object.entries(byProfile)) {
        const profile = (entries[0] as any).profiles;
        const grossSalary = entries.reduce((s, e) => s + ((e as any).gross_salary || 0), 0);
        const hra = entries.reduce((s, e) => s + ((e as any).hra || 0), 0);
        const tds = entries.reduce((s, e) => s + ((e as any).tds || 0), 0);
        const pt = entries.reduce((s, e) => s + ((e as any).professional_tax || 0), 0);

        const standardDeduction = Math.min(grossSalary, 50000);
        const totalIncome = Math.max(0, grossSalary - standardDeduction - pt);
        const cess = tds * 0.04;

        results.push({
          employee_name: profile?.full_name || "Unknown",
          employee_pan: profile?.pan_number || "",
          assessment_year: `${startYear + 1}-${startYear + 2}`,
          employer_tan: "",
          gross_salary: grossSalary,
          hra_exempt: hra * 0.4, // simplified HRA exemption
          standard_deduction: standardDeduction,
          professional_tax: pt,
          section_80c: 0,
          section_80d: 0,
          other_deductions: 0,
          total_income: totalIncome,
          tax_payable: tds,
          surcharge: 0,
          cess,
          total_tax: tds + cess,
          tds_deducted: tds,
          quarters: [
            { quarter: "Q1", tds: entries.filter((e: any) => { const m = new Date(e.created_at).getMonth() + 1; return m >= 4 && m <= 6; }).reduce((s: number, e: any) => s + (e.tds || 0), 0) },
            { quarter: "Q2", tds: entries.filter((e: any) => { const m = new Date(e.created_at).getMonth() + 1; return m >= 7 && m <= 9; }).reduce((s: number, e: any) => s + (e.tds || 0), 0) },
            { quarter: "Q3", tds: entries.filter((e: any) => { const m = new Date(e.created_at).getMonth() + 1; return m >= 10 && m <= 12; }).reduce((s: number, e: any) => s + (e.tds || 0), 0) },
            { quarter: "Q4", tds: entries.filter((e: any) => { const m = new Date(e.created_at).getMonth() + 1; return m >= 1 && m <= 3; }).reduce((s: number, e: any) => s + (e.tds || 0), 0) },
          ],
        });
      }

      return results;
    },
    enabled: !!user,
  });
}

export function useForm16AData(fy: string) {
  const { user } = useAuth();
  const startYear = parseInt(fy.split("-")[0]);

  return useQuery({
    queryKey: ["form16a", fy],
    queryFn: async (): Promise<Form16AData[]> => {
      const from = `${startYear}-04-01`;
      const to = `${startYear + 1}-03-31`;

      const { data: bills, error } = await supabase
        .from("bills")
        .select("id, bill_number, vendor_name, amount, tds_section, tds_rate, vendor_id")
        .gte("bill_date", from)
        .lte("bill_date", to)
        .not("tds_section", "is", null)
        .order("bill_date");

      if (error) throw error;

      // Fetch vendor PANs
      const vendorIds = [...new Set((bills || []).map(b => b.vendor_id).filter(Boolean))];
      let vendorPans: Record<string, string> = {};
      if (vendorIds.length > 0) {
        const { data: vendors } = await supabase
          .from("vendors")
          .select("id, pan_number")
          .in("id", vendorIds);
        vendorPans = Object.fromEntries((vendors || []).map(v => [v.id, (v as any).pan_number || ""]));
      }

      // Group by vendor + section
      const grouped: Record<string, Form16AData> = {};
      for (const bill of bills || []) {
        const key = `${bill.vendor_id}-${bill.tds_section}`;
        if (!grouped[key]) {
          grouped[key] = {
            deductee_name: bill.vendor_name,
            deductee_pan: bill.vendor_id ? vendorPans[bill.vendor_id] || "" : "",
            section: bill.tds_section || "",
            total_paid: 0,
            tds_rate: bill.tds_rate || 0,
            tds_deducted: 0,
            certificate_number: `16A-${fy}-${Object.keys(grouped).length + 1}`,
          };
        }
        grouped[key].total_paid += bill.amount || 0;
        grouped[key].tds_deducted += (bill.amount || 0) * ((bill.tds_rate || 0) / 100);
      }

      return Object.values(grouped);
    },
    enabled: !!user,
  });
}
