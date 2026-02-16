-- Fix CRITICAL Issue #5: Implement fiscal period locking
-- This migration creates fiscal periods and prevents modifications to closed periods

-- Create fiscal_periods table
CREATE TABLE fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= EXTRACT(YEAR FROM CURRENT_DATE) + 10),
  period INTEGER NOT NULL CHECK (period BETWEEN 1 AND 12),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
  closed_by UUID REFERENCES auth.users(id),
  closed_at TIMESTAMP WITH TIME ZONE,
  locked_by UUID REFERENCES auth.users(id),
  locked_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, period),
  CHECK (start_date < end_date),
  CHECK (status = 'open' OR (status IN ('closed', 'locked') AND closed_by IS NOT NULL AND closed_at IS NOT NULL))
);

-- Indexes for period lookups
CREATE INDEX idx_fiscal_periods_dates ON fiscal_periods(user_id, start_date, end_date);
CREATE INDEX idx_fiscal_periods_status ON fiscal_periods(user_id, status);
CREATE INDEX idx_fiscal_periods_year_period ON fiscal_periods(user_id, year, period);

-- Enable RLS
ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own fiscal periods"
ON fiscal_periods FOR SELECT
USING (auth.uid() = user_id OR is_admin_or_hr(auth.uid()));

CREATE POLICY "Users can create fiscal periods"
ON fiscal_periods FOR INSERT
WITH CHECK (auth.uid() = user_id AND status = 'open');

CREATE POLICY "Users can close open periods"
ON fiscal_periods FOR UPDATE
USING (auth.uid() = user_id OR is_admin_or_hr(auth.uid()));

-- Function to check if a date falls in a closed period
CREATE OR REPLACE FUNCTION is_period_locked(
  p_user_id UUID,
  p_date DATE
) RETURNS BOOLEAN AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM fiscal_periods
  WHERE user_id = p_user_id
    AND start_date <= p_date
    AND end_date >= p_date
  LIMIT 1;
  
  RETURN COALESCE(v_status IN ('closed', 'locked'), FALSE);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get period status for a date
CREATE OR REPLACE FUNCTION get_period_status(
  p_user_id UUID,
  p_date DATE
) RETURNS TEXT AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM fiscal_periods
  WHERE user_id = p_user_id
    AND start_date <= p_date
    AND end_date >= p_date
  LIMIT 1;
  
  RETURN COALESCE(v_status, 'open');
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger function to prevent modifications in closed periods
CREATE OR REPLACE FUNCTION prevent_closed_period_modification()
RETURNS TRIGGER AS $$
DECLARE
  v_date DATE;
  v_user_id UUID;
  v_status TEXT;
BEGIN
  -- Determine the date and user_id to check
  IF TG_OP = 'DELETE' THEN
    v_date := OLD.record_date;
    v_user_id := OLD.user_id;
  ELSE
    v_date := NEW.record_date;
    v_user_id := NEW.user_id;
  END IF;
  
  -- Check if period is locked
  IF is_period_locked(v_user_id, v_date) THEN
    v_status := get_period_status(v_user_id, v_date);
    RAISE EXCEPTION 'Cannot % records in % fiscal period (Date: %). Period must be reopened first.',
      TG_OP, v_status, v_date;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to financial_records table
CREATE TRIGGER trg_prevent_closed_period_financial_records
BEFORE INSERT OR UPDATE OR DELETE ON financial_records
FOR EACH ROW EXECUTE FUNCTION prevent_closed_period_modification();

-- Apply trigger to bank_transactions table
CREATE TRIGGER trg_prevent_closed_period_bank_transactions
BEFORE INSERT OR UPDATE OR DELETE ON bank_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_closed_period_modification();

-- Note: Will apply to journal_entries when that table is created

-- Function to close a fiscal period
CREATE OR REPLACE FUNCTION close_fiscal_period(
  p_period_id UUID
) RETURNS fiscal_periods AS $$
DECLARE
  v_period fiscal_periods;
  v_next_period fiscal_periods;
