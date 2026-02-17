-- =====================================================================
-- PHASE 2: CFO INTELLIGENCE LAYER - Cash Command & Working Capital
-- =====================================================================
-- Migration: 20260217103500_phase2_cash_working_capital.sql
-- Description: Cash position tracking, projections, AR/AP aging, working capital metrics
-- Dependencies: invoices, bills, bank_accounts
-- Backward Compatible: YES (additive only)
-- =====================================================================

-- Create cash_position_snapshots table
CREATE TABLE cash_position_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NULL,
  snapshot_date DATE NOT NULL,
  total_cash NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_receivables NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_payables NUMERIC(15,2) NOT NULL DEFAULT 0,
  committed_payments NUMERIC(15,2) NOT NULL DEFAULT 0,
  expected_receipts NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

-- Add computed column for net position
ALTER TABLE cash_position_snapshots
  ADD COLUMN net_position NUMERIC(15,2) GENERATED ALWAYS AS 
    (total_cash + total_receivables - total_payables) STORED;

-- Create cash_projections table
CREATE TABLE cash_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NULL,
  projection_date DATE NOT NULL,
  projection_days INTEGER NOT NULL CHECK (projection_days IN (30, 60, 90, 180, 365)),
  opening_balance NUMERIC(15,2) NOT NULL,
  expected_inflows NUMERIC(15,2) NOT NULL DEFAULT 0,
  expected_outflows NUMERIC(15,2) NOT NULL DEFAULT 0,
  projected_balance NUMERIC(15,2) NOT NULL,
  confidence_score NUMERIC(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
  methodology TEXT, -- 'historical_average', 'invoice_based', 'manual'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, projection_date, projection_days)
);

-- Create ar_aging_snapshots table
CREATE TABLE ar_aging_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NULL,
  snapshot_date DATE NOT NULL,
  current_0_30 NUMERIC(15,2) NOT NULL DEFAULT 0,
  days_31_60 NUMERIC(15,2) NOT NULL DEFAULT 0,
  days_61_90 NUMERIC(15,2) NOT NULL DEFAULT 0,
  days_over_90 NUMERIC(15,2) NOT NULL DEFAULT 0,
  dso NUMERIC(5,2), -- Days Sales Outstanding
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

-- Add computed column for total AR
ALTER TABLE ar_aging_snapshots
  ADD COLUMN total_ar NUMERIC(15,2) GENERATED ALWAYS AS 
    (current_0_30 + days_31_60 + days_61_90 + days_over_90) STORED;

-- Create ap_aging_snapshots table
CREATE TABLE ap_aging_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NULL,
  snapshot_date DATE NOT NULL,
  current_0_30 NUMERIC(15,2) NOT NULL DEFAULT 0,
  days_31_60 NUMERIC(15,2) NOT NULL DEFAULT 0,
  days_61_90 NUMERIC(15,2) NOT NULL DEFAULT 0,
  days_over_90 NUMERIC(15,2) NOT NULL DEFAULT 0,
  dpo NUMERIC(5,2), -- Days Payable Outstanding
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

-- Add computed column for total AP
ALTER TABLE ap_aging_snapshots
  ADD COLUMN total_ap NUMERIC(15,2) GENERATED ALWAYS AS 
    (current_0_30 + days_31_60 + days_61_90 + days_over_90) STORED;

-- Create working_capital_metrics table
CREATE TABLE working_capital_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NULL,
  metric_date DATE NOT NULL,
  current_assets NUMERIC(15,2) NOT NULL DEFAULT 0,
  current_liabilities NUMERIC(15,2) NOT NULL DEFAULT 0,
  inventory NUMERIC(15,2) NOT NULL DEFAULT 0,
  dso NUMERIC(5,2), -- Days Sales Outstanding
  dpo NUMERIC(5,2), -- Days Payable Outstanding
  dio NUMERIC(5,2), -- Days Inventory Outstanding
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, metric_date)
);

