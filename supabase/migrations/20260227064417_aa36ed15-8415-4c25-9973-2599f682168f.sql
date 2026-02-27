
-- Auto-apply profile change requests when approved
-- This trigger fires AFTER UPDATE on profile_change_requests
-- When status changes to 'approved', it applies the field change to the appropriate table

CREATE OR REPLACE FUNCTION public.apply_approved_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _field text;
  _value text;
  _profile_fields text[] := ARRAY['full_name', 'department', 'job_title', 'phone', 'email'];
  _detail_fields text[] := ARRAY[
    'date_of_birth', 'gender', 'blood_group', 'marital_status', 'nationality',
    'address_line1', 'address_line2', 'city', 'state', 'pincode', 'country',
    'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone',
    'bank_name', 'bank_account_number', 'bank_ifsc', 'bank_branch',
    'pan_number', 'aadhaar_last_four', 'uan_number', 'esi_number', 'employee_id_number'
  ];
BEGIN
  -- Only fire when status changes TO 'approved'
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    _field := NEW.field_name;
    _value := NEW.requested_value;

    -- Apply to profiles table
    IF _field = ANY(_profile_fields) THEN
      EXECUTE format(
        'UPDATE public.profiles SET %I = $1, updated_at = now() WHERE id = $2',
        _field
      ) USING _value, NEW.profile_id;

    -- Apply to employee_details table
    ELSIF _field = ANY(_detail_fields) THEN
      -- Upsert: update if exists, insert if not
      IF EXISTS (SELECT 1 FROM public.employee_details WHERE profile_id = NEW.profile_id) THEN
        EXECUTE format(
          'UPDATE public.employee_details SET %I = $1, updated_at = now() WHERE profile_id = $2',
          _field
        ) USING _value, NEW.profile_id;
      ELSE
        EXECUTE format(
          'INSERT INTO public.employee_details (profile_id, %I) VALUES ($1, $2)',
          _field
        ) USING NEW.profile_id, _value;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_apply_approved_profile_change ON public.profile_change_requests;
CREATE TRIGGER trg_apply_approved_profile_change
  AFTER UPDATE ON public.profile_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_approved_profile_change();
