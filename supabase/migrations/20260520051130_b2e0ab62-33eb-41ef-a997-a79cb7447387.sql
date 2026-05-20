-- One-shot backfill: copy employee_id_number from employee_details into profiles
-- wherever the profile value is missing or different.
UPDATE public.profiles p
SET employee_id = ed.employee_id_number,
    updated_at = now()
FROM public.employee_details ed
WHERE ed.profile_id = p.id
  AND ed.employee_id_number IS NOT NULL
  AND ed.employee_id_number <> ''
  AND (p.employee_id IS DISTINCT FROM ed.employee_id_number);

-- Trigger function: keep profiles.employee_id in lockstep with
-- employee_details.employee_id_number whenever the latter changes.
CREATE OR REPLACE FUNCTION public.sync_profile_employee_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_id_number IS NOT NULL
     AND NEW.employee_id_number <> ''
     AND NEW.profile_id IS NOT NULL THEN
    UPDATE public.profiles
       SET employee_id = NEW.employee_id_number,
           updated_at  = now()
     WHERE id = NEW.profile_id
       AND (employee_id IS DISTINCT FROM NEW.employee_id_number);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_employee_id ON public.employee_details;
CREATE TRIGGER trg_sync_profile_employee_id
AFTER INSERT OR UPDATE OF employee_id_number, profile_id
ON public.employee_details
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_employee_id();