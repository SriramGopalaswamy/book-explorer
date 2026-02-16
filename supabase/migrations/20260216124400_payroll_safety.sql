-- Fix CRITICAL Issue #4: Prevent payroll double-payment
-- This migration adds constraints and functions to ensure payroll can only be processed once

-- Add unique constraint to prevent duplicate payroll per period
ALTER TABLE payroll_records
ADD CONSTRAINT unique_payroll_per_period
UNIQUE (profile_id, pay_period);

-- Add constraint to ensure valid status values
ALTER TABLE payroll_records
ADD CONSTRAINT check_payroll_status
CHECK (status IN ('draft', 'pending', 'processed', 'cancelled'));

-- Function to safely process payroll batch with locking
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
BEGIN
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
  
  -- Log the processing for audit trail
  INSERT INTO audit_log (
    table_name,
    record_id,
    action,
    performed_by,
    performed_at
  )
  SELECT 
    'payroll_records',
    pr.id::TEXT,
    'processed',
    auth.uid(),
    NOW()
  FROM payroll_records pr
  WHERE pr.id = ANY(p_payroll_ids);
  
EXCEPTION
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'Payroll records are currently being processed by another user. Please try again.';
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Duplicate payroll record detected for this period. Cannot process.';
  WHEN OTHERS THEN
    -- Re-raise with context
    RAISE EXCEPTION 'Failed to process payroll: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION process_payroll_batch TO authenticated;

-- Create audit log table if it doesn't exist
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  details JSONB
);

-- Enable RLS on audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view audit logs for their own actions
CREATE POLICY "Users can view their own audit logs"
ON audit_log FOR SELECT
USING (performed_by = auth.uid() OR is_admin_or_hr(auth.uid()));

-- Add index for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record 
ON audit_log(table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_performed_by 
ON audit_log(performed_by);

-- Add comments
COMMENT ON FUNCTION process_payroll_batch IS 'Safely processes payroll records with locking to prevent double payments. Addresses CRITICAL Issue #4 from system audit.';
COMMENT ON CONSTRAINT unique_payroll_per_period ON payroll_records IS 'Prevents duplicate payroll records for the same employee and period.';
COMMENT ON TABLE audit_log IS 'Audit trail for critical operations like payroll processing.';
