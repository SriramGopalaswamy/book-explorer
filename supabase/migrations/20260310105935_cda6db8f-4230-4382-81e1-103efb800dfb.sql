
-- Fix search_path on new functions for security
ALTER FUNCTION public.enforce_terminal_state() SET search_path = public;
ALTER FUNCTION public.validate_positive_amount() SET search_path = public;
ALTER FUNCTION public.validate_payroll_record() SET search_path = public;
ALTER FUNCTION public.validate_leave_request() SET search_path = public;
