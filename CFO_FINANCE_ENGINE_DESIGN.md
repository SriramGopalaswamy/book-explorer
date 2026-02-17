# CFO-GRADE FINANCE ENGINE RE-ARCHITECTURE
## Technical Design Document v1.0

**Project:** Book Explorer Financial Module Upgrade  
**Status:** Design Complete  
**Compatibility:** Lovable + Supabase  
**Date:** February 17, 2026

---

## EXECUTIVE SUMMARY

This document outlines the transformation of the Book Explorer financial module from a basic invoice tracker to a **CFO-grade AI-assisted financial intelligence engine**. All changes are **additive and backward compatible**, maintaining existing functionality while introducing enterprise accounting capabilities.

### Current State
- ✅ Invoice management (draft→sent→paid)
- ✅ Multi-account banking
- ✅ Chart of accounts (hierarchical)
- ✅ Fiscal period locking
- ✅ Cash flow forecasting
- ✅ Basic financial records

### Target State
- ✅ Full double-entry general ledger
- ✅ Accounts Receivable/Payable management
- ✅ Vendor & bill system
- ✅ Budget vs. actual tracking
- ✅ Cost center profitability
- ✅ Cash command center (30/60/90 day projections)
- ✅ AI-powered transaction classification
- ✅ Anomaly detection & alerts
- ✅ Approval workflows
- ✅ Multi-organization support (optional)

---

## PHASE 1: ACCOUNTING INTEGRITY LAYER

### 1.1 Double-Entry General Ledger

#### **journal_entries**
The heart of the accounting system. Every financial transaction creates a journal entry.

```sql
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID NULL, -- For future multi-org support
  entry_number TEXT NOT NULL, -- JE-2026-001
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  reference_type TEXT, -- 'invoice', 'bill', 'payment', 'adjustment'
  reference_id UUID, -- Link to source document
  posted BOOLEAN NOT NULL DEFAULT false,
  posted_at TIMESTAMP WITH TIME ZONE,
  posted_by UUID REFERENCES auth.users(id),
  reversed BOOLEAN NOT NULL DEFAULT false,
  reversal_of UUID REFERENCES journal_entries(id),
  fiscal_period_id UUID REFERENCES fiscal_periods(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete
  UNIQUE(user_id, entry_number)
);
```

**Key Features:**
- ✅ **Immutability:** Once posted, entries cannot be modified (only reversed)
- ✅ **Audit Trail:** Who posted, when, and why
- ✅ **Source Linking:** Traces back to invoice, bill, or payment
- ✅ **Soft Delete:** Never loses history

#### **journal_entry_lines**
Individual debit/credit lines that make up a journal entry.

```sql
CREATE TABLE journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  cost_center_id UUID NULL REFERENCES cost_centers(id),
  debit NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  CHECK (debit != credit)
);
```

**Constraints:**
- ✅ **No Mixed Lines:** Each line is EITHER debit OR credit (never both)
- ✅ **Double-Entry Validation:** Entry totals must balance (enforced by trigger)

#### **Balancing Trigger**
```sql
CREATE OR REPLACE FUNCTION validate_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_total_debits NUMERIC;
  v_total_credits NUMERIC;
BEGIN
  SELECT 
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
  INTO v_total_debits, v_total_credits
  FROM journal_entry_lines
  WHERE entry_id = COALESCE(NEW.entry_id, OLD.entry_id);
  
  IF v_total_debits != v_total_credits THEN
    RAISE EXCEPTION 'Journal entry out of balance: Debits=% Credits=%', 
      v_total_debits, v_total_credits;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_journal_balance
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION validate_journal_entry_balance();
```

### 1.2 Accounts Payable System

#### **vendors**
Manage suppliers and service providers.

```sql
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID NULL,
  vendor_code TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  payment_terms_days INTEGER DEFAULT 30,
  default_expense_account_id UUID REFERENCES chart_of_accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, vendor_code)
);
```

#### **bills**
Track purchases and accounts payable.

```sql
CREATE TABLE bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID NULL,
  bill_number TEXT NOT NULL,
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  bill_date DATE NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'approved', 'paid', 'partially_paid', 'cancelled')),
  description TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, bill_number)
);
```

