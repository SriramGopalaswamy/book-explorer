
-- Drop hardcoded leave_type CHECK constraints
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;
ALTER TABLE public.leave_balances DROP CONSTRAINT IF EXISTS leave_balances_leave_type_check;

-- Create a validation trigger that checks against leave_types table
CREATE OR REPLACE FUNCTION public.validate_leave_type_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.leave_types
    WHERE key = NEW.leave_type AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid leave type: %. It must be an active leave type.', NEW.leave_type;
  END IF;
  RETURN NEW;
END;
$func$;

-- Apply to leave_requests
DROP TRIGGER IF EXISTS trg_validate_leave_type_request ON public.leave_requests;
CREATE TRIGGER trg_validate_leave_type_request
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_leave_type_exists();

-- Apply to leave_balances
DROP TRIGGER IF EXISTS trg_validate_leave_type_balance ON public.leave_balances;
CREATE TRIGGER trg_validate_leave_type_balance
  BEFORE INSERT OR UPDATE ON public.leave_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_leave_type_exists();
