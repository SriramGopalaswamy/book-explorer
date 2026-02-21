
-- ============================================================
-- SUPERADMIN CONTROL PLANE — DATABASE LAYER
-- ============================================================

-- 1. Add status column to organizations if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.organizations ADD COLUMN status text NOT NULL DEFAULT 'active';
  END IF;
END $$;

-- 2. Create platform_admin_logs table for superadmin action audit trail
CREATE TABLE IF NOT EXISTS public.platform_admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  target_name text,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admin_logs ENABLE ROW LEVEL SECURITY;

-- Only super_admins can read/write platform_admin_logs
CREATE POLICY "Super admins can view platform logs"
  ON public.platform_admin_logs
  FOR SELECT
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert platform logs"
  ON public.platform_admin_logs
  FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()) AND admin_id = auth.uid());

-- Platform admin logs are immutable
-- No UPDATE or DELETE policies

-- 3. RLS for organizations table: super_admin can list all, org members see own
-- Drop existing policies on organizations to rewrite
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.organizations', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Org members can view own organization"
  ON public.organizations
  FOR SELECT
  USING (is_org_member(auth.uid(), id));

CREATE POLICY "Super admins can view all organizations"
  ON public.organizations
  FOR SELECT
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update organizations"
  ON public.organizations
  FOR UPDATE
  USING (is_super_admin(auth.uid()));

-- 4. Create helper function to set org context (for edge functions)
CREATE OR REPLACE FUNCTION public.set_org_context(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM set_config('app.current_org', _org_id::text, true);
END;
$$;

-- 5. Index for platform_admin_logs
CREATE INDEX IF NOT EXISTS idx_platform_admin_logs_admin_id ON public.platform_admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_platform_admin_logs_created_at ON public.platform_admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_admin_logs_action ON public.platform_admin_logs(action);