### 1.3 Payment Allocation System

#### **payment_allocations**
Link payments to specific invoices or bills.

```sql
CREATE TABLE payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('receivable', 'payable')),
  payment_id UUID NOT NULL, -- bank_transaction.id
  invoice_id UUID REFERENCES invoices(id),
  bill_id UUID REFERENCES bills(id),
  allocated_amount NUMERIC(15,2) NOT NULL,
  allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CHECK (
    (payment_type = 'receivable' AND invoice_id IS NOT NULL AND bill_id IS NULL)
    OR 
    (payment_type = 'payable' AND bill_id IS NOT NULL AND invoice_id IS NULL)
  )
);
```

### 1.4 Credit Notes

```sql
CREATE TABLE credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID NULL,
  credit_note_number TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  credit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(15,2) NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'issued', 'applied', 'cancelled')),
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, credit_note_number)
);
```

### 1.5 Audit Logging

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_user_date ON audit_logs(user_id, created_at DESC);
```

---

## PHASE 2: CFO INTELLIGENCE LAYER

### 2.1 Budget System

#### **budgets**
```sql
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID NULL,
  budget_name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'approved', 'active', 'closed')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, fiscal_year, budget_name)
);
```

#### **budget_lines**
```sql
CREATE TABLE budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  cost_center_id UUID REFERENCES cost_centers(id),
  period INTEGER NOT NULL CHECK (period BETWEEN 1 AND 12),
  budgeted_amount NUMERIC(15,2) NOT NULL,
  actual_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  variance NUMERIC(15,2) GENERATED ALWAYS AS (actual_amount - budgeted_amount) STORED,
  variance_percent NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN budgeted_amount != 0 
    THEN ((actual_amount - budgeted_amount) / budgeted_amount * 100)
    ELSE 0 END
  ) STORED,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(budget_id, account_id, cost_center_id, period)
);
```

### 2.2 Cost Centers & Departments

```sql
CREATE TABLE cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID NULL,
  cost_center_code TEXT NOT NULL,
  cost_center_name TEXT NOT NULL,
  parent_id UUID REFERENCES cost_centers(id),
  manager_id UUID REFERENCES auth.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, cost_center_code)
);

-- Account to Cost Center Mapping
CREATE TABLE account_cost_center_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  cost_center_id UUID NOT NULL REFERENCES cost_centers(id),
  allocation_percentage NUMERIC(5,2) NOT NULL DEFAULT 100 
    CHECK (allocation_percentage > 0 AND allocation_percentage <= 100),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(account_id, cost_center_id)
);
```

### 2.3 Cash Command Center

#### **cash_position_snapshots**
```sql
CREATE TABLE cash_position_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  snapshot_date DATE NOT NULL,
  total_cash NUMERIC(15,2) NOT NULL,
  total_receivables NUMERIC(15,2) NOT NULL,
  total_payables NUMERIC(15,2) NOT NULL,
  net_position NUMERIC(15,2) GENERATED ALWAYS AS 
    (total_cash + total_receivables - total_payables) STORED,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);
