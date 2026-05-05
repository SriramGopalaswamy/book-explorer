
DELETE FROM public.profiles
WHERE email IN ('shruthi@grx10.com','yousuf@grx10.com','udhay@grx10.com','santosh@grx10.com');

DELETE FROM auth.users
WHERE email IN ('shruthi@grx10.com','yousuf@grx10.com','udhay@grx10.com','santosh@grx10.com');

UPDATE auth.users SET confirmation_token = '' WHERE confirmation_token IS NULL;

UPDATE public.profiles
SET status = 'inactive', updated_at = NOW()
WHERE email IN ('rajesh@grx10.com','allen@grx10.com','nivetha@grx10.com')
  AND archived_at IS NULL;

UPDATE auth.users
SET banned_until = 'infinity'
WHERE email IN ('rajesh@grx10.com','allen@grx10.com','nivetha@grx10.com');

UPDATE public.profiles p
SET archived_at = NOW(), updated_at = NOW()
WHERE email IN ('rajesh@grx10.com','allen@grx10.com','nivetha@grx10.com')
  AND status = 'pending_approval'
  AND created_at > (
    SELECT MIN(p2.created_at) FROM public.profiles p2 WHERE p2.email = p.email
  );

CREATE OR REPLACE FUNCTION public.revoke_employee_login(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id FROM public.profiles WHERE id = p_profile_id;

  UPDATE public.profiles
    SET status = 'inactive', updated_at = NOW()
    WHERE id = p_profile_id;

  UPDATE public.exit_workflow
    SET login_revoked = TRUE, updated_at = NOW()
    WHERE profile_id = p_profile_id;

  PERFORM public.publish_hr_event(
    'LoginRevoked', 'profile', p_profile_id,
    jsonb_build_object('profile_id', p_profile_id, 'user_id', v_user_id, 'revoked_at', NOW()),
    format('login_revoked_%s', p_profile_id),
    gen_random_uuid()
  );

  RETURN TRUE;
END;
$$;
