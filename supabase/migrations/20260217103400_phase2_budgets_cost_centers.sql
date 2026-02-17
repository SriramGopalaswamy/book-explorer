-- =====================================================================
-- PHASE 2: CFO INTELLIGENCE LAYER - Budgets & Cost Centers
-- =====================================================================
-- Migration: 20260217103400_phase2_budgets_cost_centers.sql
-- Description: Budget tracking, cost center profitability, variance analysis
-- Dependencies: chart_of_accounts, journal_entry_lines
-- Backward Compatible: YES (additive only)
-- =====================================================================

-- Create cost_centers table
CREATE TABLE cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NULL,
  cost_center_code TEXT NOT NULL,
  cost_center_name TEXT NOT NULL,
  parent_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES auth.users(id),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, cost_center_code)
);

-- Create account_cost_center_mappings table
CREATE TABLE account_cost_center_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE CASCADE,
  cost_center_id UUID NOT NULL REFERENCES cost_centers(id) ON DELETE CASCADE,
  allocation_percentage NUMERIC(5,2) NOT NULL DEFAULT 100.00 
    CHECK (allocation_percentage > 0 AND allocation_percentage <= 100),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(account_id, cost_center_id)
);

-- Create budgets table
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NULL,
  budget_name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year >= 2020 AND fiscal_year <= 2050),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'active', 'closed')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, fiscal_year, budget_name),
  CHECK (end_date > start_date)
);

-- Create budget_lines table
CREATE TABLE budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  cost_center_id UUID REFERENCES cost_centers(id),
  period INTEGER NOT NULL CHECK (period BETWEEN 1 AND 12),
  budgeted_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(budget_id, account_id, cost_center_id, period)
);

-- Add computed columns for variance
ALTER TABLE budget_lines 
  ADD COLUMN variance NUMERIC(15,2) GENERATED ALWAYS AS (actual_amount - budgeted_amount) STORED,
  ADD COLUMN variance_percent NUMERIC(8,2) GENERATED ALWAYS AS (
    CASE WHEN budgeted_amount != 0 
    THEN ROUND(((actual_amount - budgeted_amount) / ABS(budgeted_amount) * 100)::NUMERIC, 2)
    ELSE 0 END
  ) STORED;

-- Create indexes
CREATE INDEX idx_cost_centers_user ON cost_centers(user_id);
CREATE INDEX idx_cost_centers_parent ON cost_centers(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_cost_centers_active ON cost_centers(user_id, is_active);
CREATE INDEX idx_cost_centers_organization ON cost_centers(organization_id) WHERE organization_id IS NOT NULL;

CREATE INDEX idx_account_mappings_account ON account_cost_center_mappings(account_id);
CREATE INDEX idx_account_mappings_cost_center ON account_cost_center_mappings(cost_center_id);
CREATE INDEX idx_account_mappings_default ON account_cost_center_mappings(account_id, is_default) WHERE is_default = true;

CREATE INDEX idx_budgets_user_year ON budgets(user_id, fiscal_year);
CREATE INDEX idx_budgets_status ON budgets(user_id, status);
CREATE INDEX idx_budgets_organization ON budgets(organization_id) WHERE organization_id IS NOT NULL;

CREATE INDEX idx_budget_lines_budget ON budget_lines(budget_id);
CREATE INDEX idx_budget_lines_account ON budget_lines(account_id);
CREATE INDEX idx_budget_lines_cost_center ON budget_lines(cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX idx_budget_lines_period ON budget_lines(budget_id, period);
CREATE INDEX idx_budget_lines_variance ON budget_lines(budget_id, variance_percent DESC);

-- Enable RLS
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_cost_center_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;

-- RLS policies for cost_centers
CREATE POLICY "Users can view their own cost centers"
ON cost_centers FOR SELECT
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = cost_centers.organization_id
    AND om.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can create their own cost centers"
ON cost_centers FOR INSERT
WITH CHECK (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = cost_centers.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  ))
);

CREATE POLICY "Users can update their own cost centers"
ON cost_centers FOR UPDATE
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = cost_centers.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  ))
);

CREATE POLICY "Users can delete their own cost centers"
ON cost_centers FOR DELETE
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = cost_centers.organization_id
    AND om.user_id = auth.uid()
    AND om.role = 'owner'
  ))
);

-- RLS policies for account_cost_center_mappings
CREATE POLICY "Users can view their account mappings"
ON account_cost_center_mappings FOR SELECT
USING (EXISTS (
  SELECT 1 FROM chart_of_accounts coa
  WHERE coa.id = account_cost_center_mappings.account_id
  AND auth.uid() = coa.user_id
));

CREATE POLICY "Users can create account mappings"
ON account_cost_center_mappings FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM chart_of_accounts coa
  WHERE coa.id = account_cost_center_mappings.account_id
  AND auth.uid() = coa.user_id
));

