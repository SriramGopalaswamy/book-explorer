import { supabase } from "@/integrations/supabase/client";

/**
 * Checks if a given date falls within an active (non-closed) fiscal period.
 * Returns true if the date is allowed, throws an error if the period is closed.
 */
export async function validateFiscalPeriod(recordDate: string): Promise<boolean> {
  const { data: years } = await supabase
    .from("financial_years")
    .select("id, start_date, end_date, is_active")
    .lte("start_date", recordDate)
    .gte("end_date", recordDate)
    .limit(1);

  if (!years || years.length === 0) {
    // No fiscal year covers this date — allow but warn
    console.warn(`No fiscal year found covering date ${recordDate}`);
    return true;
  }

  const fy = years[0];
  if (!fy.is_active) {
    throw new Error(
      `Cannot post entries to a closed fiscal period (${fy.start_date} to ${fy.end_date}). Reopen the period first.`
    );
  }

  return true;
}