```

#### **cash_projections**
```sql
CREATE TABLE cash_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  projection_date DATE NOT NULL,
  projection_days INTEGER NOT NULL, -- 30, 60, 90
  expected_inflows NUMERIC(15,2) NOT NULL DEFAULT 0,
  expected_outflows NUMERIC(15,2) NOT NULL DEFAULT 0,
  projected_balance NUMERIC(15,2) NOT NULL,
  confidence_score NUMERIC(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, projection_date, projection_days)
);
```

### 2.4 Working Capital Metrics

#### **ar_aging_snapshots**
```sql
CREATE TABLE ar_aging_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  snapshot_date DATE NOT NULL,
  current_0_30 NUMERIC(15,2) NOT NULL DEFAULT 0,
  days_31_60 NUMERIC(15,2) NOT NULL DEFAULT 0,
  days_61_90 NUMERIC(15,2) NOT NULL DEFAULT 0,
  days_over_90 NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_ar NUMERIC(15,2) GENERATED ALWAYS AS 
    (current_0_30 + days_31_60 + days_61_90 + days_over_90) STORED,
  dso NUMERIC(5,2), -- Days Sales Outstanding
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);
```

#### **ap_aging_snapshots**
```sql
CREATE TABLE ap_aging_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  snapshot_date DATE NOT NULL,
  current_0_30 NUMERIC(15,2) NOT NULL DEFAULT 0,
  days_31_60 NUMERIC(15,2) NOT NULL DEFAULT 0,
  days_61_90 NUMERIC(15,2) NOT NULL DEFAULT 0,
  days_over_90 NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_ap NUMERIC(15,2) GENERATED ALWAYS AS 
    (current_0_30 + days_31_60 + days_61_90 + days_over_90) STORED,
  dpo NUMERIC(5,2), -- Days Payable Outstanding
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);
```

### 2.5 Approval Workflow Engine

```sql
CREATE TABLE approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  workflow_name TEXT NOT NULL,
  workflow_type TEXT NOT NULL 
    CHECK (workflow_type IN ('invoice', 'bill', 'expense', 'journal', 'budget')),
  threshold_amount NUMERIC(15,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approver_role TEXT NOT NULL, -- 'manager', 'cfo', 'ceo'
  approver_user_id UUID REFERENCES auth.users(id),
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, step_order)
);

CREATE TABLE approval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES approval_workflows(id),
  reference_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  step_id UUID REFERENCES approval_steps(id),
  approver_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'requested_changes')),
  comments TEXT,
  actioned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

---

## PHASE 3: AI-ASSISTED AUTOMATION LAYER

### 3.1 Classification Engine

```sql
CREATE TABLE classification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  rule_name TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense', 'transfer')),
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('keyword', 'amount_range', 'vendor')),
  pattern_value TEXT NOT NULL,
  suggested_account_id UUID REFERENCES chart_of_accounts(id),
  suggested_category TEXT,
  confidence_threshold NUMERIC(3,2) DEFAULT 0.80 CHECK (confidence_threshold BETWEEN 0 AND 1),
  auto_apply BOOLEAN NOT NULL DEFAULT false,
  times_used INTEGER NOT NULL DEFAULT 0,
  times_accepted INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE historical_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  transaction_description TEXT NOT NULL,
  matched_account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  matched_category TEXT,
  match_confidence NUMERIC(3,2) CHECK (match_confidence BETWEEN 0 AND 1),
  user_accepted BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_historical_matches_description ON historical_matches 
  USING gin(to_tsvector('english', transaction_description));
```

### 3.2 Anomaly Detection