BEGIN
  -- Get the period
  SELECT * INTO v_period
  FROM fiscal_periods
  WHERE id = p_period_id
    AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiscal period not found or access denied';
  END IF;
  
  IF v_period.status != 'open' THEN
    RAISE EXCEPTION 'Period is already %', v_period.status;
  END IF;
  
  -- Check if there are any unposted transactions in the period
  -- (Add more validations as needed)
  
  -- Update period status
  UPDATE fiscal_periods
  SET 
    status = 'closed',
    closed_by = auth.uid(),
    closed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_period_id
  RETURNING * INTO v_period;
  
  -- Auto-create next period if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM fiscal_periods
    WHERE user_id = v_period.user_id
      AND year = CASE WHEN v_period.period = 12 THEN v_period.year + 1 ELSE v_period.year END
      AND period = CASE WHEN v_period.period = 12 THEN 1 ELSE v_period.period + 1 END
  ) THEN
    -- Create next period
    INSERT INTO fiscal_periods (user_id, year, period, start_date, end_date, status)
    VALUES (
      v_period.user_id,
      CASE WHEN v_period.period = 12 THEN v_period.year + 1 ELSE v_period.year END,
      CASE WHEN v_period.period = 12 THEN 1 ELSE v_period.period + 1 END,
      v_period.end_date + INTERVAL '1 day',
      (date_trunc('month', v_period.end_date) + INTERVAL '2 months' - INTERVAL '1 day')::DATE,
      'open'
    );
  END IF;
  
  RETURN v_period;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reopen a fiscal period (admin only)
CREATE OR REPLACE FUNCTION reopen_fiscal_period(
  p_period_id UUID
) RETURNS fiscal_periods AS $$
DECLARE
  v_period fiscal_periods;
BEGIN
  -- Only admins or HR can reopen periods
  IF NOT is_admin_or_hr(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can reopen fiscal periods';
  END IF;
  
  -- Get the period
  SELECT * INTO v_period
  FROM fiscal_periods
  WHERE id = p_period_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiscal period not found';
  END IF;
  
  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'Period is locked and cannot be reopened without unlocking first';
  END IF;
  
  IF v_period.status = 'open' THEN
    RAISE EXCEPTION 'Period is already open';
  END IF;
  
  -- Update period status
  UPDATE fiscal_periods
  SET 
    status = 'open',
    closed_by = NULL,
    closed_at = NULL,
    updated_at = NOW()
  WHERE id = p_period_id
  RETURNING * INTO v_period;
  
  RETURN v_period;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to initialize fiscal periods for a year
CREATE OR REPLACE FUNCTION initialize_fiscal_year(
  p_year INTEGER
) RETURNS SETOF fiscal_periods AS $$
DECLARE
  v_month INTEGER;
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  -- Create 12 monthly periods
  FOR v_month IN 1..12 LOOP
    v_start_date := make_date(p_year, v_month, 1);
    v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- Only create if doesn't exist
    INSERT INTO fiscal_periods (user_id, year, period, start_date, end_date, status)
    VALUES (auth.uid(), p_year, v_month, v_start_date, v_end_date, 'open')
    ON CONFLICT (user_id, year, period) DO NOTHING;
  END LOOP;
  
  RETURN QUERY
  SELECT * FROM fiscal_periods
  WHERE user_id = auth.uid() AND year = p_year
  ORDER BY period;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION is_period_locked TO authenticated;
GRANT EXECUTE ON FUNCTION get_period_status TO authenticated;
GRANT EXECUTE ON FUNCTION close_fiscal_period TO authenticated;
GRANT EXECUTE ON FUNCTION reopen_fiscal_period TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_fiscal_year TO authenticated;

-- Add trigger for automatic updated_at
CREATE TRIGGER update_fiscal_periods_updated_at
  BEFORE UPDATE ON fiscal_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments
COMMENT ON TABLE fiscal_periods IS 'Fiscal periods for financial month-end close. Addresses CRITICAL Issue #5 from system audit.';
COMMENT ON FUNCTION is_period_locked IS 'Checks if a date falls within a closed or locked fiscal period.';
COMMENT ON FUNCTION close_fiscal_period IS 'Closes a fiscal period and prevents further modifications to transactions in that period.';
COMMENT ON FUNCTION reopen_fiscal_period IS 'Reopens a closed fiscal period (admin only).';
COMMENT ON FUNCTION initialize_fiscal_year IS 'Creates 12 monthly fiscal periods for a year.';
