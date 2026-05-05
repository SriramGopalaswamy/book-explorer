
-- =============================================
-- Fix 1: Reassign ghost profiles to correct auth users
-- =============================================

UPDATE public.profiles
SET user_id = '94ad405f-f61c-48ca-a231-8221230c5aa3', email = 'santhosh@grx10.com', updated_at = NOW()
WHERE id = '00774532-e996-46c8-b59a-c2aaac24ac9f';

UPDATE public.profiles
SET user_id = '7237583f-86d3-400f-a35b-0ca7ae240406', email = 'mohammed@grx10.com', updated_at = NOW()
WHERE id = '178c42a7-5a21-460b-8f53-e890ab6a8301';

UPDATE public.profiles
SET user_id = '6625a126-7290-403d-a162-5762439c0be8', email = 'udaya@grx10.com', updated_at = NOW()
WHERE id = '06e25299-bee6-451a-b663-1678b573b1bd';

-- Clean up ghost org memberships
DELETE FROM public.organization_members
WHERE user_id IN ('9d32f5f7-5f0d-478e-9891-768d782c76b1', '2155eb8d-3464-43f4-af8d-c5f73c00119a', '9c981d76-937b-4cc2-a13b-ee4bb130d3cb');

-- Ensure correct auth users have org membership
INSERT INTO public.organization_members (user_id, organization_id)
VALUES
  ('94ad405f-f61c-48ca-a231-8221230c5aa3', '00000000-0000-0000-0000-000000000001'),
  ('7237583f-86d3-400f-a35b-0ca7ae240406', '00000000-0000-0000-0000-000000000001'),
  ('6625a126-7290-403d-a162-5762439c0be8', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Move roles from ghost to correct auth users
DELETE FROM public.user_roles
WHERE user_id IN ('9d32f5f7-5f0d-478e-9891-768d782c76b1', '2155eb8d-3464-43f4-af8d-c5f73c00119a', '9c981d76-937b-4cc2-a13b-ee4bb130d3cb');

INSERT INTO public.user_roles (user_id, role, organization_id)
VALUES
  ('94ad405f-f61c-48ca-a231-8221230c5aa3', 'employee', '00000000-0000-0000-0000-000000000001'),
  ('7237583f-86d3-400f-a35b-0ca7ae240406', 'employee', '00000000-0000-0000-0000-000000000001'),
  ('6625a126-7290-403d-a162-5762439c0be8', 'employee', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id, role, organization_id) DO NOTHING;

-- Delete ghost auth.users entries
DELETE FROM auth.users
WHERE id IN ('9d32f5f7-5f0d-478e-9891-768d782c76b1', '2155eb8d-3464-43f4-af8d-c5f73c00119a', '9c981d76-937b-4cc2-a13b-ee4bb130d3cb');

-- Fix remaining NULL confirmation tokens
UPDATE auth.users
SET confirmation_token = ''
WHERE confirmation_token IS NULL;

-- =============================================
-- Fix 2d: Block ex-employees
-- =============================================

UPDATE public.profiles
SET status = 'inactive', updated_at = NOW()
WHERE email IN ('rajesh@grx10.com', 'allen@grx10.com');

UPDATE auth.users
SET banned_until = 'infinity'
WHERE email IN ('rajesh@grx10.com', 'allen@grx10.com', 'nivetha@grx10.com');

-- =============================================
-- Fix 2a: Patch revoke_employee_login()
-- =============================================

CREATE OR REPLACE FUNCTION public.revoke_employee_login(p_profile_id UUID)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
