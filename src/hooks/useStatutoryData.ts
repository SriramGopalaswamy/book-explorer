import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ── GSTR-1: Outward supplies (B2B + B2C) from invoices ──
export interface GSTR1Row {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_gstin: string;
  place_of_supply: string;
  hsn_sac: string;
  description: string;
  quantity: number;
  rate: number;
  taxable_value: number;
  cgst_rate: number;
  cgst_amount: number;
  sgst_rate: number;
  sgst_amount: number;
  igst_rate: number;
  igst_amount: number;
  total_amount: number;
  invoice_type: "B2B" | "B2C";
}

// ── GSTR-3B: Summary return ──
export interface GSTR3BSummary {
  outward_taxable: number;
  outward_exempt: number;
  outward_nil_rated: number;
  inward_taxable: number; // from bills
  cgst_payable: number;
  sgst_payable: number;
  igst_payable: number;
  total_tax_payable: number;
  itc_cgst: number;
  itc_sgst: number;
  itc_igst: number;
  total_itc: number;
  net_cgst: number;
  net_sgst: number;
  net_igst: number;
  net_payable: number;
}

// ── TDS 26Q row (non-salary) ──
export interface TDS26QRow {
  id: string;
  deductee_name: string;
  deductee_pan: string;
  section_code: string;
  payment_date: string;
  amount_paid: number;
  tds_rate: number;
  tds_amount: number;
  description: string;
  reference_type: string;
}

// ── TDS 24Q row (salary) ──
export interface TDS24QRow {
  id: string;
  employee_name: string;
  employee_pan: string;
  pay_period: string;
  gross_salary: number;
  hra_exempt: number;
  standard_deduction: number;
  taxable_income: number;
  tds_deducted: number;
  surcharge: number;
  cess: number;
  total_tds: number;
}

// ── PF ECR row ──
export interface PFECRRow {
  id: string;
  uan: string;
  employee_name: string;
  gross_wages: number;
  epf_wages: number;
  eps_wages: number;
  edli_wages: number;
  epf_employee: number; // 12% of EPF wages
  eps_employer: number; // 8.33% of EPS wages (capped at ₹15,000)
  epf_employer: number; // 3.67% of EPF wages
  edli_contribution: number;
  ncp_days: number;
  refund_of_advances: number;
}

// ── ESI row ──
export interface ESIRow {
  id: string;
  ip_number: string;
  employee_name: string;
  days_worked: number;
  gross_wages: number;
  employee_contribution: number; // 0.75%
  employer_contribution: number; // 3.25%
  total_contribution: number;
}

// ── Professional Tax row ──
export interface ProfTaxRow {
  id: string;
  employee_name: string;
  gross_salary: number;
  pt_amount: number;
  state: string;
  month: string;
}

function getFinancialQuarter(month: number): { q: number; label: string; months: number[] } {
  if (month >= 4 && month <= 6) return { q: 1, label: "Q1 (Apr-Jun)", months: [4, 5, 6] };
  if (month >= 7 && month <= 9) return { q: 2, label: "Q2 (Jul-Sep)", months: [7, 8, 9] };
  if (month >= 10 && month <= 12) return { q: 3, label: "Q3 (Oct-Dec)", months: [10, 11, 12] };
  return { q: 4, label: "Q4 (Jan-Mar)", months: [1, 2, 3] };
}

