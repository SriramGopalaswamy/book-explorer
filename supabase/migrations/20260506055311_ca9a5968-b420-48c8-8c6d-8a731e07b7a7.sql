CREATE OR REPLACE FUNCTION public.get_payroll_unique_record_count(p_org_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COUNT(*) FROM (
    SELECT e.profile_id, r.pay_period
    FROM public.payroll_entries e
    JOIN public.payroll_runs r ON r.id = e.payroll_run_id
    WHERE e.organization_id = p_org_id
    UNION
    SELECT profile_id, pay_period
    FROM public.payroll_records
    WHERE organization_id = p_org_id AND is_superseded = false
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.get_payroll_unique_record_count(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
