-- =============================================================================
-- MIGRATION: Fix all remaining unscoped is_admin_or_hr() RLS policy uses
-- =============================================================================
-- Context: migration 20260325000001 created org-scoped helper functions
-- (is_admin_or_hr_in_org, is_admin_or_finance_in_org, is_admin_in_org) but
-- did NOT drop/replace the existing policies that still call the old unscoped
-- is_admin_or_hr(auth.uid()).  This migration completes that work.
--
-- Pattern A: table has organization_id column
--   USING (is_admin_or_hr_in_org(auth.uid(), organization_id))
--
-- Pattern B: table has profile_id FK → profiles.organization_id
--   USING (is_admin_or_hr_in_org(auth.uid(),
--            (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)))
--
-- Pattern C: system log table with no org reference (hr_events, event_processing_log,
--            ms_graph_sync_log) — restrict to "user who is admin/hr in their own org"
--   USING (is_admin_or_hr_in_org(auth.uid(),
--            (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())))
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles  (has organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all profiles"   ON public.profiles;
DROP POLICY IF EXISTS "Admins and HR can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and HR can insert profiles"     ON public.profiles;
DROP POLICY IF EXISTS "Admins and HR can delete profiles"     ON public.profiles;

CREATE POLICY "Admins and HR can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

CREATE POLICY "Admins and HR can update all profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

CREATE POLICY "Admins and HR can insert profiles"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_hr_in_org(auth.uid(), organization_id));

CREATE POLICY "Admins and HR can delete profiles"
  ON public.profiles FOR DELETE TO authenticated
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 2. attendance_records  (has organization_id added via later migration)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all attendance"   ON public.attendance_records;
DROP POLICY IF EXISTS "Admins and HR can insert attendance"     ON public.attendance_records;
DROP POLICY IF EXISTS "Admins and HR can insert any attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Admins and HR can update attendance"     ON public.attendance_records;
DROP POLICY IF EXISTS "Admins and HR can delete attendance"     ON public.attendance_records;

CREATE POLICY "Admins and HR can view all attendance"
  ON public.attendance_records FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

CREATE POLICY "Admins and HR can insert any attendance"
  ON public.attendance_records FOR INSERT
  WITH CHECK (is_admin_or_hr_in_org(auth.uid(), organization_id));

CREATE POLICY "Admins and HR can update attendance"
  ON public.attendance_records FOR UPDATE
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

