import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";

export interface OpenFiscalPeriod {
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
}

/**
 * GBC-107: Fetch all open fiscal periods for the current user's org.
 * Used to gate transactional date pickers (Invoice, Vendor Bill,
 * Reimbursement) so users cannot post into closed periods.
 */
export function useOpenFiscalPeriods() {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["open-fiscal-periods", orgId],
    queryFn: async (): Promise<OpenFiscalPeriod[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("fiscal_periods")
        .select("start_date, end_date")
        .eq("organization_id", orgId)
        .eq("status", "open")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OpenFiscalPeriod[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
}

/**
 * Returns true if the given ISO date string (YYYY-MM-DD) falls within
 * any of the supplied open fiscal periods. Returns true (permissive)
 * when no periods are configured to avoid blocking orgs that have not
 * set up the fiscal calendar yet.
 */
export function isDateInOpenPeriod(
  isoDate: string | null | undefined,
  periods: OpenFiscalPeriod[] | undefined,
): boolean {
  if (!isoDate) return false;
  if (!periods || periods.length === 0) return true;
  return periods.some((p) => isoDate >= p.start_date && isoDate <= p.end_date);
}

/**
 * Convenience: derive min/max bounds for an HTML <input type="date" />
 * from the open-period set. min = earliest start, max = latest end.
 * Returns undefined for either bound when the set is empty.
 */
export function openPeriodBounds(periods: OpenFiscalPeriod[] | undefined) {
  if (!periods || periods.length === 0) return { min: undefined, max: undefined };
  const min = periods.reduce((a, p) => (p.start_date < a ? p.start_date : a), periods[0].start_date);
  const max = periods.reduce((a, p) => (p.end_date > a ? p.end_date : a), periods[0].end_date);
  return { min, max };
}
