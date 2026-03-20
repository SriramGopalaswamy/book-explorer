import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a Supabase query builder scoped to the given organization.
 * Use this instead of raw supabase.from() to ensure every query is
 * automatically filtered by organization_id.
 */
export function orgScopedQuery(table: string, orgId: string) {
  return (supabase.from as any)(table).select().eq("organization_id", orgId);
}

/**
 * Assertion guard that throws if orgId is falsy.
 * Place at the top of any function that requires a valid org context.
 */
export function validateOrgId(
  orgId: string | undefined | null
): asserts orgId is string {
  if (!orgId) {
    throw new Error("Organization not found");
  }
}

/**
 * Inserts a row into the given table with organization_id automatically
 * merged into the payload. Prevents accidental inserts without org scope.
 */
export function orgScopedInsert(
  table: string,
  data: Record<string, any>,
  orgId: string
) {
  return supabase.from(table).insert({ ...data, organization_id: orgId });
}
