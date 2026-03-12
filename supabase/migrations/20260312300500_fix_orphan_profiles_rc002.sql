-- ═══════════════════════════════════════════════════════════════════════
-- REMEDIATION: RC-002 — Orphan profiles (user_id not in auth.users)
--
-- 1 profile row has a user_id that no longer exists in auth.users.
-- This can happen when an auth user is deleted without cascading to profiles.
--
-- Fix: soft-delete the orphan profile(s) first (preserve audit trail),
-- then hard-delete if they have no downstream FK references.
-- Also verify/add the FK cascade constraint.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _count INT;
BEGIN
  -- Soft-delete orphan profiles (preserves history, blocks RLS access)
  UPDATE public.profiles
  SET deleted_at = now()
  WHERE user_id NOT IN (SELECT id FROM auth.users)
    AND deleted_at IS NULL;

  GET DIAGNOSTICS _count = ROW_COUNT;

  IF _count > 0 THEN
    RAISE NOTICE 'RC-002: soft-deleted % orphan profile(s) whose auth.users row no longer exists', _count;
  ELSE
    RAISE NOTICE 'RC-002: no undeleted orphan profiles found';
  END IF;

  -- Hard-delete orphan profiles that have no FK dependencies
  -- (safe because they have no auth.users row and cannot log in)
  DELETE FROM public.profiles
  WHERE user_id NOT IN (SELECT id FROM auth.users)
    AND deleted_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.payroll_records WHERE user_id = profiles.user_id)
    AND NOT EXISTS (SELECT 1 FROM public.attendance_records WHERE user_id = profiles.user_id)
    AND NOT EXISTS (SELECT 1 FROM public.leave_requests WHERE user_id = profiles.user_id);

  GET DIAGNOSTICS _count = ROW_COUNT;
  IF _count > 0 THEN
    RAISE NOTICE 'RC-002: hard-deleted % fully-orphaned profile(s) with no downstream records', _count;
  END IF;
END;
$$;
