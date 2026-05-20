
-- Stub auth.users + profiles for exited employees Oviya R and Bhavani Prasad
-- so their Feb 2026 payroll_entries can be linked.
DO $$
DECLARE
  v_oviya_uid uuid := gen_random_uuid();
  v_bhavani_uid uuid := gen_random_uuid();
  v_org uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Oviya
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'oviya@grx10.com') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, is_super_admin
    ) VALUES (
      v_oviya_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'oviya@grx10.com', crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Oviya R"}'::jsonb,
      now(), now(), false
    );
  ELSE
    SELECT id INTO v_oviya_uid FROM auth.users WHERE lower(email) = 'oviya@grx10.com';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = 'oviya@grx10.com') THEN
    INSERT INTO public.profiles (
      user_id, email, full_name, department, job_title, status,
      organization_id, join_date, exit_date, last_working_day, fnf_status
    ) VALUES (
      v_oviya_uid, 'oviya@grx10.com', 'Oviya R', 'Call Centre', 'call Centre Agent',
      'inactive', v_org, '2025-01-01', '2026-02-28', '2026-02-28', 'pending'
    );
  END IF;

  -- Bhavani
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'bhavani@grx10.com') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, is_super_admin
    ) VALUES (
      v_bhavani_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'bhavani@grx10.com', crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Bhavani Prasad"}'::jsonb,
      now(), now(), false
    );
  ELSE
    SELECT id INTO v_bhavani_uid FROM auth.users WHERE lower(email) = 'bhavani@grx10.com';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = 'bhavani@grx10.com') THEN
    INSERT INTO public.profiles (
      user_id, email, full_name, department, job_title, status,
      organization_id, join_date, exit_date, last_working_day, fnf_status
    ) VALUES (
      v_bhavani_uid, 'bhavani@grx10.com', 'Bhavani Prasad', 'Call Centre', 'call Centre Agent',
      'inactive', v_org, '2025-01-01', '2026-02-28', '2026-02-28', 'pending'
    );
  END IF;
END $$;
