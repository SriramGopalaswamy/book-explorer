-- Step 2: Sync stale user_id values in payroll_records from the linked profile
UPDATE public.payroll_records pr
SET    user_id    = p.user_id,
       updated_at = now()
FROM   public.profiles p
WHERE  pr.profile_id               = p.id
  AND  p.user_id                   IS NOT NULL
  AND  pr.user_id IS DISTINCT FROM p.user_id;

-- Step 2: Add profile-based RLS policy
DROP POLICY IF EXISTS "Users can view own payroll by profile" ON public.payroll_records;
CREATE POLICY "Users can view own payroll by profile"
  ON public.payroll_records FOR SELECT
  USING (
    profile_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Step 3: Back-fill profile org from user_roles
UPDATE public.profiles p
SET    organization_id = (
         SELECT ur.organization_id
         FROM   public.user_roles ur
         WHERE  ur.user_id         = p.user_id
           AND  ur.organization_id IS NOT NULL
         ORDER BY ur.created_at
         LIMIT  1
       ),
       updated_at      = now()
WHERE  p.organization_id IS NULL
  AND  p.user_id        IS NOT NULL
  AND  EXISTS (
         SELECT 1 FROM public.user_roles ur
         WHERE  ur.user_id         = p.user_id
           AND  ur.organization_id IS NOT NULL
       );

-- Step 3: Single-org superadmin fallback
DO $$
DECLARE
  v_org_id UUID;
  v_org_count INT;
BEGIN
  SELECT COUNT(*) INTO v_org_count FROM public.organizations;
  IF v_org_count = 1 THEN
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    UPDATE public.profiles p
    SET    organization_id = v_org_id, updated_at = now()
    FROM   public.platform_roles pr
    WHERE  pr.user_id = p.user_id AND pr.role = 'super_admin'
      AND  p.organization_id IS NULL;
    INSERT INTO public.organization_members (user_id, organization_id)
    SELECT pr.user_id, v_org_id FROM public.platform_roles pr
    WHERE  pr.role = 'super_admin'
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;
END $$;

-- Step 3: Mirror profile org into organization_members
INSERT INTO public.organization_members (user_id, organization_id)
SELECT DISTINCT p.user_id, p.organization_id
FROM   public.profiles p
WHERE  p.organization_id IS NOT NULL AND p.user_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Step 4: Trigger to sync profile.organization_id when a member row is inserted
CREATE OR REPLACE FUNCTION public.sync_profile_org_on_member_add()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET    organization_id = NEW.organization_id, updated_at = now()
  WHERE  user_id = NEW.user_id AND organization_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_org ON public.organization_members;
CREATE TRIGGER trg_sync_profile_org
  AFTER INSERT ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_org_on_member_add();

-- Step 4: Catch-up backfill from organization_members
UPDATE public.profiles p
SET    organization_id = om.organization_id, updated_at = now()
FROM   public.organization_members om
WHERE  om.user_id = p.user_id AND p.organization_id IS NULL AND p.user_id IS NOT NULL;