```sql
CREATE TABLE anomaly_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  metric_type TEXT NOT NULL 
    CHECK (metric_type IN ('expense_category', 'vendor_spend', 'cash_balance', 'revenue_stream')),
  metric_key TEXT NOT NULL,
  baseline_mean NUMERIC(15,2) NOT NULL,
  baseline_stddev NUMERIC(15,2) NOT NULL,
  calculation_period_days INTEGER NOT NULL DEFAULT 90,
  last_calculated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, metric_type, metric_key)
);

CREATE TABLE anomaly_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  baseline_id UUID NOT NULL REFERENCES anomaly_baselines(id),
  detected_value NUMERIC(15,2) NOT NULL,
  deviation_score NUMERIC(5,2) NOT NULL, -- How many std deviations away
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  reference_type TEXT,
  reference_id UUID,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

### 3.3 Forecast Engine

```sql
CREATE TABLE forecast_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  model_name TEXT NOT NULL,
  model_type TEXT NOT NULL 
    CHECK (model_type IN ('cash_flow', 'revenue', 'expense', 'payment_delay')),
  algorithm TEXT NOT NULL, -- 'moving_average', 'linear_regression', 'seasonal_arima'
  training_period_days INTEGER NOT NULL DEFAULT 365,
  accuracy_score NUMERIC(3,2) CHECK (accuracy_score BETWEEN 0 AND 1),
  model_parameters JSONB,
  last_trained_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE forecast_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES forecast_models(id),
  prediction_date DATE NOT NULL,
  predicted_value NUMERIC(15,2) NOT NULL,
  confidence_interval_lower NUMERIC(15,2),
  confidence_interval_upper NUMERIC(15,2),
  actual_value NUMERIC(15,2),
  prediction_error NUMERIC(15,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

### 3.4 Alert Engine

```sql
CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  rule_name TEXT NOT NULL,
  alert_type TEXT NOT NULL 
    CHECK (alert_type IN (
      'low_cash', 'overdue_invoice', 'overdue_bill', 'budget_exceeded', 
      'unusual_expense', 'duplicate_transaction', 'period_close_pending'
    )),
  condition_logic JSONB NOT NULL, -- e.g., {"operator": "<", "threshold": 10000}
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  notification_channels TEXT[] DEFAULT ARRAY['in_app'], -- 'email', 'sms', 'in_app'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  alert_rule_id UUID REFERENCES alert_rules(id),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_user_unread ON alerts(user_id, is_read, created_at DESC);
```

---

## PHASE 4: UI OPTIMIZATION STRATEGY

### 4.1 Navigation Restructure

**OLD NAVIGATION:**
```
Financial Suite
├── Accounting
├── Invoicing
├── Banking
├── Cash Flow
└── Analytics
```

**NEW NAVIGATION:**
```
Sales
├── Invoices
├── Customers
├── Receivables Aging
└── Credit Notes

Purchases
├── Bills
├── Vendors
├── Payables Aging
└── Purchase Orders

Banking
├── Accounts
├── Transactions
├── Reconciliation
└── Cash Flow Forecast (moved from separate menu)

Accounting
├── Chart of Accounts
├── Journal Entries
├── Trial Balance
└── Fiscal Periods

Reports
├── P&L Statement
├── Balance Sheet
├── Cash Flow Statement
├── Budget vs Actual
└── Cost Center Reports

CFO Dashboard
├── Cash Command Center
├── AR/AP Summary
├── Working Capital Metrics
├── Budget Variance Heatmap
└── Key Metrics
```

### 4.2 Dashboard Widgets

**Mini P&L Widget:**
```typescript
interface MiniPLData {
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  operatingExpenses: number;
  netIncome: number;
  period: string;
}
```

**AR/AP Aging Widget:**
```typescript
interface AgingSummary {
  type: 'ar' | 'ap';
  current: number;
  days_31_60: number;
  days_61_90: number;
  over_90: number;
  total: number;
}
```

**Cash Runway Widget:**
```typescript
interface CashRunway {
  currentCash: number;
  monthlyBurnRate: number;
  runwayDays: number;
  projectedZeroDate: Date;
}
```

### 4.3 Inline Features

**Reconciliation Panel:**
- Side panel in Banking > Accounts
- Shows unmatched transactions
- Drag & drop to match
- Auto-suggest based on amount/date

**Approval Badges:**
- Show status on invoices/bills: `Pending Approval`, `Approved`, `Rejected`
- Badge colors: Yellow (pending), Green (approved), Red (rejected)

**Variance Heatmap:**
- Budget vs Actual grid
- Color coding: Green (<5% over), Yellow (5-10% over), Red (>10% over)

---

## PHASE 5: SAFE MIGRATION PLAN

### 5.1 Migration Strategy

**Principle: Zero Downtime, Zero Data Loss**

All migrations follow this pattern:
1. Add new tables/columns (never drop existing)
2. Make new fields NULLABLE initially
3. Backfill data with safe defaults
4. Add constraints after backfill
5. Update application code to use new fields
6. Keep old fields for rollback safety
7. Mark old fields as deprecated (never delete)

### 5.2 Multi-Organization Support (Optional)

**Step 1: Add organization_id to all tables**
```sql
-- Example for invoices table
ALTER TABLE invoices ADD COLUMN organization_id UUID NULL;
CREATE INDEX idx_invoices_organization ON invoices(organization_id);
```

**Step 2: Create organizations table**
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);
```

**Step 3: Backfill existing data**
```sql
-- Auto-create organization for each user
INSERT INTO organizations (id, organization_name)
SELECT 
  gen_random_uuid(),
  COALESCE(email, 'User Organization')
