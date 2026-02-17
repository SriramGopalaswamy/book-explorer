-- =====================================================================
-- ROLLBACK SCRIPT: Phase 2 - CFO Intelligence Layer
-- =====================================================================
-- Description: Safely removes Phase 2 tables and functions
-- Use Case: Emergency rollback if Phase 2 causes critical issues
-- Execution Time: ~20 seconds
-- Data Loss: YES - All budgets, cost centers, cash snapshots, aging data
-- =====================================================================

BEGIN;

-- Disable audit triggers
DROP TRIGGER IF EXISTS audit_budget_lines ON budget_lines;
DROP TRIGGER IF EXISTS audit_budgets ON budgets;
DROP TRIGGER IF EXISTS audit_cost_centers ON cost_centers;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS working_capital_metrics CASCADE;
DROP TABLE IF EXISTS ap_aging_snapshots CASCADE;
DROP TABLE IF EXISTS ar_aging_snapshots CASCADE;
DROP TABLE IF EXISTS cash_projections CASCADE;
DROP TABLE IF EXISTS cash_position_snapshots CASCADE;
DROP TABLE IF EXISTS budget_lines CASCADE;
DROP TABLE IF EXISTS budgets CASCADE;
DROP TABLE IF EXISTS account_cost_center_mappings CASCADE;
DROP TABLE IF EXISTS cost_centers CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS get_cash_runway CASCADE;
DROP FUNCTION IF EXISTS project_cash_flow CASCADE;
DROP FUNCTION IF EXISTS calculate_cash_position CASCADE;
DROP FUNCTION IF EXISTS calculate_ap_aging CASCADE;
DROP FUNCTION IF EXISTS calculate_ar_aging CASCADE;
DROP FUNCTION IF EXISTS get_budget_variance_report CASCADE;
DROP FUNCTION IF EXISTS get_cost_center_profitability CASCADE;
DROP FUNCTION IF EXISTS update_budget_actuals CASCADE;

COMMIT;

-- =====================================================================
-- VERIFICATION
-- =====================================================================
-- Run this query to verify rollback success:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_name IN (
--   'cost_centers', 'budgets', 'budget_lines', 'cash_position_snapshots',
--   'cash_projections', 'ar_aging_snapshots', 'ap_aging_snapshots',
--   'working_capital_metrics'
-- );
-- Expected result: 0 rows
-- =====================================================================
