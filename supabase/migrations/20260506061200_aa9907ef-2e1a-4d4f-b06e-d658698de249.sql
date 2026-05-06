DROP FUNCTION IF EXISTS public.seed_default_role_permissions(uuid);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='role_permissions' AND policyname='super_admin_manage_role_permissions') THEN
    CREATE POLICY "super_admin_manage_role_permissions" ON public.role_permissions FOR ALL
      USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
  END IF;
END; $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='role_permissions' AND policyname='super_admin_read_role_permissions') THEN
    EXECUTE 'DROP POLICY "super_admin_read_role_permissions" ON public.role_permissions';
  END IF;
END; $$;

CREATE FUNCTION public.seed_default_role_permissions(p_org_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  INSERT INTO public.role_permissions
    (organization_id, role, resource, can_view, can_create, can_edit, can_delete, can_export)
  VALUES
    (p_org_id,'hr','dashboard',true,false,false,false,false),
    (p_org_id,'hr','hrms_employees',true,true,true,true,true),
    (p_org_id,'hr','hrms_payroll',true,true,true,false,true),
    (p_org_id,'hr','hrms_my_payslips',true,false,false,false,true),
    (p_org_id,'hr','hrms_attendance',true,true,true,true,true),
    (p_org_id,'hr','hrms_leaves',true,true,true,true,true),
    (p_org_id,'hr','hrms_holidays',true,true,true,true,true),
    (p_org_id,'hr','hrms_org_chart',true,false,false,false,false),
    (p_org_id,'hr','hrms_ctc_components',true,true,true,true,true),
    (p_org_id,'hr','hrms_manager_inbox',true,false,false,false,false),
    (p_org_id,'hr','hrms_reimbursements',true,true,true,true,true),
    (p_org_id,'hr','goals',true,true,true,true,true),
    (p_org_id,'manager','dashboard',true,false,false,false,false),
    (p_org_id,'manager','hrms_my_payslips',true,false,false,false,true),
    (p_org_id,'manager','hrms_attendance',true,false,true,false,false),
    (p_org_id,'manager','hrms_leaves',true,false,true,false,false),
    (p_org_id,'manager','hrms_holidays',true,false,false,false,false),
    (p_org_id,'manager','hrms_org_chart',true,false,false,false,false),
    (p_org_id,'manager','hrms_manager_inbox',true,true,true,true,true),
    (p_org_id,'manager','hrms_reimbursements',true,false,true,false,false),
    (p_org_id,'manager','goals',true,true,true,true,true),
    (p_org_id,'manager','user_management',true,false,true,false,false),
    (p_org_id,'finance','dashboard',true,false,false,false,false),
    (p_org_id,'finance','financial',true,true,true,true,true),
    (p_org_id,'finance','inventory',true,true,true,true,true),
    (p_org_id,'finance','manufacturing',true,true,true,true,true),
    (p_org_id,'finance','procurement',true,true,true,true,true),
    (p_org_id,'finance','sales',true,true,true,true,true),
    (p_org_id,'finance','warehouse',true,true,true,true,true),
    (p_org_id,'finance','hrms_payroll',true,false,true,false,true),
    (p_org_id,'finance','hrms_my_payslips',true,false,false,false,true),
    (p_org_id,'finance','hrms_holidays',true,false,false,false,false),
    (p_org_id,'finance','hrms_org_chart',true,false,false,false,false),
    (p_org_id,'finance','hrms_ctc_components',true,false,false,false,false),
    (p_org_id,'finance','hrms_reimbursements',true,false,true,false,false),
    (p_org_id,'finance','goals',true,false,false,false,false),
    (p_org_id,'finance','upload_history',true,false,false,false,true),
    (p_org_id,'payroll','dashboard',true,false,false,false,false),
    (p_org_id,'payroll','hrms_payroll',true,false,false,false,false),
    (p_org_id,'payroll','hrms_my_payslips',true,false,false,false,true),
    (p_org_id,'payroll','hrms_holidays',true,false,false,false,false),
    (p_org_id,'payroll','hrms_org_chart',true,false,false,false,false),
    (p_org_id,'payroll','goals',true,false,false,false,false),
    (p_org_id,'employee','dashboard',true,false,false,false,false),
    (p_org_id,'employee','hrms_my_payslips',true,false,false,false,true),
    (p_org_id,'employee','hrms_attendance',true,false,true,false,false),
    (p_org_id,'employee','hrms_leaves',true,true,false,false,false),
    (p_org_id,'employee','hrms_holidays',true,false,false,false,false),
    (p_org_id,'employee','hrms_org_chart',true,false,false,false,false),
    (p_org_id,'employee','hrms_reimbursements',true,true,false,false,false),
    (p_org_id,'employee','goals',true,true,true,false,false)
  ON CONFLICT (organization_id, role, resource) DO NOTHING;
$fn$;

CREATE TABLE IF NOT EXISTS ai_usage_quotas (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  quota_limit INTEGER NOT NULL DEFAULT 500,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, month)
);
ALTER TABLE ai_usage_quotas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION increment_ai_usage(p_org_id UUID, p_month TEXT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  INSERT INTO ai_usage_quotas (organization_id, month, request_count, updated_at)
  VALUES (p_org_id, p_month, 1, now())
  ON CONFLICT (organization_id, month) DO UPDATE
    SET request_count = ai_usage_quotas.request_count + 1, updated_at = now()
  RETURNING request_count INTO v_count;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.emergency_unlock_record(
  p_table_name TEXT, p_record_id UUID, p_reason TEXT DEFAULT 'Emergency admin override'
) RETURNS BOOLEAN AS $$
DECLARE v_is_admin BOOLEAN; v_org_id UUID;
BEGIN
  v_is_admin := public.has_role(auth.uid(), 'admin');
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Only admins can unlock records'; END IF;
  CASE p_table_name
    WHEN 'salary_structures' THEN
      SELECT organization_id INTO v_org_id FROM public.salary_structures WHERE id = p_record_id;
      UPDATE public.salary_structures SET is_locked = FALSE, locked_at = NULL, locked_by = NULL WHERE id = p_record_id;
    WHEN 'payroll_records' THEN
      SELECT organization_id INTO v_org_id FROM public.payroll_records WHERE id = p_record_id;
      UPDATE public.payroll_records SET is_locked = FALSE, locked_at = NULL, locked_by = NULL WHERE id = p_record_id;
    WHEN 'payroll_runs' THEN
      SELECT organization_id INTO v_org_id FROM public.payroll_runs WHERE id = p_record_id;
      UPDATE public.payroll_runs SET locked_at = NULL, locked_by = NULL WHERE id = p_record_id;
    WHEN 'attendance_records' THEN
      SELECT organization_id INTO v_org_id FROM public.attendance_records WHERE id = p_record_id;
      UPDATE public.attendance_records SET is_locked = FALSE, locked_at = NULL, locked_by = NULL WHERE id = p_record_id;
    WHEN 'final_settlements' THEN
      SELECT organization_id INTO v_org_id FROM public.final_settlements WHERE id = p_record_id;
      UPDATE public.final_settlements SET is_locked = FALSE, locked_at = NULL, locked_by = NULL WHERE id = p_record_id;
    ELSE RAISE EXCEPTION 'Table % not supported for emergency unlock', p_table_name;
  END CASE;
  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_org_id, auth.uid(), 'EMERGENCY_UNLOCK', p_table_name, p_record_id,
    jsonb_build_object('reason', p_reason, 'unlocked_at', NOW()));
  RETURN TRUE;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.emergency_unlock_record TO authenticated;