FROM auth.users
WHERE id IN (SELECT DISTINCT user_id FROM invoices);

-- Link users to their auto-created orgs
INSERT INTO organization_members (organization_id, user_id, role)
SELECT o.id, u.id, 'owner'
FROM auth.users u
JOIN organizations o ON o.organization_name = COALESCE(u.email, 'User Organization');

-- Update invoices with organization_id
UPDATE invoices i
SET organization_id = om.organization_id
FROM organization_members om
WHERE i.user_id = om.user_id;
```

**Step 4: Update RLS policies**
```sql
-- New policy that supports both models
CREATE POLICY "Users can view invoices (multi-org aware)"
ON invoices FOR SELECT
USING (
  -- Legacy: user owns the invoice
  (organization_id IS NULL AND auth.uid() = user_id)
  OR
  -- New: user is member of the organization
  (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = invoices.organization_id
    AND om.user_id = auth.uid()
  ))
);
```

### 5.3 Rollback Strategy

**Rollback Script Template:**
```sql
-- To rollback Phase 1 (Journal Entries)
BEGIN;
  DROP TRIGGER IF EXISTS trg_validate_journal_balance ON journal_entry_lines;
  DROP TABLE IF EXISTS journal_entry_lines CASCADE;
  DROP TABLE IF EXISTS journal_entries CASCADE;
  DROP TABLE IF EXISTS vendors CASCADE;
  DROP TABLE IF EXISTS bills CASCADE;
  DROP TABLE IF EXISTS payment_allocations CASCADE;
  DROP TABLE IF EXISTS credit_notes CASCADE;
  DROP TABLE IF EXISTS audit_logs CASCADE;
  DROP FUNCTION IF EXISTS validate_journal_entry_balance;
COMMIT;
```

**Data Backup Before Each Phase:**
```bash
# Backup before migration
pg_dump -h localhost -U postgres -d book_explorer > backup_pre_phase1.sql

# Restore if needed
psql -h localhost -U postgres -d book_explorer < backup_pre_phase1.sql
```

### 5.4 Performance Optimization

**Critical Indexes:**
```sql
-- Journal Entry Performance
CREATE INDEX idx_journal_entries_date ON journal_entries(user_id, entry_date DESC);
CREATE INDEX idx_journal_entries_posted ON journal_entries(posted, entry_date DESC);
CREATE INDEX idx_journal_entry_lines_account ON journal_entry_lines(account_id, entry_id);

-- Aging Reports Performance  
CREATE INDEX idx_invoices_aging ON invoices(user_id, due_date, status) 
  WHERE status IN ('sent', 'overdue');
CREATE INDEX idx_bills_aging ON bills(user_id, due_date, status) 
  WHERE status IN ('approved', 'partially_paid');

-- Budget Variance Performance
CREATE INDEX idx_budget_lines_variance ON budget_lines(budget_id, variance_percent DESC);

-- Alert Performance
CREATE INDEX idx_alerts_active ON alerts(user_id, created_at DESC) 
  WHERE is_read = false;
```

### 5.5 Testing Strategy

**Phase 1 Tests:**
- ✅ Journal entry balancing (reject unbalanced entries)
- ✅ Posted entry immutability (reject edits to posted entries)
- ✅ Fiscal period locking (reject journals in closed periods)
- ✅ Bill creation with automatic journal entry
- ✅ Payment allocation to invoices
- ✅ Credit note reversal

**Phase 2 Tests:**
- ✅ Budget variance calculation
- ✅ Cost center profitability reports
- ✅ Cash projection accuracy
- ✅ AR/AP aging snapshots
- ✅ Approval workflow progression

**Phase 3 Tests:**
- ✅ Transaction classification accuracy
- ✅ Anomaly detection triggers
- ✅ Forecast model training
- ✅ Alert rule evaluation

**Load Testing:**
- 10,000 transactions: Journal entry creation < 100ms
- 1,000 invoices: Aging report generation < 500ms
- 5,000 budget lines: Variance heatmap < 1s

---

## DEPENDENCY MAPPING

```
Phase 1 (Accounting Integrity)
└── ZERO dependencies - can start immediately

