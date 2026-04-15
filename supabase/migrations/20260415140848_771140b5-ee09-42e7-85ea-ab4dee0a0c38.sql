-- Function: Provision leave balances for a single user
CREATE OR REPLACE FUNCTION public.provision_leave_balances(
  _user_id uuid,
  _org_id uuid,
  _year integer DEFAULT EXTRACT(year FROM CURRENT_DATE)::integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted integer := 0;
  _lt record;
  _profile_id uuid;
BEGIN
  -- Get the user's profile_id
  SELECT id INTO _profile_id FROM profiles WHERE user_id = _user_id AND organization_id = _org_id LIMIT 1;

  -- Loop through active leave types for this org
  FOR _lt IN
    SELECT key, default_days FROM leave_types
    WHERE organization_id = _org_id AND is_active = true
    ORDER BY sort_order
  LOOP
    -- Insert only if no balance exists for this user/type/year
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

-- Function: Propagate default_days change to all employee balances
CREATE OR REPLACE FUNCTION public.propagate_leave_type_defaults(
  _leave_type_key text,
  _org_id uuid,
  _new_default_days integer,
  _year integer DEFAULT EXTRACT(year FROM CURRENT_DATE)::integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated integer;
BEGIN
  UPDATE leave_balances
  SET total_days = _new_default_days,
      updated_at = now()
  WHERE organization_id = _org_id
    AND leave_type = _leave_type_key
    AND year = _year;
  
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated;
END;
$$;

-- Function: Bulk provision for all active employees in an org
CREATE OR REPLACE FUNCTION public.provision_all_employees_balances(
  _org_id uuid,
  _year integer DEFAULT EXTRACT(year FROM CURRENT_DATE)::integer
)
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
    WHERE organization_id = _org_id
      AND status IN ('active', 'on_leave')
    ORDER BY user_id
  LOOP
    SELECT provision_leave_balances(_emp.user_id, _org_id, _year) INTO _count;
    _total := _total + _count;
  END LOOP;

  RETURN _total;
END;
$$;

-- Add a unique constraint on leave_balances to support ON CONFLICT
ALTER TABLE leave_balances
  DROP CONSTRAINT IF EXISTS leave_balances_user_type_year_org_unique;
ALTER TABLE leave_balances
  ADD CONSTRAINT leave_balances_user_type_year_org_unique
  UNIQUE (user_id, leave_type, year, organization_id);