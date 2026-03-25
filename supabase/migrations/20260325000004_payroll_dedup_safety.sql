-- Fix HIGH: The earlier payroll_safety migration added UNIQUE(profile_id, pay_period)
-- without a deduplication step. If that migration failed on a production DB with
-- duplicates, this migration cleans up duplicates first, then re-ensures the constraint.

-- Step 1: Remove duplicate payroll records, keeping the most recently updated one
--         per (profile_id, pay_period) pair.
DELETE FROM payroll_records
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY profile_id, pay_period
        ORDER BY updated_at DESC, created_at DESC
      ) AS rn
    FROM payroll_records
    WHERE profile_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Step 2: Re-add the unique constraint idempotently (no-op if it already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_payroll_per_period'
      AND conrelid = 'payroll_records'::regclass
  ) THEN
    ALTER TABLE payroll_records
      ADD CONSTRAINT unique_payroll_per_period
      UNIQUE (profile_id, pay_period);
  END IF;
END;
$$;

COMMENT ON CONSTRAINT unique_payroll_per_period ON payroll_records IS
  'Prevents duplicate payroll for the same employee in the same period. Dedup applied by 20260325000004.';