CREATE POLICY "Users can update account mappings"
ON account_cost_center_mappings FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM chart_of_accounts coa
  WHERE coa.id = account_cost_center_mappings.account_id
  AND auth.uid() = coa.user_id
));

CREATE POLICY "Users can delete account mappings"
ON account_cost_center_mappings FOR DELETE
USING (EXISTS (
  SELECT 1 FROM chart_of_accounts coa
  WHERE coa.id = account_cost_center_mappings.account_id
  AND auth.uid() = coa.user_id
));

-- RLS policies for budgets
CREATE POLICY "Users can view their own budgets"
ON budgets FOR SELECT
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = budgets.organization_id
    AND om.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can create their own budgets"
ON budgets FOR INSERT
WITH CHECK (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = budgets.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  ))
);

CREATE POLICY "Users can update their own budgets"
ON budgets FOR UPDATE
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = budgets.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  ))
);

CREATE POLICY "Users can delete their own draft budgets"
ON budgets FOR DELETE
USING (
  status = 'draft' AND (
    (organization_id IS NULL AND auth.uid() = user_id)
    OR (organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = budgets.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    ))
  )
);

-- RLS policies for budget_lines
CREATE POLICY "Users can view their budget lines"
ON budget_lines FOR SELECT
USING (EXISTS (
  SELECT 1 FROM budgets b
  WHERE b.id = budget_lines.budget_id
  AND (
    (b.organization_id IS NULL AND auth.uid() = b.user_id)
    OR (b.organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = b.organization_id
      AND om.user_id = auth.uid()
    ))
  )
));

CREATE POLICY "Users can create budget lines"
ON budget_lines FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM budgets b
  WHERE b.id = budget_lines.budget_id
  AND b.status IN ('draft', 'pending_approval')
  AND (
    (b.organization_id IS NULL AND auth.uid() = b.user_id)
    OR (b.organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = b.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    ))
  )
));

CREATE POLICY "Users can update budget lines"
ON budget_lines FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM budgets b
  WHERE b.id = budget_lines.budget_id
  AND b.status IN ('draft', 'pending_approval')
  AND (
    (b.organization_id IS NULL AND auth.uid() = b.user_id)
    OR (b.organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = b.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    ))
  )
));

CREATE POLICY "Users can delete budget lines"
ON budget_lines FOR DELETE
USING (EXISTS (
  SELECT 1 FROM budgets b
  WHERE b.id = budget_lines.budget_id
  AND b.status = 'draft'
  AND (
    (b.organization_id IS NULL AND auth.uid() = b.user_id)
    OR (b.organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = b.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    ))
  )
));

