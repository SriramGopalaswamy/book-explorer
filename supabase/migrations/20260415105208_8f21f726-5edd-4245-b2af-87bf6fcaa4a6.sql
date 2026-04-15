
-- Create the process_payroll_batch RPC function
CREATE OR REPLACE FUNCTION public.process_payroll_batch(p_payroll_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INT := 0;
  v_skipped INT := 0;
  v_caller_org UUID;
  v_cross_org INT;
BEGIN
  -- Resolve caller's organization
  SELECT organization_id INTO v_caller_org
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  -- Verify all supplied IDs belong to caller's org
  SELECT COUNT(*) INTO v_cross_org
  FROM public.payroll_records
  WHERE id = ANY(p_payroll_ids)
    AND organization_id != v_caller_org;

  IF v_cross_org > 0 THEN
    RAISE EXCEPTION 'Cannot process payroll records from another organization.';
  END IF;

  -- Process eligible records (draft or pending -> processed)
  WITH updated AS (
    UPDATE public.payroll_records
    SET status = 'processed',
        updated_at = NOW()
    WHERE id = ANY(p_payroll_ids)
      AND organization_id = v_caller_org
      AND status IN ('draft', 'pending')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_processed FROM updated;

  -- Count skipped (already processed/paid)
  SELECT COUNT(*) INTO v_skipped
  FROM public.payroll_records
  WHERE id = ANY(p_payroll_ids)
    AND organization_id = v_caller_org
    AND status NOT IN ('draft', 'pending');

  RETURN jsonb_build_object(
    'processed', v_processed,
    'skipped', v_skipped,
    'total', array_length(p_payroll_ids, 1)
  );
END;
$$;