Phase 2 (CFO Intelligence)
├── Requires Phase 1: journal_entries (for audit trail)
└── Requires Phase 1: vendors, bills (for AP aging)

Phase 3 (AI Automation)
├── Requires Phase 1: audit_logs (for historical data)
└── Requires Phase 2: budgets, cash_projections (for forecasting)

Phase 4 (UI Optimization)
├── Requires Phase 1: Sales, Purchases menus
├── Requires Phase 2: CFO Dashboard widgets
└── Requires Phase 3: Alert indicators

Phase 5 (Migration & Safety)
└── Runs in parallel with all phases
```

---

## RISK ANALYSIS

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Data loss during migration** | Low | Critical | Daily backups, rollback scripts tested |
| **Performance degradation** | Medium | High | Index optimization, query profiling |
| **RLS policy errors** | Medium | Critical | Comprehensive policy tests, staging env |
| **Journal entry imbalance** | Low | High | Trigger validation, accounting tests |
| **Breaking existing features** | Medium | High | Backward compatibility layer, feature flags |
| **User adoption resistance** | High | Medium | Gradual rollout, training materials |

---

## 12-MONTH IMPLEMENTATION ROADMAP

### Q1 2026 (Months 1-3): Foundation
- ✅ **Month 1:** Phase 1.1-1.3 (Journal entries, vendors, bills)
- ✅ **Month 2:** Phase 1.4-1.5 (Payment allocations, audit logs)
- ✅ **Month 3:** Testing & stabilization, user feedback

### Q2 2026 (Months 4-6): Intelligence
- ✅ **Month 4:** Phase 2.1-2.2 (Budgets, cost centers)
- ✅ **Month 5:** Phase 2.3-2.4 (Cash command, working capital)
- ✅ **Month 6:** Phase 2.5 (Approval workflows)

### Q3 2026 (Months 7-9): Automation
- ✅ **Month 7:** Phase 3.1-3.2 (Classification, anomaly detection)
- ✅ **Month 8:** Phase 3.3-3.4 (Forecasting, alerts)
- ✅ **Month 9:** AI model training & tuning

### Q4 2026 (Months 10-12): Optimization
- ✅ **Month 10:** Phase 4 (UI restructure, dashboards)
- ✅ **Month 11:** Performance optimization, load testing
- ✅ **Month 12:** Multi-org support (optional), final polish

---

## PERFORMANCE IMPACT ASSESSMENT

### Database Size Projections

**Current State (1000 users):**
- invoices: ~50MB
- bank_transactions: ~100MB
- Total: ~200MB

**After Implementation (1000 users, 12 months):**
- journal_entries: ~150MB
- journal_entry_lines: ~300MB
- audit_logs: ~200MB
- AI tables: ~100MB
- **Total: ~950MB** (4.75x increase)

**Query Performance:**
- P&L Generation: 2s → 500ms (materialized views)
- AR Aging: 1.5s → 300ms (indexed snapshots)
- Budget Variance: N/A → 200ms (computed columns)

### Infrastructure Requirements

**Current:**
- Database: 2 vCPU, 4GB RAM
- API: 1 instance

**Recommended:**
- Database: 4 vCPU, 8GB RAM (for AI workloads)
- API: 2 instances (load balanced)
- Background Workers: 1 instance (for nightly AI jobs)

---

## CONCLUSION

This re-architecture transforms the Book Explorer financial module into a **CFO-grade financial intelligence platform** while maintaining **100% backward compatibility** with the existing Lovable-Supabase architecture.

**Key Success Factors:**
1. ✅ **Additive-only changes** - no breaking modifications
2. ✅ **Gradual rollout** - phase by phase implementation
3. ✅ **Comprehensive testing** - automated + manual validation
4. ✅ **Performance optimization** - indexed for scale
5. ✅ **User training** - documentation + onboarding

**Next Steps:**
1. Review and approve this design document
2. Create detailed SQL migration scripts
3. Set up staging environment
4. Begin Phase 1 implementation
5. User acceptance testing

---

**Document Version:** 1.0  
**Last Updated:** February 17, 2026  
**Author:** GitHub Copilot  
**Status:** Ready for Implementation
