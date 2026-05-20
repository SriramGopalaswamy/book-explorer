import { supabase } from "@/integrations/supabase/client";

export interface DuplicateBillMatch {
  id: string;
  bill_number: string;
  bill_date: string;
  vendor_name: string;
  total_amount: number;
}

/**
 * GBC-135: Soft duplicate check for bill submission.
 *
 * Queries the `bills` table for an existing bill with the same vendor_name
 * and total_amount (±0.01) whose bill_date falls within ±3 days of the
 * supplied date. Returns the first match, or null if none found.
 */
export async function checkDuplicateBill(
  orgId: string,
  vendorName: string,
  totalAmount: number,
  billDate: string,
  excludeBillId?: string | null,
): Promise<DuplicateBillMatch | null> {
  const date = new Date(billDate);
  const minus3 = new Date(date);
  minus3.setDate(date.getDate() - 3);
  const plus3 = new Date(date);
  plus3.setDate(date.getDate() + 3);

  const from = minus3.toISOString().split("T")[0];
  const to = plus3.toISOString().split("T")[0];

  let query = supabase
    .from("bills")
    .select("id, bill_number, bill_date, vendor_name, total_amount")
    .eq("organization_id", orgId)
    .eq("vendor_name", vendorName.trim())
    .gte("total_amount", totalAmount - 0.01)
    .lte("total_amount", totalAmount + 0.01)
    .gte("bill_date", from)
    .lte("bill_date", to)
    .neq("status", "cancelled")
    .limit(1);

  if (excludeBillId) {
    query = query.neq("id", excludeBillId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data && data.length > 0) ? (data[0] as DuplicateBillMatch) : null;
}