CREATE OR REPLACE FUNCTION public.check_payroll_entry_org_matches_run()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_run_org UUID;
BEGIN
  SELECT organization_id INTO v_run_org FROM public.payroll_runs WHERE id = NEW.payroll_run_id;
  IF v_run_org IS NULL THEN RAISE EXCEPTION 'payroll_run % not found', NEW.payroll_run_id; END IF;
  IF NEW.organization_id IS DISTINCT FROM v_run_org THEN
    RAISE EXCEPTION 'payroll_entries.organization_id (%) does not match payroll_runs.organization_id (%) for run %',
      NEW.organization_id, v_run_org, NEW.payroll_run_id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_payroll_entry_org_check ON public.payroll_entries;
CREATE TRIGGER trg_payroll_entry_org_check
  BEFORE INSERT OR UPDATE OF organization_id, payroll_run_id
  ON public.payroll_entries FOR EACH ROW
  EXECUTE FUNCTION public.check_payroll_entry_org_matches_run();

CREATE OR REPLACE FUNCTION public.refresh_payroll_run_totals()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_run_id UUID;
BEGIN
  v_run_id := COALESCE(NEW.payroll_run_id, OLD.payroll_run_id);
  IF v_run_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE public.payroll_runs SET
    total_gross      = COALESCE((SELECT SUM(gross_earnings)   FROM public.payroll_entries WHERE payroll_run_id = v_run_id), 0),
    total_deductions = COALESCE((SELECT SUM(total_deductions) FROM public.payroll_entries WHERE payroll_run_id = v_run_id), 0),
    total_net        = COALESCE((SELECT SUM(net_pay)          FROM public.payroll_entries WHERE payroll_run_id = v_run_id), 0),
    employee_count   = (SELECT COUNT(*)                        FROM public.payroll_entries WHERE payroll_run_id = v_run_id),
    updated_at       = NOW()
  WHERE id = v_run_id;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_refresh_payroll_run_totals ON public.payroll_entries;
