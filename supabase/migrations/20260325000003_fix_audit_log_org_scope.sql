-- Fix HIGH: audit_log table missing organization_id.
-- Without it, admins from different orgs can view each other's audit trails
-- and audit entries cannot be filtered per organization.

-- 1. Add organization_id to audit_log
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 2. Index for fast per-org audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_org_id
  ON audit_log(organization_id);

-- 3. Drop existing over-broad RLS policy
DROP POLICY IF EXISTS "Users can view their own audit logs" ON audit_log;

-- 4. New org-scoped SELECT: org members can view their org's audit logs
CREATE POLICY "Org members can view org audit logs"
ON audit_log FOR SELECT
USING (
  organization_id IN (
    SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
  OR performed_by = auth.uid()
);

-- 5. Rebuild process_payroll_batch to include organization_id in audit inserts.
--    We resolve the org from the performing user's profile.
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

  -- Check for already processed payroll
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

  -- Verify all records are in valid status for processing
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

COMMENT ON COLUMN audit_log.organization_id IS
  'Organization that owns this audit entry. Enables per-org audit trail isolation.';
