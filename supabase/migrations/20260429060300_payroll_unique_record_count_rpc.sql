-- RPC: get_payroll_unique_record_count(org_id)
--
-- Returns the number of distinct (profile_id, pay_period) payroll records
-- for an organisation, de-duplicated across the engine (payroll_entries) and
-- legacy (payroll_records) tables.  Engine entries win when both sources have
-- the same pair — the UNION de-duplicates automatically.
--
-- Called by usePayrollOrgRecordCount to avoid fetching every row to JS just
-- to count them (previous approach had an O(n) network transfer for a scalar).

-- SECURITY INVOKER (default): the function executes with the caller's
-- privileges, so the existing RLS policies on payroll_entries and
-- payroll_records enforce org-scoped visibility automatically.
-- A SECURITY DEFINER function accepting a caller-supplied p_org_id would
-- bypass RLS and expose counts from any org to any authenticated user.
CREATE OR REPLACE FUNCTION public.get_payroll_unique_record_count(p_org_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COUNT(*) FROM (
    -- Engine entries: resolve pay_period via the run join
    SELECT e.profile_id, r.pay_period
    FROM   public.payroll_entries e
    JOIN   public.payroll_runs    r ON r.id = e.payroll_run_id
    WHERE  e.organization_id = p_org_id

    UNION

    -- Legacy records not yet migrated
    SELECT profile_id, pay_period
    FROM   public.payroll_records
    WHERE  organization_id = p_org_id
      AND  is_superseded   = false
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_payroll_unique_record_count(uuid) TO authenticated;
