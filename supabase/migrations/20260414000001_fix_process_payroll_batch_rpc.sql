-- Fix: process_payroll_batch RPC not found in PostgREST schema cache.
-- The function was defined in earlier migrations that were not applied to the
-- live database.  This migration idempotently creates/replaces the function so
-- the Payroll Register "Process" button works.

-- Ensure organization_id column exists on audit_log (added in
-- 20260325000003_fix_audit_log_org_scope.sql which may also be unapplied).
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_org_id
  ON audit_log(organization_id);

-- Drop existing over-broad RLS policy if it exists (from the first migration).
DROP POLICY IF EXISTS "Users can view their own audit logs" ON audit_log;

-- Org-scoped SELECT policy (idempotent via IF NOT EXISTS equivalent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_log'
      AND policyname = 'Org members can view org audit logs'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Org members can view org audit logs"
      ON audit_log FOR SELECT
      USING (
        organization_id IN (
          SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
        )
        OR performed_by = auth.uid()
      )
    $policy$;
  END IF;
END $$;

-- Recreate process_payroll_batch with org-isolation and org-scoped audit log.
CREATE OR REPLACE FUNCTION process_payroll_batch(
  p_payroll_ids UUID[]
) RETURNS TABLE (
  id UUID,
  profile_id UUID,
  pay_period TEXT,
  status TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  net_pay NUMERIC
) AS $$
DECLARE
  v_already_processed UUID[];
  v_locked_count INTEGER;
  v_caller_org_id UUID;
BEGIN
  -- Resolve caller's organization for tenant isolation and audit
  SELECT p.organization_id INTO v_caller_org_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required to process payroll';
  END IF;

  -- Ensure all supplied IDs belong to the caller's org (cross-tenant guard)
  IF EXISTS (
    SELECT 1 FROM payroll_records pr
    WHERE pr.id = ANY(p_payroll_ids)
      AND pr.organization_id IS DISTINCT FROM v_caller_org_id
  ) THEN
    RAISE EXCEPTION 'Cannot process payroll records from another organization';
  END IF;

  -- Check for already-processed records
  SELECT ARRAY_AGG(pr.id) INTO v_already_processed
  FROM payroll_records pr
  WHERE pr.id = ANY(p_payroll_ids)
    AND pr.status = 'processed';

  IF array_length(v_already_processed, 1) > 0 THEN
    RAISE EXCEPTION 'Cannot process payroll - already processed: %',
      array_to_string(v_already_processed, ', ');
  END IF;

  -- Lock rows for update (NOWAIT to fail fast if already locked)
  BEGIN
    SELECT COUNT(*) INTO v_locked_count
    FROM payroll_records pr
    WHERE pr.id = ANY(p_payroll_ids)
    FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RAISE EXCEPTION 'Payroll records are currently being processed by another user. Please try again.';
  END;

  -- Verify we locked all expected records
  IF v_locked_count != array_length(p_payroll_ids, 1) THEN
    RAISE EXCEPTION 'Some payroll record IDs were not found: expected %, found %',
      array_length(p_payroll_ids, 1), v_locked_count;
  END IF;

  -- Verify all records are in a valid status for processing
  IF EXISTS (
    SELECT 1 FROM payroll_records pr
    WHERE pr.id = ANY(p_payroll_ids)
      AND pr.status NOT IN ('draft', 'pending')
  ) THEN
    RAISE EXCEPTION 'Some payroll records are not in a valid status for processing';
  END IF;

  -- Update status to processed
  RETURN QUERY
  UPDATE payroll_records pr
  SET
    status = 'processed',
    processed_at = NOW(),
    updated_at = NOW()
  WHERE pr.id = ANY(p_payroll_ids)
  RETURNING pr.id, pr.profile_id, pr.pay_period, pr.status, pr.processed_at, pr.net_pay;

  -- Write org-scoped audit log entries
  INSERT INTO audit_log (
    table_name,
    record_id,
    action,
    performed_by,
    performed_at,
    organization_id
  )
  SELECT
    'payroll_records',
    pr.id::TEXT,
    'processed',
    auth.uid(),
    NOW(),
    v_caller_org_id
  FROM payroll_records pr
  WHERE pr.id = ANY(p_payroll_ids);

EXCEPTION
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'Payroll records are currently being processed by another user. Please try again.';
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Duplicate payroll record detected for this period. Cannot process.';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to process payroll: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION process_payroll_batch TO authenticated;

COMMENT ON FUNCTION process_payroll_batch IS
  'Processes payroll records in batch with row-level locking to prevent double-payment. Enforces org-scoped tenant isolation and writes an org-scoped audit log entry per record.';