-- =====================================================================
-- FUNCTION: Update Budget Actuals from Journal Entries
-- =====================================================================
CREATE OR REPLACE FUNCTION update_budget_actuals(p_budget_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_budget budgets;
  v_updated_count INTEGER := 0;
BEGIN
  -- Get budget
  SELECT * INTO v_budget FROM budgets WHERE id = p_budget_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget not found';
  END IF;
  
  -- Update actual_amount for each budget line from posted journal entries
  WITH actuals AS (
    SELECT 
      bl.id as budget_line_id,
      COALESCE(SUM(
        CASE 
          WHEN coa.account_type IN ('expense', 'asset') THEN jel.debit - jel.credit
          WHEN coa.account_type IN ('revenue', 'liability', 'equity') THEN jel.credit - jel.debit
          ELSE 0
        END
      ), 0) as actual_total
    FROM budget_lines bl
    JOIN chart_of_accounts coa ON coa.id = bl.account_id
    LEFT JOIN journal_entry_lines jel ON jel.account_id = bl.account_id
      AND (jel.cost_center_id = bl.cost_center_id OR (jel.cost_center_id IS NULL AND bl.cost_center_id IS NULL))
    LEFT JOIN journal_entries je ON je.id = jel.entry_id
    WHERE bl.budget_id = p_budget_id
      AND je.posted = true
      AND je.entry_date >= v_budget.start_date
      AND je.entry_date <= v_budget.end_date
      AND EXTRACT(MONTH FROM je.entry_date) = bl.period
    GROUP BY bl.id
  )
  UPDATE budget_lines bl
  SET 
    actual_amount = actuals.actual_total,
    updated_at = NOW()
  FROM actuals
  WHERE bl.id = actuals.budget_line_id;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Get Cost Center Profitability
-- =====================================================================
CREATE OR REPLACE FUNCTION get_cost_center_profitability(
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  cost_center_id UUID,
  cost_center_code TEXT,
  cost_center_name TEXT,
  total_revenue NUMERIC,
  total_expenses NUMERIC,
  net_profit NUMERIC,
  profit_margin NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH cost_center_activity AS (
    SELECT 
      jel.cost_center_id,
      SUM(CASE WHEN coa.account_type = 'revenue' THEN jel.credit - jel.debit ELSE 0 END) as revenue,
      SUM(CASE WHEN coa.account_type = 'expense' THEN jel.debit - jel.credit ELSE 0 END) as expenses
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.entry_id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.user_id = p_user_id
      AND je.posted = true
      AND je.entry_date BETWEEN p_start_date AND p_end_date
      AND jel.cost_center_id IS NOT NULL
    GROUP BY jel.cost_center_id
  )
  SELECT 
    cc.id,
    cc.cost_center_code,
    cc.cost_center_name,
    COALESCE(ca.revenue, 0) as total_revenue,
    COALESCE(ca.expenses, 0) as total_expenses,
    COALESCE(ca.revenue, 0) - COALESCE(ca.expenses, 0) as net_profit,
    CASE 
      WHEN COALESCE(ca.revenue, 0) > 0 
      THEN ROUND((COALESCE(ca.revenue, 0) - COALESCE(ca.expenses, 0)) / ca.revenue * 100, 2)
      ELSE 0 
    END as profit_margin
  FROM cost_centers cc
  LEFT JOIN cost_center_activity ca ON ca.cost_center_id = cc.id
  WHERE cc.user_id = p_user_id
    AND cc.is_active = true
  ORDER BY net_profit DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Get Budget Variance Report
-- =====================================================================
CREATE OR REPLACE FUNCTION get_budget_variance_report(p_budget_id UUID)
RETURNS TABLE (
  account_code TEXT,
  account_name TEXT,
  cost_center_code TEXT,
  period INTEGER,
  budgeted NUMERIC,
  actual NUMERIC,
  variance NUMERIC,
  variance_percent NUMERIC,
  variance_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    coa.account_code,
    coa.account_name,
    COALESCE(cc.cost_center_code, 'N/A') as cost_center_code,
    bl.period,
    bl.budgeted_amount,
    bl.actual_amount,
    bl.variance,
    bl.variance_percent,
    CASE 
      WHEN ABS(bl.variance_percent) <= 5 THEN 'On Track'
      WHEN bl.variance_percent > 5 AND bl.variance_percent <= 10 THEN 'Moderate Overrun'
      WHEN bl.variance_percent > 10 THEN 'Significant Overrun'
      WHEN bl.variance_percent < -5 THEN 'Under Budget'
      ELSE 'Normal'
    END as variance_status
  FROM budget_lines bl
  JOIN chart_of_accounts coa ON coa.id = bl.account_id
  LEFT JOIN cost_centers cc ON cc.id = bl.cost_center_id
  WHERE bl.budget_id = p_budget_id
  ORDER BY ABS(bl.variance_percent) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- GRANT PERMISSIONS
-- =====================================================================
GRANT EXECUTE ON FUNCTION update_budget_actuals TO authenticated;
GRANT EXECUTE ON FUNCTION get_cost_center_profitability TO authenticated;
GRANT EXECUTE ON FUNCTION get_budget_variance_report TO authenticated;

-- =====================================================================
-- ADD TRIGGERS FOR UPDATED_AT
-- =====================================================================
CREATE TRIGGER update_cost_centers_updated_at
BEFORE UPDATE ON cost_centers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_budgets_updated_at
BEFORE UPDATE ON budgets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_budget_lines_updated_at
BEFORE UPDATE ON budget_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- ADD AUDIT TRIGGERS
-- =====================================================================
CREATE TRIGGER audit_cost_centers
AFTER INSERT OR UPDATE OR DELETE ON cost_centers
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_budgets
AFTER INSERT OR UPDATE OR DELETE ON budgets
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_budget_lines
AFTER INSERT OR UPDATE OR DELETE ON budget_lines
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- =====================================================================
-- COMMENTS
-- =====================================================================
COMMENT ON TABLE cost_centers IS 'Cost centers for departmental profitability tracking and expense allocation.';
COMMENT ON TABLE account_cost_center_mappings IS 'Maps chart of accounts to cost centers for automatic allocation.';
COMMENT ON TABLE budgets IS 'Annual or project budgets for financial planning and variance analysis.';
COMMENT ON TABLE budget_lines IS 'Individual budget line items by account, cost center, and period (month).';
COMMENT ON FUNCTION update_budget_actuals IS 'Updates actual amounts in budget lines from posted journal entries. Run periodically.';
COMMENT ON FUNCTION get_cost_center_profitability IS 'Returns profitability report for all cost centers in a date range.';
COMMENT ON FUNCTION get_budget_variance_report IS 'Returns budget vs actual variance report with status indicators.';
COMMENT ON COLUMN budget_lines.variance IS 'Computed: actual - budgeted. Positive = over budget (bad for expenses, good for revenue).';
COMMENT ON COLUMN budget_lines.variance_percent IS 'Computed: (actual - budgeted) / budgeted * 100.';
