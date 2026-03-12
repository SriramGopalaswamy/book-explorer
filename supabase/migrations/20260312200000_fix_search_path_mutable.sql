-- Fix mutable search_path for SECURITY DEFINER functions.
-- Functions declared with SECURITY DEFINER must pin the search_path to prevent
-- privilege-escalation attacks via schema injection.

ALTER FUNCTION public.audit_payroll_lock()
  SET search_path = public;

ALTER FUNCTION public.post_journal_entry(uuid, text, uuid, date, text, jsonb)
  SET search_path = public;

ALTER FUNCTION public.auto_set_consent_org()
  SET search_path = public;

ALTER FUNCTION public.auto_set_erasure_org()
  SET search_path = public;

ALTER FUNCTION public.auto_set_breach_org()
  SET search_path = public;