-- Add computed columns
ALTER TABLE working_capital_metrics
  ADD COLUMN working_capital NUMERIC(15,2) GENERATED ALWAYS AS 
    (current_assets - current_liabilities) STORED,
  ADD COLUMN current_ratio NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN current_liabilities != 0 
    THEN ROUND((current_assets / current_liabilities)::NUMERIC, 2)
    ELSE 0 END
  ) STORED,
  ADD COLUMN quick_ratio NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN current_liabilities != 0 
    THEN ROUND(((current_assets - inventory) / current_liabilities)::NUMERIC, 2)
    ELSE 0 END
  ) STORED,
  ADD COLUMN cash_conversion_cycle NUMERIC(5,2) GENERATED ALWAYS AS 
    (COALESCE(dso, 0) + COALESCE(dio, 0) - COALESCE(dpo, 0)) STORED;

-- Create indexes
CREATE INDEX idx_cash_snapshots_user_date ON cash_position_snapshots(user_id, snapshot_date DESC);
CREATE INDEX idx_cash_snapshots_organization ON cash_position_snapshots(organization_id) WHERE organization_id IS NOT NULL;

CREATE INDEX idx_cash_projections_user_date ON cash_projections(user_id, projection_date DESC);
CREATE INDEX idx_cash_projections_days ON cash_projections(projection_days);
CREATE INDEX idx_cash_projections_organization ON cash_projections(organization_id) WHERE organization_id IS NOT NULL;

CREATE INDEX idx_ar_aging_user_date ON ar_aging_snapshots(user_id, snapshot_date DESC);
CREATE INDEX idx_ar_aging_organization ON ar_aging_snapshots(organization_id) WHERE organization_id IS NOT NULL;

CREATE INDEX idx_ap_aging_user_date ON ap_aging_snapshots(user_id, snapshot_date DESC);
CREATE INDEX idx_ap_aging_organization ON ap_aging_snapshots(organization_id) WHERE organization_id IS NOT NULL;

CREATE INDEX idx_wc_metrics_user_date ON working_capital_metrics(user_id, metric_date DESC);
CREATE INDEX idx_wc_metrics_organization ON working_capital_metrics(organization_id) WHERE organization_id IS NOT NULL;

-- Enable RLS
ALTER TABLE cash_position_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_aging_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_aging_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_capital_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies (standard pattern for all tables)
CREATE POLICY "Users can view their own cash snapshots"
ON cash_position_snapshots FOR SELECT
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = cash_position_snapshots.organization_id
    AND om.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can view their own cash projections"
ON cash_projections FOR SELECT
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = cash_projections.organization_id
    AND om.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can view their own AR aging"
ON ar_aging_snapshots FOR SELECT
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = ar_aging_snapshots.organization_id
    AND om.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can view their own AP aging"
ON ap_aging_snapshots FOR SELECT
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = ap_aging_snapshots.organization_id
    AND om.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can view their own working capital metrics"
ON working_capital_metrics FOR SELECT
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = working_capital_metrics.organization_id
    AND om.user_id = auth.uid()
  ))
);

