-- 20260428100000_fix_rbac_superadmin_write.sql (policies/function only — already idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='role_permissions' AND policyname='super_admin_manage_role_permissions') THEN
    CREATE POLICY "super_admin_manage_role_permissions" ON public.role_permissions FOR ALL
      USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='role_permissions' AND policyname='super_admin_read_role_permissions') THEN
    EXECUTE 'DROP POLICY "super_admin_read_role_permissions" ON public.role_permissions';
  END IF;
END $$;

-- 20260428110000_enforce_payroll_lock_at_db.sql
CREATE OR REPLACE FUNCTION public.trg_fn_prevent_locked_payroll_edit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'locked' THEN
    -- Allow status transitions away from locked only by admin/finance via emergency unlock function
    IF NEW.status = OLD.status THEN
      RAISE EXCEPTION 'Payroll entry % is locked and cannot be modified', OLD.id USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.status = 'locked' THEN
    RAISE EXCEPTION 'Payroll entry % is locked and cannot be deleted', OLD.id USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_prevent_locked_payroll_edit ON public.payroll_entries;
CREATE TRIGGER trg_prevent_locked_payroll_edit
  BEFORE UPDATE OR DELETE ON public.payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_prevent_locked_payroll_edit();

-- 20260428120000_ai_usage_quotas.sql
CREATE TABLE IF NOT EXISTS public.ai_usage_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  monthly_token_limit BIGINT NOT NULL DEFAULT 1000000,
  tokens_used   BIGINT NOT NULL DEFAULT 0,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold_pct BETWEEN 1 AND 100),
  alert_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_quotas_org_period ON public.ai_usage_quotas(organization_id, period_start DESC);

ALTER TABLE public.ai_usage_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view ai_usage_quotas" ON public.ai_usage_quotas;
CREATE POLICY "org members can view ai_usage_quotas"
  ON public.ai_usage_quotas FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "super_admin manage ai_usage_quotas" ON public.ai_usage_quotas;
CREATE POLICY "super_admin manage ai_usage_quotas"
  ON public.ai_usage_quotas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- 20260428130000_fix_emergency_unlock_audit_table.sql
CREATE TABLE IF NOT EXISTS public.emergency_unlock_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_entry_id UUID,
  payroll_run_id UUID,
  unlocked_by UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emergency_unlock_audit_org ON public.emergency_unlock_audit(organization_id, unlocked_at DESC);

ALTER TABLE public.emergency_unlock_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org admins view emergency unlocks" ON public.emergency_unlock_audit;
CREATE POLICY "org admins view emergency unlocks"
  ON public.emergency_unlock_audit FOR SELECT TO authenticated
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

DROP POLICY IF EXISTS "org admins insert emergency unlocks" ON public.emergency_unlock_audit;
CREATE POLICY "org admins insert emergency unlocks"
  ON public.emergency_unlock_audit FOR INSERT TO authenticated
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id) AND unlocked_by = auth.uid());
