import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Generate payslips for a locked payroll run via edge function.
 */
export function useGeneratePayslips() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payrollRunId: string) => {
      const { data, error } = await supabase.functions.invoke("generate-payslip", {
        body: { payroll_run_id: payrollRunId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      toast.success(`${data.generated} payslip(s) generated`);
    },
    onError: (err: any) => toast.error("Payslip generation failed: " + err.message),
  });
}

/**
 * Hook to generate Form 16 records for a financial year.
 */
export function useGenerateForm16() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, financialYear }: { organizationId: string; financialYear: string }) => {
      // Fetch all locked payroll entries for this FY
      const fyStart = `${financialYear.split("-")[0]}-04`;
      const fyEnd = `${parseInt(financialYear.split("-")[0]) + 1}-03`;

      const { data: runs } = await supabase
        .from("payroll_runs")
        .select("id, pay_period")
        .eq("organization_id", organizationId)
        .eq("status", "locked")
        .gte("pay_period", fyStart)
        .lte("pay_period", fyEnd);

      if (!runs || runs.length === 0) throw new Error("No locked payroll runs found for this FY");

      const runIds = runs.map((r) => r.id);
      const { data: entries } = await supabase
        .from("payroll_entries")
        .select("profile_id, gross_earnings, net_pay, tds_amount, pf_employee, annual_ctc")
        .in("payroll_run_id", runIds);

      if (!entries || entries.length === 0) throw new Error("No entries found");

      // Aggregate by employee
      const empMap = new Map<string, { salary: number; tds: number }>();
      entries.forEach((e: any) => {
        const existing = empMap.get(e.profile_id) || { salary: 0, tds: 0 };
        existing.salary += Number(e.gross_earnings);
        existing.tds += Number(e.tds_amount || 0);
        empMap.set(e.profile_id, existing);
      });

      // Upsert form16_records
      const records = Array.from(empMap.entries()).map(([profileId, agg]) => ({
        profile_id: profileId,
        organization_id: organizationId,
        financial_year: financialYear,
        total_salary: agg.salary,
        total_tds: agg.tds,
        generated_at: new Date().toISOString(),
      }));

      // Use upsert
      for (const rec of records) {
        const { error } = await supabase
          .from("form16_records")
          .upsert(rec, { onConflict: "profile_id,organization_id,financial_year" });
        if (error) throw error;
      }

      return { generated: records.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["form16-records"] });
      toast.success(`Form 16 generated for ${data.generated} employees`);
    },
    onError: (err: any) => toast.error(err.message),
  });
}
