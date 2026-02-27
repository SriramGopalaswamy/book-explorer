
-- Fix trigger_post_expense: fire on 'paid' instead of 'approved'
-- This allows managers to approve expenses without needing finance/admin role
-- Journal entry posts only when finance marks expense as 'paid'
CREATE OR REPLACE FUNCTION public.trigger_post_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid' AND (OLD IS NULL OR OLD.status != 'paid') THEN
    PERFORM post_expense_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
