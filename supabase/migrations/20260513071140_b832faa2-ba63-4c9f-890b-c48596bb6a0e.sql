
-- Tombstone phantom org for any audit log writes
INSERT INTO public.organizations (id, name)
VALUES ('dca55228-e4b1-4315-ae10-e8990c0de67f', '[Archived org - cleanup]')
ON CONFLICT (id) DO NOTHING;

-- 1. Schema: support fractional days
ALTER TABLE public.leave_balances
  ALTER COLUMN total_days TYPE numeric(6,2) USING total_days::numeric,
  ALTER COLUMN used_days  TYPE numeric(6,2) USING used_days::numeric;

ALTER TABLE public.leave_requests
  ALTER COLUMN days TYPE numeric(6,2) USING days::numeric;

-- 2. Cleanup orphans with triggers disabled (orphan rows — no matching profile)
SET session_replication_role = replica;

DELETE FROM public.leave_requests
WHERE EXTRACT(YEAR FROM from_date) = 2026
  AND profile_id NOT IN (SELECT id FROM public.profiles);

DELETE FROM public.leave_balances
WHERE year = 2026
  AND profile_id NOT IN (SELECT id FROM public.profiles);

DELETE FROM public.leave_types
 WHERE organization_id = 'dca55228-e4b1-4315-ae10-e8990c0de67f';

SET session_replication_role = DEFAULT;

-- 3. leave_types taxonomy cleanup (real org)
DO $$
DECLARE
  v_org uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  DELETE FROM public.leave_types
   WHERE organization_id = v_org
     AND key IN ('earned', 'sick', 'paternity');

  UPDATE public.leave_types
     SET label = 'Sick Leave', updated_at = now()
   WHERE organization_id = v_org AND key = 'sick_leave';

  UPDATE public.leave_types
     SET label = 'Parental Leave', is_active = true, updated_at = now()
   WHERE organization_id = v_org AND key = 'maternity';

  UPDATE public.leave_types
     SET is_active = true, updated_at = now()
   WHERE organization_id = v_org AND key = 'wfh';

  INSERT INTO public.leave_types (organization_id, key, label, is_active, default_days, sort_order)
  VALUES (v_org, 'compassionate', 'Compassionate Leave', true, 0, 70)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leave_types (organization_id, key, label, is_active, default_days, sort_order)
  VALUES (v_org, 'lop', 'Loss of Pay', true, 0, 80)
  ON CONFLICT DO NOTHING;
END $$;

-- 4. Stub profiles for missing employees in the import file
INSERT INTO public.profiles (user_id, full_name, email, organization_id, status)
VALUES
  (gen_random_uuid(), 'Gayathri KV', 'gayathri@grx10.com', '00000000-0000-0000-0000-000000000001', 'active'),
  (gen_random_uuid(), 'Jeet Nag',    'jeet@grx10.com',    '00000000-0000-0000-0000-000000000001', 'active')
ON CONFLICT DO NOTHING;
