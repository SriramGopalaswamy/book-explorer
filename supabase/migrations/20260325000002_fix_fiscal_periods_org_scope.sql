-- Fix HIGH: fiscal_periods table is user-scoped, not org-scoped.
-- This migration adds organization_id, backfills it, updates constraints and RLS.

-- 1. Add organization_id column (nullable initially for backfill)
ALTER TABLE fiscal_periods
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2. Backfill organization_id from the owning user's profile
UPDATE fiscal_periods fp
SET organization_id = p.organization_id
FROM public.profiles p
WHERE p.user_id = fp.user_id
  AND fp.organization_id IS NULL;

-- 3. Delete any orphaned fiscal_periods that have no matching profile
DELETE FROM fiscal_periods
WHERE organization_id IS NULL;

-- 4. Make organization_id NOT NULL now that it's populated
ALTER TABLE fiscal_periods
  ALTER COLUMN organization_id SET NOT NULL;

-- 5. Drop old user-scoped unique constraint and replace with org-scoped one
ALTER TABLE fiscal_periods
  DROP CONSTRAINT IF EXISTS fiscal_periods_user_id_year_period_key;

ALTER TABLE fiscal_periods
  ADD CONSTRAINT fiscal_periods_org_year_period_unique
  UNIQUE (organization_id, year, period);

-- 6. Add index on organization_id for fast RLS scans
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_org_id
  ON fiscal_periods(organization_id);

-- 7. Drop old user-scoped RLS policies
DROP POLICY IF EXISTS "Users can view their own fiscal periods" ON fiscal_periods;
DROP POLICY IF EXISTS "Users can create fiscal periods" ON fiscal_periods;
DROP POLICY IF EXISTS "Users can close open periods" ON fiscal_periods;

-- 8. Re-create org-scoped RLS policies
--    SELECT: own org members + org-scoped admin/HR
CREATE POLICY "Org members can view fiscal periods"
ON fiscal_periods FOR SELECT
USING (
  organization_id IN (
    SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);

--    INSERT: org-scoped admin/HR can create periods for their org
CREATE POLICY "Org admins can create fiscal periods"
ON fiscal_periods FOR INSERT
WITH CHECK (
  is_admin_or_hr_in_org(auth.uid(), organization_id)
  AND status = 'open'
);

--    UPDATE: org-scoped admin/HR only (no cross-tenant updates)
CREATE POLICY "Org admins can update fiscal periods"
ON fiscal_periods FOR UPDATE
USING (
  is_admin_or_hr_in_org(auth.uid(), organization_id)
);

--    DELETE: org-scoped admin only
CREATE POLICY "Org admins can delete open fiscal periods"
ON fiscal_periods FOR DELETE
USING (
  is_admin_in_org(auth.uid(), organization_id)
  AND status = 'open'
);

-- 9. Update is_period_locked() to accept org_id instead of user_id
--    Keep the old user_id signature as a wrapper for backward compatibility
CREATE OR REPLACE FUNCTION is_period_locked(
  p_user_id UUID,
  p_date DATE
) RETURNS BOOLEAN AS $$
DECLARE
  v_org_id UUID;
  v_status TEXT;
BEGIN
  -- Derive org from user's profile
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT status INTO v_status
  FROM fiscal_periods
  WHERE organization_id = v_org_id
    AND start_date <= p_date
    AND end_date >= p_date
  LIMIT 1;

  RETURN COALESCE(v_status IN ('closed', 'locked'), FALSE);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- New org-id-based variant (preferred for new code)
CREATE OR REPLACE FUNCTION is_period_locked_for_org(
  p_org_id UUID,
  p_date DATE
) RETURNS BOOLEAN AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM fiscal_periods
  WHERE organization_id = p_org_id
    AND start_date <= p_date
    AND end_date >= p_date
  LIMIT 1;

  RETURN COALESCE(v_status IN ('closed', 'locked'), FALSE);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 10. Update initialize_fiscal_year() to require org_id
CREATE OR REPLACE FUNCTION initialize_fiscal_year(
  p_year INTEGER,
  p_org_id UUID DEFAULT NULL
) RETURNS SETOF fiscal_periods AS $$
DECLARE
  v_month INTEGER;
  v_start_date DATE;
  v_end_date DATE;
  v_org_id UUID;
BEGIN
  -- Use provided org_id or derive from caller's profile
  IF p_org_id IS NOT NULL THEN
    v_org_id := p_org_id;
  ELSE
    SELECT organization_id INTO v_org_id
    FROM public.profiles
    WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found for user';
  END IF;

  FOR v_month IN 1..12 LOOP
    v_start_date := make_date(p_year, v_month, 1);
    v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    INSERT INTO fiscal_periods (user_id, organization_id, year, period, start_date, end_date, status)
    VALUES (auth.uid(), v_org_id, p_year, v_month, v_start_date, v_end_date, 'open')
    ON CONFLICT (organization_id, year, period) DO NOTHING;
  END LOOP;

  RETURN QUERY
  SELECT * FROM fiscal_periods
  WHERE organization_id = v_org_id AND year = p_year
  ORDER BY period;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION is_period_locked_for_org TO authenticated;

COMMENT ON COLUMN fiscal_periods.organization_id IS
  'The organization this fiscal period belongs to. Replaces user-scoped isolation.';
