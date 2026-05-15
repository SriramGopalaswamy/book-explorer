-- 1. Fix SECURITY DEFINER view (only ERROR-level lint)
ALTER VIEW public.financial_records_full_v SET (security_invoker = on);

-- 2. Lock search_path for 8 user-defined functions still missing it
ALTER FUNCTION public.refresh_payroll_run_totals() SET search_path = public;
ALTER FUNCTION public.validate_signing_status() SET search_path = public;
ALTER FUNCTION public.block_posted_journal_entry_mutation() SET search_path = public;
ALTER FUNCTION public.check_payroll_entry_org_matches_run() SET search_path = public;
ALTER FUNCTION public.auto_set_org_crr() SET search_path = public;
ALTER FUNCTION public.validate_eway_bill() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.validate_expense_not_in_closed_period() SET search_path = public;