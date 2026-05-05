
-- Drop existing functions first
DROP FUNCTION IF EXISTS public.provision_all_employees_balances(uuid, integer);
DROP FUNCTION IF EXISTS public.provision_leave_balances(uuid, uuid, integer);

-- Recreate with gender awareness
CREATE FUNCTION public.provision_leave_balances(_user_id uuid, _org_id uuid, _year integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted integer := 0;
  _lt record;
  _profile_id uuid;
  _emp_gender text;
BEGIN
  SELECT p.id, COALESCE(lower(ed.gender), 'unknown')
    INTO _profile_id, _emp_gender
  FROM profiles p
  LEFT JOIN employee_details ed ON ed.profile_id = p.id
  WHERE p.user_id = _user_id AND p.organization_id = _org_id
  LIMIT 1;

  FOR _lt IN
    SELECT key, default_days, gender_eligibility FROM leave_types
    WHERE organization_id = _org_id AND is_active = true
    ORDER BY sort_order
  LOOP
    IF _lt.gender_eligibility = 'female' AND _emp_gender NOT IN ('female', 'f') THEN
      CONTINUE;
    END IF;
    IF _lt.gender_eligibility = 'male' AND _emp_gender NOT IN ('male', 'm') THEN
      CONTINUE;
    END IF;

    INSERT INTO leave_balances (user_id, profile_id, leave_type, total_days, used_days, year, organization_id)
    VALUES (_user_id, _profile_id, _lt.key, _lt.default_days, 0, _year, _org_id)
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      _inserted := _inserted + 1;
    END IF;
  END LOOP;

  RETURN _inserted;
END;
$$;

CREATE FUNCTION public.provision_all_employees_balances(_org_id uuid, _year integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total integer := 0;
  _emp record;
  _count integer;
BEGIN
  FOR _emp IN
    SELECT user_id FROM profiles
    WHERE organization_id = _org_id AND status IN ('active', 'on_leave')
    ORDER BY user_id
  LOOP
    SELECT provision_leave_balances(_emp.user_id, _org_id, _year) INTO _count;
    _total := _total + _count;
  END LOOP;
  RETURN _total;
END;
$$;

-- Validation trigger on leave_requests
CREATE OR REPLACE FUNCTION public.validate_leave_gender_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _gender_elig text;
  _emp_gender text;
BEGIN
  SELECT lt.gender_eligibility INTO _gender_elig
  FROM leave_types lt
  WHERE lt.key = NEW.leave_type AND lt.organization_id = NEW.organization_id
  LIMIT 1;

  IF _gender_elig IS NULL OR _gender_elig = 'all' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(lower(ed.gender), 'unknown') INTO _emp_gender
  FROM profiles p
  LEFT JOIN employee_details ed ON ed.profile_id = p.id
  WHERE p.user_id = NEW.user_id AND p.organization_id = NEW.organization_id
  LIMIT 1;

  IF _gender_elig = 'female' AND _emp_gender NOT IN ('female', 'f') THEN
    RAISE EXCEPTION 'This leave type is only available for female employees';
  END IF;
  IF _gender_elig = 'male' AND _emp_gender NOT IN ('male', 'm') THEN
    RAISE EXCEPTION 'This leave type is only available for male employees';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_leave_gender ON public.leave_requests;
CREATE TRIGGER trg_validate_leave_gender
  BEFORE INSERT ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_leave_gender_eligibility();

-- Clean up existing menstruation balances for non-female employees
DELETE FROM public.leave_balances
WHERE leave_type = 'menstruation'
  AND user_id IN (
    SELECT p.user_id FROM profiles p
    JOIN employee_details ed ON ed.profile_id = p.id
    WHERE lower(ed.gender) NOT IN ('female', 'f')
  );