CREATE POLICY "Admins and HR can delete attendance"
  ON public.attendance_records FOR DELETE
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 3. leave_balances  (has organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all leave balances"   ON public.leave_balances;
DROP POLICY IF EXISTS "Admins and HR can insert leave balances"     ON public.leave_balances;
DROP POLICY IF EXISTS "Admins and HR can update leave balances"     ON public.leave_balances;

CREATE POLICY "Admins and HR can view all leave balances"
  ON public.leave_balances FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

CREATE POLICY "Admins and HR can insert leave balances"
  ON public.leave_balances FOR INSERT
  WITH CHECK (is_admin_or_hr_in_org(auth.uid(), organization_id));

CREATE POLICY "Admins and HR can update leave balances"
  ON public.leave_balances FOR UPDATE
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 4. leave_requests  (has organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all leave requests"   ON public.leave_requests;
DROP POLICY IF EXISTS "Admins and HR can update leave requests"     ON public.leave_requests;

CREATE POLICY "Admins and HR can view all leave requests"
  ON public.leave_requests FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

CREATE POLICY "Admins and HR can update leave requests"
  ON public.leave_requests FOR UPDATE
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 5. goals  (has organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all goals" ON public.goals;

CREATE POLICY "Admins and HR can view all goals"
  ON public.goals FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 6. memos  (has organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can manage all memos" ON public.memos;

CREATE POLICY "Admins and HR can manage all memos"
  ON public.memos FOR ALL
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 7. payroll_records  (has organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can manage all payroll"         ON public.payroll_records;
DROP POLICY IF EXISTS "Admins can view all payroll including deleted" ON public.payroll_records;
DROP POLICY IF EXISTS "Admins can view all payroll including deleted" ON public.payroll_records;

CREATE POLICY "Admins and HR can manage all payroll"
  ON public.payroll_records FOR ALL
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

-- Soft-delete visibility policy (from soft_delete migration)
DROP POLICY IF EXISTS "Admins can view all payroll including deleted" ON public.payroll_records;

CREATE POLICY "Admins can view all payroll including deleted"
  ON public.payroll_records FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 8. bulk_upload_history  (has organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all upload history"   ON public.bulk_upload_history;
DROP POLICY IF EXISTS "Admins and HR can insert upload history"     ON public.bulk_upload_history;

CREATE POLICY "Admins and HR can view all upload history"
  ON public.bulk_upload_history FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

CREATE POLICY "Admins and HR can insert upload history"
  ON public.bulk_upload_history FOR INSERT
  WITH CHECK (is_admin_or_hr_in_org(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 9. audit_logs  (has organization_id added via later migration)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view audit logs" ON public.audit_logs;

CREATE POLICY "Admins and HR can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    (organization_id IS NOT NULL AND is_admin_or_hr_in_org(auth.uid(), organization_id))
    OR
    -- rows without org_id (legacy): restrict to admin of own org
    (organization_id IS NULL AND is_admin_or_hr_in_org(auth.uid(),
      (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- 10. audit_log  (separate table; has organization_id via migration 000003)
-- ---------------------------------------------------------------------------
-- Migration 20260325000003 already recreated the policy on audit_log with
-- org scope.  The payroll_safety migration (20260216124400) policy is
-- superseded by 000003, so nothing additional is needed here.

-- ---------------------------------------------------------------------------
-- 11. financial_records soft-delete admin policy  (has organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all records including deleted" ON public.financial_records;

CREATE POLICY "Admins can view all records including deleted"
  ON public.financial_records FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 12. invoices soft-delete admin policy  (has organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all invoices including deleted" ON public.invoices;

CREATE POLICY "Admins can view all invoices including deleted"
  ON public.invoices FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 13. state_transition_history  (profile_id → profiles.organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all state history"   ON public.state_transition_history;
DROP POLICY IF EXISTS "Admins and HR can insert state history"     ON public.state_transition_history;

CREATE POLICY "Admins and HR can view all state history"
  ON public.state_transition_history FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

CREATE POLICY "Admins and HR can insert state history"
  ON public.state_transition_history FOR INSERT
  WITH CHECK (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

-- ---------------------------------------------------------------------------
-- 14. employment_periods  (profile_id → profiles.organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all employment periods"   ON public.employment_periods;
DROP POLICY IF EXISTS "Admins and HR can manage employment periods"     ON public.employment_periods;

CREATE POLICY "Admins and HR can view all employment periods"
  ON public.employment_periods FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

CREATE POLICY "Admins and HR can manage employment periods"
  ON public.employment_periods FOR ALL
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

-- ---------------------------------------------------------------------------
-- 15. employee_manager_history  (profile_id → profiles.organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all manager history"   ON public.employee_manager_history;
DROP POLICY IF EXISTS "Admins and HR can manage manager history"     ON public.employee_manager_history;

CREATE POLICY "Admins and HR can view all manager history"
  ON public.employee_manager_history FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

CREATE POLICY "Admins and HR can manage manager history"
  ON public.employee_manager_history FOR ALL
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

-- ---------------------------------------------------------------------------
-- 16. salary_structures  (profile_id → profiles.organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all salary structures"   ON public.salary_structures;
DROP POLICY IF EXISTS "Admins and HR can manage salary structures"     ON public.salary_structures;

CREATE POLICY "Admins and HR can view all salary structures"
  ON public.salary_structures FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

CREATE POLICY "Admins and HR can manage salary structures"
  ON public.salary_structures FOR ALL
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

-- ---------------------------------------------------------------------------
-- 17. salary_components  (structure_id → salary_structures → profiles.organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all salary components"   ON public.salary_components;
DROP POLICY IF EXISTS "Admins and HR can manage salary components"     ON public.salary_components;

CREATE POLICY "Admins and HR can view all salary components"
  ON public.salary_components FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id
     FROM public.profiles p
     JOIN public.salary_structures ss ON ss.profile_id = p.id
     WHERE ss.id = structure_id)));

CREATE POLICY "Admins and HR can manage salary components"
  ON public.salary_components FOR ALL
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id
     FROM public.profiles p
     JOIN public.salary_structures ss ON ss.profile_id = p.id
     WHERE ss.id = structure_id)));

-- ---------------------------------------------------------------------------
-- 18. final_settlements  (profile_id → profiles.organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all final settlements"   ON public.final_settlements;
DROP POLICY IF EXISTS "Admins and HR can manage final settlements"     ON public.final_settlements;

CREATE POLICY "Admins and HR can view all final settlements"
  ON public.final_settlements FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

CREATE POLICY "Admins and HR can manage final settlements"
  ON public.final_settlements FOR ALL
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

-- ---------------------------------------------------------------------------
-- 19. employee_assets  (profile_id → profiles.organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all assets"   ON public.employee_assets;
DROP POLICY IF EXISTS "Admins and HR can manage assets"     ON public.employee_assets;

CREATE POLICY "Admins and HR can view all assets"
  ON public.employee_assets FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

CREATE POLICY "Admins and HR can manage assets"
  ON public.employee_assets FOR ALL
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

-- ---------------------------------------------------------------------------
-- 20. exit_workflow  (profile_id → profiles.organization_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all exit workflows"   ON public.exit_workflow;
DROP POLICY IF EXISTS "Admins and HR can manage exit workflows"     ON public.exit_workflow;

CREATE POLICY "Admins and HR can view all exit workflows"
  ON public.exit_workflow FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

CREATE POLICY "Admins and HR can manage exit workflows"
  ON public.exit_workflow FOR ALL
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)));

-- ---------------------------------------------------------------------------
-- 21. hr_events  (no org_id; restrict to admins/HR of their own org)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and HR can view all events" ON public.hr_events;

CREATE POLICY "Admins and HR can view all events"
  ON public.hr_events FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())));

-- ---------------------------------------------------------------------------
-- 22. event_processing_log  (no org_id; restrict to admins/HR of their own org)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view processing log" ON public.event_processing_log;

CREATE POLICY "Admins can view processing log"
  ON public.event_processing_log FOR SELECT
  USING (is_admin_or_hr_in_org(auth.uid(),
    (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())));

-- ---------------------------------------------------------------------------
-- 23. ms_graph_sync_log  (entity_id is profile_id; restrict to admins in that profile's org)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view sync logs" ON public.ms_graph_sync_log;

CREATE POLICY "Admins can view sync logs"
  ON public.ms_graph_sync_log FOR SELECT
  USING (
    -- entity_type='profile' rows: scope to the profile's org
    (entity_type = 'profile' AND is_admin_or_hr_in_org(auth.uid(),
      (SELECT organization_id FROM public.profiles WHERE id = entity_id)))
    OR
    -- other entity types: restrict to admin of own org (best effort without org_id col)
    (entity_type <> 'profile' AND is_admin_or_hr_in_org(auth.uid(),
      (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- 24. SECURITY DEFINER function bodies still using old unscoped check
-- ---------------------------------------------------------------------------

-- 24a. permanently_delete_old_records (soft_delete migration)
CREATE OR REPLACE FUNCTION permanently_delete_old_records(
  p_table_name TEXT,
  p_days_old   INTEGER DEFAULT 2555
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted_count INTEGER;
  v_cutoff_date   TIMESTAMP WITH TIME ZONE;
  v_org_id        UUID;
BEGIN
  -- Resolve caller's org
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF NOT is_admin_or_hr_in_org(auth.uid(), v_org_id) THEN
    RAISE EXCEPTION 'Only administrators can permanently delete records';
  END IF;

  v_cutoff_date := NOW() - (p_days_old || ' days')::INTERVAL;

  EXECUTE format(
    'DELETE FROM %I WHERE deleted_at IS NOT NULL AND deleted_at < $1',
    p_table_name
  ) USING v_cutoff_date;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- 24b. restore_deleted_record (soft_delete migration)
CREATE OR REPLACE FUNCTION restore_deleted_record(
  p_table_name TEXT,
  p_record_id  UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Resolve caller's org
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF NOT is_admin_or_hr_in_org(auth.uid(), v_org_id) THEN
    RAISE EXCEPTION 'Only administrators can restore deleted records';
  END IF;

  EXECUTE format(
    'UPDATE %I SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL',
    p_table_name
  ) USING p_record_id;

  RETURN FOUND;
END;
$$;

-- 24c. reopen_fiscal_period (fiscal_period_locking migration — missed by migration 000002)
CREATE OR REPLACE FUNCTION reopen_fiscal_period(
  p_period_id UUID
) RETURNS fiscal_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_period  fiscal_periods;
  v_org_id  UUID;
BEGIN
  -- Resolve caller's org
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF NOT is_admin_or_hr_in_org(auth.uid(), v_org_id) THEN
    RAISE EXCEPTION 'Only administrators can reopen fiscal periods';
  END IF;

  SELECT * INTO v_period
  FROM fiscal_periods
  WHERE id = p_period_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiscal period not found';
  END IF;

  -- Guard: caller must own this fiscal period
  IF v_period.organization_id IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'Cannot reopen a fiscal period belonging to another organization';
  END IF;

  UPDATE fiscal_periods
  SET status = 'open', updated_at = now()
  WHERE id = p_period_id
  RETURNING * INTO v_period;

  RETURN v_period;
END;
$$;