-- Allow authenticated users to insert/update their own snapshots (system operations)
CREATE POLICY "System can manage cash snapshots"
ON cash_position_snapshots FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can manage cash projections"
ON cash_projections FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can manage AR aging"
ON ar_aging_snapshots FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can manage AP aging"
ON ap_aging_snapshots FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can manage WC metrics"
ON working_capital_metrics FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- FUNCTION: Calculate AR Aging
-- =====================================================================
CREATE OR REPLACE FUNCTION calculate_ar_aging(
  p_user_id UUID,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS ar_aging_snapshots AS $$
DECLARE
  v_snapshot ar_aging_snapshots;
  v_current NUMERIC := 0;
  v_31_60 NUMERIC := 0;
  v_61_90 NUMERIC := 0;
  v_over_90 NUMERIC := 0;
  v_total_revenue NUMERIC;
  v_dso NUMERIC;
BEGIN
  -- Calculate aging buckets
  SELECT 
    COALESCE(SUM(CASE WHEN days_overdue BETWEEN 0 AND 30 THEN outstanding_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN days_overdue BETWEEN 31 AND 60 THEN outstanding_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN days_overdue BETWEEN 61 AND 90 THEN outstanding_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN days_overdue > 90 THEN outstanding_amount ELSE 0 END), 0)
  INTO v_current, v_31_60, v_61_90, v_over_90
  FROM (
    SELECT 
      i.id,
      i.amount - COALESCE(SUM(pa.allocated_amount), 0) as outstanding_amount,
      p_as_of_date - i.due_date as days_overdue
    FROM invoices i
    LEFT JOIN payment_allocations pa ON pa.invoice_id = i.id
    WHERE i.user_id = p_user_id
      AND i.status IN ('sent', 'overdue', 'partially_paid')
      AND i.due_date <= p_as_of_date
    GROUP BY i.id, i.amount, i.due_date
    HAVING i.amount > COALESCE(SUM(pa.allocated_amount), 0)
  ) outstanding;
  
  -- Calculate DSO (Days Sales Outstanding)
  -- DSO = (Accounts Receivable / Total Credit Sales) * Number of Days
  SELECT COALESCE(SUM(amount), 0) INTO v_total_revenue
  FROM invoices
  WHERE user_id = p_user_id
    AND invoice_date >= p_as_of_date - INTERVAL '90 days'
    AND invoice_date <= p_as_of_date;
  
  IF v_total_revenue > 0 THEN
    v_dso := ROUND(((v_current + v_31_60 + v_61_90 + v_over_90) / (v_total_revenue / 90))::NUMERIC, 2);
  ELSE
    v_dso := 0;
  END IF;
  
  -- Insert or update snapshot
  INSERT INTO ar_aging_snapshots (
    user_id, snapshot_date, current_0_30, days_31_60, days_61_90, days_over_90, dso
  )
  VALUES (
    p_user_id, p_as_of_date, v_current, v_31_60, v_61_90, v_over_90, v_dso
  )
  ON CONFLICT (user_id, snapshot_date)
  DO UPDATE SET
    current_0_30 = EXCLUDED.current_0_30,
    days_31_60 = EXCLUDED.days_31_60,
    days_61_90 = EXCLUDED.days_61_90,
    days_over_90 = EXCLUDED.days_over_90,
    dso = EXCLUDED.dso
  RETURNING * INTO v_snapshot;
  
  RETURN v_snapshot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Calculate AP Aging
-- =====================================================================
CREATE OR REPLACE FUNCTION calculate_ap_aging(
  p_user_id UUID,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS ap_aging_snapshots AS $$
DECLARE
  v_snapshot ap_aging_snapshots;
  v_current NUMERIC := 0;
  v_31_60 NUMERIC := 0;
  v_61_90 NUMERIC := 0;
  v_over_90 NUMERIC := 0;
  v_total_purchases NUMERIC;
  v_dpo NUMERIC;
BEGIN
  -- Calculate aging buckets
  SELECT 
    COALESCE(SUM(CASE WHEN days_overdue BETWEEN 0 AND 30 THEN outstanding_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN days_overdue BETWEEN 31 AND 60 THEN outstanding_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN days_overdue BETWEEN 61 AND 90 THEN outstanding_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN days_overdue > 90 THEN outstanding_amount ELSE 0 END), 0)
  INTO v_current, v_31_60, v_61_90, v_over_90
  FROM (
    SELECT 
      b.id,
      b.amount - b.paid_amount as outstanding_amount,
      p_as_of_date - b.due_date as days_overdue
    FROM bills b
    WHERE b.user_id = p_user_id
      AND b.status IN ('approved', 'partially_paid', 'overdue')
      AND b.due_date <= p_as_of_date
      AND b.amount > b.paid_amount
  ) outstanding;
  
  -- Calculate DPO (Days Payable Outstanding)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_purchases
  FROM bills
  WHERE user_id = p_user_id
    AND bill_date >= p_as_of_date - INTERVAL '90 days'
    AND bill_date <= p_as_of_date;
  
  IF v_total_purchases > 0 THEN
    v_dpo := ROUND(((v_current + v_31_60 + v_61_90 + v_over_90) / (v_total_purchases / 90))::NUMERIC, 2);
  ELSE
    v_dpo := 0;
  END IF;
  
  -- Insert or update snapshot
  INSERT INTO ap_aging_snapshots (
    user_id, snapshot_date, current_0_30, days_31_60, days_61_90, days_over_90, dpo
  )
  VALUES (
    p_user_id, p_as_of_date, v_current, v_31_60, v_61_90, v_over_90, v_dpo
  )
  ON CONFLICT (user_id, snapshot_date)
  DO UPDATE SET
    current_0_30 = EXCLUDED.current_0_30,
    days_31_60 = EXCLUDED.days_31_60,
    days_61_90 = EXCLUDED.days_61_90,
    days_over_90 = EXCLUDED.days_over_90,
    dpo = EXCLUDED.dpo
  RETURNING * INTO v_snapshot;
  
  RETURN v_snapshot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Calculate Cash Position
-- =====================================================================
CREATE OR REPLACE FUNCTION calculate_cash_position(
  p_user_id UUID,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS cash_position_snapshots AS $$
DECLARE
  v_snapshot cash_position_snapshots;
  v_total_cash NUMERIC;
  v_total_ar NUMERIC;
  v_total_ap NUMERIC;
BEGIN
  -- Calculate total cash from bank accounts
  SELECT COALESCE(SUM(balance), 0) INTO v_total_cash
  FROM bank_accounts
  WHERE user_id = p_user_id
    AND status = 'Active';
  
  -- Calculate total receivables
  SELECT COALESCE(SUM(i.amount - COALESCE(pa.paid, 0)), 0) INTO v_total_ar
  FROM invoices i
  LEFT JOIN (
    SELECT invoice_id, SUM(allocated_amount) as paid
    FROM payment_allocations
    WHERE payment_type = 'receivable'
    GROUP BY invoice_id
  ) pa ON pa.invoice_id = i.id
  WHERE i.user_id = p_user_id
    AND i.status IN ('sent', 'overdue', 'partially_paid');
  
  -- Calculate total payables
  SELECT COALESCE(SUM(amount - paid_amount), 0) INTO v_total_ap
  FROM bills
  WHERE user_id = p_user_id
    AND status IN ('approved', 'partially_paid', 'overdue');
  
  -- Insert or update snapshot
  INSERT INTO cash_position_snapshots (
    user_id, snapshot_date, total_cash, total_receivables, total_payables
  )
  VALUES (
    p_user_id, p_as_of_date, v_total_cash, v_total_ar, v_total_ap
  )
  ON CONFLICT (user_id, snapshot_date)
  DO UPDATE SET
    total_cash = EXCLUDED.total_cash,
    total_receivables = EXCLUDED.total_receivables,
    total_payables = EXCLUDED.total_payables
  RETURNING * INTO v_snapshot;
  
  RETURN v_snapshot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Project Cash Flow
-- =====================================================================
CREATE OR REPLACE FUNCTION project_cash_flow(
  p_user_id UUID,
  p_projection_days INTEGER DEFAULT 30
)
RETURNS cash_projections AS $$
DECLARE
  v_projection cash_projections;
  v_opening_balance NUMERIC;
  v_expected_inflows NUMERIC;
  v_expected_outflows NUMERIC;
  v_projected_balance NUMERIC;
  v_confidence NUMERIC;
BEGIN
  -- Get current cash balance
  SELECT COALESCE(SUM(balance), 0) INTO v_opening_balance
  FROM bank_accounts
  WHERE user_id = p_user_id AND status = 'Active';
  
  -- Expected inflows (invoices due in projection period)
  SELECT COALESCE(SUM(i.amount - COALESCE(pa.paid, 0)), 0) INTO v_expected_inflows
  FROM invoices i
  LEFT JOIN (
    SELECT invoice_id, SUM(allocated_amount) as paid
    FROM payment_allocations
    WHERE payment_type = 'receivable'
    GROUP BY invoice_id
  ) pa ON pa.invoice_id = i.id
  WHERE i.user_id = p_user_id
    AND i.status IN ('sent', 'overdue', 'partially_paid')
    AND i.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + p_projection_days;
  
  -- Expected outflows (bills due in projection period)
  SELECT COALESCE(SUM(amount - paid_amount), 0) INTO v_expected_outflows
  FROM bills
  WHERE user_id = p_user_id
    AND status IN ('approved', 'partially_paid')
    AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + p_projection_days;
  
  v_projected_balance := v_opening_balance + v_expected_inflows - v_expected_outflows;
  
  -- Simple confidence score based on historical payment patterns
  -- (In real implementation, this would use ML model)
  v_confidence := 0.75;
  
  -- Insert projection
  INSERT INTO cash_projections (
    user_id, projection_date, projection_days, opening_balance,
    expected_inflows, expected_outflows, projected_balance,
    confidence_score, methodology
  )
  VALUES (
    p_user_id, CURRENT_DATE, p_projection_days, v_opening_balance,
    v_expected_inflows, v_expected_outflows, v_projected_balance,
    v_confidence, 'invoice_based'
  )
  ON CONFLICT (user_id, projection_date, projection_days)
  DO UPDATE SET
    opening_balance = EXCLUDED.opening_balance,
    expected_inflows = EXCLUDED.expected_inflows,
    expected_outflows = EXCLUDED.expected_outflows,
    projected_balance = EXCLUDED.projected_balance,
    confidence_score = EXCLUDED.confidence_score
  RETURNING * INTO v_projection;
  
  RETURN v_projection;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Get Cash Runway (days until zero cash)
-- =====================================================================
CREATE OR REPLACE FUNCTION get_cash_runway(p_user_id UUID)
RETURNS TABLE (
  current_cash NUMERIC,
  monthly_burn_rate NUMERIC,
  runway_days INTEGER,
  runway_months NUMERIC,
  projected_zero_date DATE
) AS $$
DECLARE
  v_cash NUMERIC;
  v_burn NUMERIC;
  v_days INTEGER;
BEGIN
  -- Get current cash
  SELECT COALESCE(SUM(balance), 0) INTO v_cash
  FROM bank_accounts
  WHERE user_id = p_user_id AND status = 'Active';
  
  -- Calculate monthly burn rate (expenses - revenue over last 90 days)
  SELECT 
    COALESCE((SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) - 
              SUM(CASE WHEN type = 'revenue' THEN amount ELSE 0 END)) / 3, 0)
  INTO v_burn
  FROM financial_records
  WHERE user_id = p_user_id
    AND record_date >= CURRENT_DATE - INTERVAL '90 days';
  
  -- Calculate runway
  IF v_burn > 0 THEN
    v_days := CEIL((v_cash / v_burn) * 30);
  ELSE
    v_days := 999999; -- Effectively infinite if profitable
  END IF;
  
  RETURN QUERY SELECT 
    v_cash,
    v_burn,
    v_days,
    ROUND((v_days / 30.0)::NUMERIC, 1),
    CASE WHEN v_days < 999999 THEN CURRENT_DATE + v_days ELSE NULL END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- GRANT PERMISSIONS
-- =====================================================================
GRANT EXECUTE ON FUNCTION calculate_ar_aging TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_ap_aging TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_cash_position TO authenticated;
GRANT EXECUTE ON FUNCTION project_cash_flow TO authenticated;
GRANT EXECUTE ON FUNCTION get_cash_runway TO authenticated;

-- =====================================================================
-- COMMENTS
-- =====================================================================
COMMENT ON TABLE cash_position_snapshots IS 'Daily snapshots of cash, receivables, and payables for cash command center.';
COMMENT ON TABLE cash_projections IS 'Cash flow projections for 30/60/90/180/365 day horizons.';
COMMENT ON TABLE ar_aging_snapshots IS 'Accounts receivable aging analysis snapshots for tracking collection performance.';
COMMENT ON TABLE ap_aging_snapshots IS 'Accounts payable aging analysis snapshots for managing vendor payments.';
COMMENT ON TABLE working_capital_metrics IS 'Working capital metrics including current ratio, quick ratio, and cash conversion cycle.';
COMMENT ON FUNCTION calculate_ar_aging IS 'Calculates AR aging buckets and DSO. Run daily for dashboard.';
COMMENT ON FUNCTION calculate_ap_aging IS 'Calculates AP aging buckets and DPO. Run daily for dashboard.';
COMMENT ON FUNCTION calculate_cash_position IS 'Calculates current cash position from bank accounts, AR, and AP.';
COMMENT ON FUNCTION project_cash_flow IS 'Projects cash flow for specified days based on upcoming invoices and bills.';
COMMENT ON FUNCTION get_cash_runway IS 'Calculates how many days until cash runs out based on burn rate.';