CREATE TRIGGER trg_refresh_payroll_run_totals
  AFTER INSERT OR UPDATE OF gross_earnings, total_deductions, net_pay OR DELETE
  ON public.payroll_entries FOR EACH ROW
  EXECUTE FUNCTION public.refresh_payroll_run_totals();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('erp-documents','erp-documents', false, 10485760,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "erp-docs payslip owner read" ON storage.objects;
CREATE POLICY "erp-docs payslip owner read" ON storage.objects FOR SELECT USING (
  bucket_id = 'erp-documents' AND (string_to_array(name, '/'))[1] = 'payslips'
  AND auth.uid() IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = ((string_to_array(name, '/'))[3])::uuid AND p.user_id = auth.uid())
);

DROP POLICY IF EXISTS "erp-docs payslip admin-hr read" ON storage.objects;
CREATE POLICY "erp-docs payslip admin-hr read" ON storage.objects FOR SELECT USING (
  bucket_id = 'erp-documents' AND (string_to_array(name, '/'))[1] = 'payslips'
  AND auth.uid() IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id = ((string_to_array(name, '/'))[2])::uuid
      AND ur.role IN ('admin', 'hr'))
);

DROP POLICY IF EXISTS "erp-docs disbursements finance-admin read" ON storage.objects;
CREATE POLICY "erp-docs disbursements finance-admin read" ON storage.objects FOR SELECT USING (
  bucket_id = 'erp-documents' AND (string_to_array(name, '/'))[1] = 'disbursements'
  AND auth.uid() IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id = ((string_to_array(name, '/'))[2])::uuid
      AND ur.role IN ('admin', 'finance'))
);

CREATE OR REPLACE FUNCTION public.trg_fn_recalc_attendance_on_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org_id UUID; v_date DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_org_id := OLD.organization_id; v_date := OLD.date;
  ELSE
    v_org_id := NEW.organization_id; v_date := NEW.date;
  END IF;
  IF v_org_id IS NULL OR v_date IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  BEGIN PERFORM public.recalculate_attendance(v_org_id, v_date, v_date);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_fn_recalc_attendance_on_change failed: %', SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_recalc_attendance_on_change ON public.attendance_records;
CREATE TRIGGER trg_recalc_attendance_on_change
  AFTER INSERT OR UPDATE OF date, organization_id, status, check_in, check_out
  OR DELETE
  ON public.attendance_records FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_recalc_attendance_on_change();