-- Fix emergency_unlock_record() to write to audit_logs (canonical)
-- instead of audit_log (legacy). The unlock logic is unchanged from the
-- version in 20260428110000. Only the INSERT target table is corrected.

CREATE OR REPLACE FUNCTION public.emergency_unlock_record(
  p_table_name TEXT,
  p_record_id  UUID,
  p_reason     TEXT DEFAULT 'Emergency admin override'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_org_id   UUID;
BEGIN
  v_is_admin := public.has_role(auth.uid(), 'admin');
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can unlock records';
  END IF;

  CASE p_table_name
    WHEN 'salary_structures' THEN
      SELECT organization_id INTO v_org_id FROM public.salary_structures WHERE id = p_record_id;
      UPDATE public.salary_structures
        SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
        WHERE id = p_record_id;

    WHEN 'payroll_records' THEN
      SELECT organization_id INTO v_org_id FROM public.payroll_records WHERE id = p_record_id;
      UPDATE public.payroll_records
        SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
        WHERE id = p_record_id;

    WHEN 'payroll_runs' THEN
      SELECT organization_id INTO v_org_id FROM public.payroll_runs WHERE id = p_record_id;
      UPDATE public.payroll_runs
        SET locked_at = NULL, locked_by = NULL
        WHERE id = p_record_id;

    WHEN 'attendance_records' THEN
      SELECT organization_id INTO v_org_id FROM public.attendance_records WHERE id = p_record_id;
      UPDATE public.attendance_records
        SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
        WHERE id = p_record_id;

    WHEN 'final_settlements' THEN
      SELECT organization_id INTO v_org_id FROM public.final_settlements WHERE id = p_record_id;
      UPDATE public.final_settlements
        SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
        WHERE id = p_record_id;

    ELSE
      RAISE EXCEPTION 'Table % not supported for emergency unlock', p_table_name;
  END CASE;

  -- Write to audit_logs (canonical) — NOT the legacy audit_log table.
  INSERT INTO public.audit_logs (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    v_org_id,
    auth.uid(),
    'EMERGENCY_UNLOCK',
    p_table_name,
    p_record_id,
    jsonb_build_object(
      'reason',      p_reason,
      'unlocked_at', NOW()
    )
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.emergency_unlock_record TO authenticated;

COMMENT ON FUNCTION public.emergency_unlock_record IS
  'Admin-only emergency unlock. Writes to audit_logs (canonical). Bypasses RLS so the unlock can reach locked rows.';