export function getFinancialYearRange(fy: string): { from: string; to: string } {
  const startYear = parseInt(fy.split("-")[0]);
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

export function getQuarterRange(fy: string, quarter: number): { from: string; to: string } {
  const startYear = parseInt(fy.split("-")[0]);
  const qMap: Record<number, { from: string; to: string }> = {
    1: { from: `${startYear}-04-01`, to: `${startYear}-06-30` },
    2: { from: `${startYear}-07-01`, to: `${startYear}-09-30` },
    3: { from: `${startYear}-10-01`, to: `${startYear}-12-31` },
    4: { from: `${startYear + 1}-01-01`, to: `${startYear + 1}-03-31` },
  };
  return qMap[quarter] || qMap[1];
}

export function getMonthRange(fy: string, monthIdx: number): { from: string; to: string } {
  const startYear = parseInt(fy.split("-")[0]);
  const year = monthIdx >= 4 ? startYear : startYear + 1;
  const month = String(monthIdx).padStart(2, "0");
  const lastDay = new Date(year, monthIdx, 0).getDate();
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${lastDay}` };
}

// ── GSTR-1 data from invoices + invoice_items ──
export function useGSTR1Data(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["gstr1", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_items(*)")
        .gte("created_at", from)
        .lte("created_at", to + "T23:59:59")
        .in("status", ["sent", "paid"])
        .order("created_at", { ascending: true });
      if (error) throw error;

      const rows: GSTR1Row[] = [];
      for (const inv of data || []) {
        const items = (inv as any).invoice_items || [];
        for (const item of items) {
          rows.push({
            id: `${inv.id}-${item.id || rows.length}`,
            invoice_number: inv.invoice_number,
            invoice_date: inv.created_at?.split("T")[0] || "",
            customer_name: inv.client_name,
            customer_gstin: inv.customer_gstin || "",
            place_of_supply: inv.place_of_supply || "",
            hsn_sac: item.hsn_sac || "",
            description: item.description,
            quantity: item.quantity,
            rate: item.rate,
            taxable_value: item.amount,
            cgst_rate: item.cgst_rate || 0,
            cgst_amount: item.cgst_amount || 0,
            sgst_rate: item.sgst_rate || 0,
            sgst_amount: item.sgst_amount || 0,
            igst_rate: item.igst_rate || 0,
            igst_amount: item.igst_amount || 0,
            total_amount: item.amount + (item.cgst_amount || 0) + (item.sgst_amount || 0) + (item.igst_amount || 0),
            invoice_type: inv.customer_gstin ? "B2B" : "B2C",
          });
        }
      }
      return rows;
    },
    enabled: !!user && !!from && !!to,
  });
}

// ── GSTR-3B summary from invoices + bills/expenses ──
export function useGSTR3BData(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["gstr3b", from, to],
    queryFn: async () => {
      // Outward supplies from invoices
      const { data: invoices } = await supabase
        .from("invoices")
        .select("subtotal, cgst_total, sgst_total, igst_total, total_amount")
        .gte("created_at", from)
        .lte("created_at", to + "T23:59:59")
        .in("status", ["sent", "paid"]);

      // Inward supplies from bills (for ITC)
      const { data: bills } = await supabase
        .from("bills")
        .select("amount, tax_amount, total_amount")
        .gte("created_at", from)
        .lte("created_at", to + "T23:59:59")
        .in("status", ["approved", "paid"]);

      const outwardTaxable = (invoices || []).reduce((s, i) => s + Number(i.subtotal || 0), 0);
      const cgstPayable = (invoices || []).reduce((s, i) => s + Number(i.cgst_total || 0), 0);
      const sgstPayable = (invoices || []).reduce((s, i) => s + Number(i.sgst_total || 0), 0);
      const igstPayable = (invoices || []).reduce((s, i) => s + Number(i.igst_total || 0), 0);
      const totalTax = cgstPayable + sgstPayable + igstPayable;

      const inwardTaxable = (bills || []).reduce((s, b) => s + Number(b.amount || 0), 0);
      const itcTotal = (bills || []).reduce((s, b) => s + Number(b.tax_amount || 0), 0);
      // Assume 50-50 CGST/SGST split for ITC (simplified)
      const itcCgst = itcTotal / 2;
      const itcSgst = itcTotal / 2;

      const summary: GSTR3BSummary = {
        outward_taxable: outwardTaxable,
        outward_exempt: 0,
        outward_nil_rated: 0,
        inward_taxable: inwardTaxable,
        cgst_payable: cgstPayable,
        sgst_payable: sgstPayable,
        igst_payable: igstPayable,
        total_tax_payable: totalTax,
        itc_cgst: itcCgst,
        itc_sgst: itcSgst,
        itc_igst: 0,
        total_itc: itcTotal,
        net_cgst: Math.max(cgstPayable - itcCgst, 0),
        net_sgst: Math.max(sgstPayable - itcSgst, 0),
        net_igst: igstPayable,
        net_payable: Math.max(totalTax - itcTotal, 0),
      };
      return summary;
    },
    enabled: !!user && !!from && !!to,
  });
}

// ── TDS 24Q: Salary TDS from payroll records ──
export function useTDS24QData(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tds24q", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_records")
        .select("*, profiles!profile_id(full_name)")
        .gte("created_at", from)
        .lte("created_at", to + "T23:59:59")
        .eq("status", "processed");
      if (error) throw error;

      return (data || []).map((p: any): TDS24QRow => {
        const gross = Number(p.basic_salary) + Number(p.hra) + Number(p.transport_allowance) + Number(p.other_allowances);
        return {
          id: p.id,
          employee_name: p.profiles?.full_name || "Unknown",
          employee_pan: "", // PAN not stored; placeholder
          pay_period: p.pay_period,
          gross_salary: gross,
          hra_exempt: Number(p.hra) * 0.4, // Simplified 40% HRA exemption
          standard_deduction: 75000 / 12, // ₹75,000 annual / 12
          taxable_income: gross - (Number(p.hra) * 0.4) - (75000 / 12),
          tds_deducted: Number(p.tax_deduction),
          surcharge: 0,
          cess: Number(p.tax_deduction) * 0.04,
          total_tds: Number(p.tax_deduction) + Number(p.tax_deduction) * 0.04,
        };
      });
    },
    enabled: !!user && !!from && !!to,
  });
}

// ── TDS 26Q: Non-salary TDS from expenses/bills ──
export function useTDS26QData(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tds26q", from, to],
    queryFn: async () => {
      // Use bills as proxy for vendor payments with TDS
      const { data, error } = await supabase
        .from("bills")
        .select("*, vendors!vendor_id(name)")
        .gte("created_at", from)
        .lte("created_at", to + "T23:59:59")
        .in("status", ["approved", "paid"]);
      if (error) throw error;

      return (data || []).map((b: any): TDS26QRow => {
        const tdsRate = 10; // Default TDS rate for professional services (194J)
        return {
          id: b.id,
          deductee_name: b.vendors?.name || b.vendor_name || "Unknown",
          deductee_pan: "", // Not stored
          section_code: "194J",
          payment_date: b.bill_date,
          amount_paid: Number(b.total_amount),
          tds_rate: tdsRate,
          tds_amount: Number(b.total_amount) * (tdsRate / 100),
          description: `Bill ${b.bill_number}`,
          reference_type: "bill",
        };
      });
    },
    enabled: !!user && !!from && !!to,
  });
}

// ── PF ECR: From payroll data ──
export function usePFECRData(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pf_ecr", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_records")
        .select("*, profiles!profile_id(full_name)")
        .gte("created_at", from)
        .lte("created_at", to + "T23:59:59")
        .eq("status", "processed");
      if (error) throw error;

      return (data || []).map((p: any): PFECRRow => {
        const gross = Number(p.basic_salary) + Number(p.hra) + Number(p.transport_allowance) + Number(p.other_allowances);
        const epfWages = Math.min(Number(p.basic_salary), 15000); // PF wage ceiling
        const epsWages = Math.min(epfWages, 15000);
        return {
          id: p.id,
          uan: "", // Not stored
          employee_name: p.profiles?.full_name || "Unknown",
          gross_wages: gross,
          epf_wages: epfWages,
          eps_wages: epsWages,
          edli_wages: epsWages,
          epf_employee: Number(p.pf_deduction),
          eps_employer: Math.round(epsWages * 0.0833),
          epf_employer: Math.round(epfWages * 0.0367),
          edli_contribution: Math.round(epsWages * 0.005),
          ncp_days: 0,
          refund_of_advances: 0,
        };
      });
    },
    enabled: !!user && !!from && !!to,
  });
}

// ── ESI: From payroll (only for employees earning ≤ ₹21,000/month) ──
export function useESIData(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["esi", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_records")
        .select("*, profiles!profile_id(full_name)")
        .gte("created_at", from)
        .lte("created_at", to + "T23:59:59")
        .eq("status", "processed");
      if (error) throw error;

      return (data || [])
        .map((p: any) => {
          const gross = Number(p.basic_salary) + Number(p.hra) + Number(p.transport_allowance) + Number(p.other_allowances);
          if (gross > 21000) return null; // ESI ceiling
          const empContrib = Math.round(gross * 0.0075);
          const erContrib = Math.round(gross * 0.0325);
          return {
            id: p.id,
            ip_number: "",
            employee_name: p.profiles?.full_name || "Unknown",
            days_worked: 30,
            gross_wages: gross,
            employee_contribution: empContrib,
            employer_contribution: erContrib,
            total_contribution: empContrib + erContrib,
          } as ESIRow;
        })
        .filter(Boolean) as ESIRow[];
    },
    enabled: !!user && !!from && !!to,
  });
}

// ── Professional Tax: From payroll ──
export function useProfTaxData(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["prof_tax", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_records")
        .select("*, profiles!profile_id(full_name)")
        .gte("created_at", from)
        .lte("created_at", to + "T23:59:59")
        .eq("status", "processed");
      if (error) throw error;

      return (data || []).map((p: any): ProfTaxRow => {
        const gross = Number(p.basic_salary) + Number(p.hra) + Number(p.transport_allowance) + Number(p.other_allowances);
        // Karnataka PT slab (common example)
        let pt = 0;
        if (gross > 15000) pt = 200;
        else if (gross > 10000) pt = 150;
        else if (gross > 5000) pt = 0; // Varies by state
        return {
          id: p.id,
          employee_name: p.profiles?.full_name || "Unknown",
          gross_salary: gross,
          pt_amount: pt,
          state: "Karnataka", // Default
          month: p.pay_period,
        };
      });
    },
    enabled: !!user && !!from && !!to,
  });
}
