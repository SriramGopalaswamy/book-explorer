-- Item 47 follow-on: dual-source process_payroll_entries_batch RPC.
--
-- process_payroll_batch only targeted payroll_records.  After useCreatePayroll
-- was migrated to write payroll_entries (engine path), the Process button in
-- the Payroll Register would silently skip all engine records.
--
-- This migration adds process_payroll_entries_batch which handles both:
--   payroll_entries  (engine path) — transitions computed/draft/pending → processed
--   payroll_records  (legacy path) — transitions draft/pending → processed
--
-- The original process_payroll_batch is retained for backwards-compat until
-- the Payroll page is confirmed fully migrated to the new hook path.

CREATE OR REPLACE FUNCTION public.process_payroll_entries_batch(p_payroll_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engine_processed  INT := 0;
  v_legacy_processed  INT := 0;
  v_skipped           INT := 0;
  v_caller_org        UUID;
  v_cross_org_engine  INT;
  v_cross_org_legacy  INT;
BEGIN
  -- Resolve caller's organization
  SELECT organization_id INTO v_caller_org
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  -- Guard: empty input → return zeroes immediately (array_length returns NULL for empty array)
  IF array_length(p_payroll_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('processed', 0, 'engine_processed', 0, 'legacy_processed', 0, 'skipped', 0, 'total', 0);
  END IF;

  -- Cross-org guard: engine path
  SELECT COUNT(*) INTO v_cross_org_engine
  FROM public.payroll_entries
  WHERE id = ANY(p_payroll_ids)
    AND organization_id != v_caller_org;

  IF v_cross_org_engine > 0 THEN
    RAISE EXCEPTION 'Cannot process payroll records from another organization.';
  END IF;

  -- Cross-org guard: legacy path
  SELECT COUNT(*) INTO v_cross_org_legacy
  FROM public.payroll_records
  WHERE id = ANY(p_payroll_ids)
    AND organization_id != v_caller_org;

  IF v_cross_org_legacy > 0 THEN
    RAISE EXCEPTION 'Cannot process payroll records from another organization.';
  END IF;

  -- Process engine entries (computed / draft / pending → processed)
  WITH updated AS (
    UPDATE public.payroll_entries
    SET status     = 'processed',
        updated_at = NOW()
    WHERE id = ANY(p_payroll_ids)
      AND organization_id = v_caller_org
      AND status IN ('computed', 'draft', 'pending')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_engine_processed FROM updated;

  -- Process legacy records (draft / pending → processed)
  WITH updated AS (
    UPDATE public.payroll_records
    SET status     = 'processed',
        updated_at = NOW()
    WHERE id = ANY(p_payroll_ids)
      AND organization_id = v_caller_org
      AND status IN ('draft', 'pending')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_legacy_processed FROM updated;

  -- Skipped = supplied ids not updated by either path
  v_skipped := array_length(p_payroll_ids, 1)
              - v_engine_processed
              - v_legacy_processed;

  -- Audit log entry (mirrors process_payroll_batch behavior)
  INSERT INTO public.audit_logs (
    organization_id, user_id, action, entity_type, entity_id, new_values
  )
  SELECT
    v_caller_org,
    auth.uid(),
    'process_payroll_batch',
    'payroll',
    unnest(p_payroll_ids),
    jsonb_build_object('status', 'processed', 'source', 'process_payroll_entries_batch')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'processed', v_engine_processed + v_legacy_processed,
    'engine_processed', v_engine_processed,
    'legacy_processed', v_legacy_processed,
    'skipped', v_skipped,
    'total', array_length(p_payroll_ids, 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_payroll_entries_batch TO authenticated;

COMMENT ON FUNCTION public.process_payroll_entries_batch IS
  'Dual-source payroll processing: handles payroll_entries (engine) and payroll_records (legacy). '
  'Transitions computed/draft/pending → processed. Returns per-source counts.';
