# Financial Integrity Enforcement System

## Overview

This document describes the comprehensive financial integrity enforcement system implemented in the book-explorer application. The system ensures that **ledger is the ONLY source of financial truth** and that all financial data remains mathematically consistent across all dashboards, reports, and modules.

## Core Principle

🔒 **Ledger is the ONLY source of financial truth.**

Everything derives from:
- `journal_entries`
- `journal_entry_lines`
- `chart_of_accounts`

NOT from:
- `invoices`
- `bills`
- `payments`
- `payroll`
- Dashboard tables
- Cached aggregates

**If it affects money → it must affect ledger → everything reads from ledger.**

---

## Database Architecture

### 1. Currency Normalization

All journal lines include multi-currency support:

```sql
transaction_currency TEXT (ISO 4217 code, e.g., 'USD', 'EUR')
exchange_rate NUMERIC(15,6) (rate to base currency)
base_currency_amount NUMERIC(15,2) (calculated amount in base currency)
```

**Key Features:**
- Automatic calculation of `base_currency_amount` via trigger
- All aggregations use `base_currency_amount` for consistency
- Exchange rates stored at transaction time (no retroactive changes)

### 2. Posting Date Canonicalization

The `posting_date` field is the **canonical financial truth date**:

```sql
posting_date DATE NOT NULL
```

**Usage:**
- All reports MUST use `posting_date`, not `created_at` or `updated_at`
- Enables backdating and accrual accounting
- Supports fiscal period management

### 3. Double-Entry Enforcement

Every journal entry must balance (debits = credits):

```sql
CREATE TRIGGER trg_validate_journal_balance
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION validate_journal_entry_balance();
```

**Behavior:**
- Raises exception if debits ≠ credits
- Prevents unbalanced journal entries
- Validates on every line insert/update/delete

### 4. Posted Entry Immutability

Once `posted = true`, entries cannot be modified or deleted:

```sql
CREATE TRIGGER trg_prevent_posted_modification
BEFORE UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION prevent_posted_entry_modification();

CREATE TRIGGER trg_prevent_posted_deletion
BEFORE DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION prevent_posted_entry_deletion();
```

**Reversal Process:**
- Posted entries can only be reversed via `reverse_journal_entry()` function
- Creates offsetting entry with `reversal_of` reference
- Maintains audit trail

### 5. Posting Validation Constraints

Financial documents (invoices, bills, payments) **cannot be posted** without corresponding journal entries:

```sql
-- Invoice posting validation
CREATE TRIGGER trg_validate_invoice_posting
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION validate_invoice_has_journal();

-- Bill posting validation
CREATE TRIGGER trg_validate_bill_posting
BEFORE UPDATE ON bills
FOR EACH ROW EXECUTE FUNCTION validate_bill_has_journal();

-- Payment posting validation
CREATE TRIGGER trg_validate_payment_posting
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION validate_payment_has_journal();
```

**Behavior:**
- Prevents status change to 'sent', 'approved', or 'completed' without journal
- Ensures atomic posting (document + journal in same transaction)
- Prevents orphaned financial documents

### 6. Soft Delete Prevention

Posted financial records cannot be soft-deleted:

```sql
CREATE TRIGGER trg_prevent_invoice_soft_delete
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION prevent_posted_soft_delete();
```

**Behavior:**
- Raises exception when attempting to set `deleted_at` on posted records
- Forces reversal journal entry instead
- Maintains data integrity

---

## Canonical Views (Single Source of Truth)

### 1. Trial Balance (`v_trial_balance`)

**Purpose:** Single source of truth for account balances

```sql
SELECT
  organization_id,
  account_id,
  account_code,
  account_name,
  account_type,
  SUM(base_currency_amount * CASE WHEN debit > 0 THEN 1 ELSE -1 END) AS balance,
  ...
FROM journal_entry_lines jel
JOIN journal_entries je ON jel.entry_id = je.id
JOIN chart_of_accounts coa ON jel.account_id = coa.id
WHERE je.posted = true AND je.reversed = false AND je.deleted_at IS NULL
GROUP BY organization_id, account_id, ...
```

**Usage:**
- Balance sheet derivation
- Account balance inquiries
- Financial position reporting

### 2. Profit & Loss (`v_profit_and_loss`)

**Purpose:** Income statement derived from revenue and expense accounts

```sql
SELECT
  organization_id,
  account_id,
  section, -- 'Revenue', 'Expense', 'Cost of Goods Sold'
  SUM(amount) AS amount,
  ...
FROM journal_entry_lines
WHERE account_type IN ('revenue', 'expense', 'cost_of_goods_sold')
  AND posted = true AND reversed = false
GROUP BY organization_id, account_id, section
```

**Usage:**
- **Dashboard revenue/expense MUST match this view**
- P&L statement generation
- Performance analysis

### 3. Cash Position (`v_cash_position`)

**Purpose:** Cash and bank account balances

```sql
SELECT
  organization_id,
  account_id,
  balance,
  ...
FROM journal_entry_lines
WHERE account_type = 'asset'
  AND (category ILIKE '%cash%' OR category ILIKE '%bank%')
  AND posted = true AND reversed = false
GROUP BY organization_id, account_id
```

**Usage:**
- **Banking dashboard MUST use this view**
- Cash flow analysis
- Liquidity reporting

### 4. Accounts Receivable (`v_accounts_receivable`)

**Purpose:** AR balances from AR control account

```sql
SELECT
  organization_id,
  balance,
  current_amount,  -- aging buckets
  days_31_60,
  days_61_90,
  over_90_days,
  ...
FROM journal_entry_lines
WHERE account_type = 'asset'
  AND account_name ILIKE '%accounts receivable%'
  AND posted = true AND reversed = false
```

**Usage:**
- **Invoicing dashboard MUST use this view, not invoice table aggregates**
- AR aging reports
- Collection analysis

### 5. Accounts Payable (`v_accounts_payable`)

**Purpose:** AP balances from AP control account

```sql
SELECT
  organization_id,
  balance,
  current_amount,  -- aging buckets
  days_31_60,
  over_60_days,
  ...
FROM journal_entry_lines
WHERE account_type = 'liability'
  AND account_name ILIKE '%accounts payable%'
  AND posted = true AND reversed = false
```

**Usage:**
- **Bills dashboard MUST use this view, not bill table aggregates**
- AP aging reports
- Payment planning

---

## Reconciliation Engine

### Automated Reconciliation Functions

#### 1. AR Reconciliation
```sql
SELECT * FROM reconcile_ar_subledger(organization_id);
```
Compares invoice subledger totals vs AR control account balance.

#### 2. AP Reconciliation
```sql
SELECT * FROM reconcile_ap_subledger(organization_id);
```
Compares bill subledger totals vs AP control account balance.

#### 3. Full System Reconciliation
```sql
SELECT * FROM run_full_reconciliation(organization_id);
```
Runs all reconciliation checks and logs results.

### Financial Integrity Alerts

When discrepancies are detected, alerts are created in `financial_integrity_alerts`:

```sql
CREATE TABLE financial_integrity_alerts (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  alert_type TEXT, -- 'ar_mismatch', 'ap_mismatch', etc.
  severity TEXT,   -- 'critical', 'high', 'medium', 'low'
  title TEXT,
  description TEXT,
  expected_value NUMERIC,
  actual_value NUMERIC,
  variance NUMERIC,
  variance_percentage NUMERIC,
  detected_at TIMESTAMP,
  resolved_at TIMESTAMP,
  ...
);
```

### Reconciliation History

All reconciliation runs are logged:

```sql
CREATE TABLE reconciliation_history (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  reconciliation_type TEXT,
  status TEXT, -- 'success', 'warning', 'failed'
  alerts_created INTEGER,
  records_checked INTEGER,
  variance_found NUMERIC,
  run_at TIMESTAMP,
  ...
);
```

---

## UI Integration

### React Hooks

#### Canonical View Hooks
```typescript
// Use these hooks instead of direct table queries
import {
  useTrialBalance,
  useProfitAndLoss,
  useCashPosition,
  useAccountsReceivable,
  useAccountsPayable,
  useFinancialIntegrity,
  useIntegrityAlerts,
} from "@/hooks/useCanonicalViews";
```

#### Dashboard Metrics Hook
```typescript
// Dashboard metrics derived from ledger
import {
  useDashboardMetricsFromLedger,
  useExpenseBreakdownFromLedger,
  useRevenueBreakdownFromLedger,
} from "@/hooks/useDashboardMetrics";
```

### UI Components

#### Financial Integrity Badge
```typescript
import { FinancialIntegrityBadge } from "@/components/dashboard/FinancialIntegrityBadge";

<FinancialIntegrityBadge 
  organizationId={orgId} 
  showDetails={true} 
/>
```

Shows:
- ✅ Balanced (green) - all checks passed
- ⚠️ Warnings (yellow) - minor discrepancies
- ❌ Critical Issues (red) - major discrepancies
- Last reconciliation timestamp

#### Accounting Filters
```typescript
import { AccountingFilters } from "@/components/dashboard/AccountingFilters";

<AccountingFilters
  onDateRangeChange={(range) => setDateRange(range)}
  onAccountingModeChange={(enabled) => setAccountingMode(enabled)}
  showAccountingMode={true}
  showDateFilter={true}
  baseCurrency="USD"
/>
```

Features:
- **Accounting Mode Toggle**: Uses `posting_date` instead of transaction dates
- **Posting Date Filter**: Filter by financial posting date range
- **Base Currency Display**: Shows base currency for multi-currency environments

---

## Testing & Validation

### System Guarantees

When properly implemented:

```
Dashboard Revenue = P&L Revenue = Sum of revenue journal lines = Trial balance revenue account
```

**Always. No deviation.**

### Test Scenarios

1. **Multi-currency transactions**
   - Create transactions in EUR, GBP, INR
   - Verify base_currency_amount calculation
   - Validate aggregations use base currency

2. **Partial payments**
   - Invoice $1000, receive $500
   - Verify AR control account shows $500 balance
   - Confirm AR subledger matches control account

3. **Reversals**
   - Post invoice journal entry
   - Reverse the entry
   - Verify both entries exist with `reversed = true` flag
   - Confirm net impact is zero

4. **Cross-module consistency**
   - Create invoice → verify journal entry
   - Pay invoice → verify payment journal entry
   - Check: Dashboard revenue = P&L revenue = AR activity

### Validation Queries

```sql
-- Verify trial balance is balanced
SELECT SUM(balance) FROM v_trial_balance;
-- Should be 0 (or very close to 0 for rounding)

-- Check for orphaned documents
SELECT * FROM v_orphaned_financial_documents;
-- Should return 0 rows

-- View unresolved integrity alerts
SELECT * FROM financial_integrity_alerts WHERE resolved_at IS NULL;

-- Get latest reconciliation status
SELECT * FROM get_latest_reconciliation_status(organization_id);
```

---

## Workflow Best Practices

### Posting Workflow

**ALWAYS use atomic transactions:**

```typescript
const { data, error } = await supabase.rpc('post_invoice_with_journal', {
  p_invoice_id: invoiceId,
  p_ar_account_id: arAccountId,
  p_revenue_account_id: revenueAccountId,
});
```

**Never:**
```typescript
// ❌ DON'T: Separate operations
await updateInvoiceStatus(id, 'sent');
await createJournalEntry({ reference_id: id });
```

### Data Access Pattern

**✅ DO:**
```typescript
// Use canonical views
const { data: revenue } = useProfitAndLoss(orgId);
const totalRevenue = revenue?.summary.revenue;
```

**❌ DON'T:**
```typescript
// Don't aggregate from invoice table
const { data: invoices } = useInvoices();
const totalRevenue = invoices.reduce((sum, inv) => sum + inv.amount, 0);
```

---

## Migration Path

### For Existing Systems

1. **Backfill currency fields**
   ```sql
   UPDATE journal_entry_lines
   SET transaction_currency = 'USD',
       exchange_rate = 1.0,
       base_currency_amount = CASE WHEN debit > 0 THEN debit ELSE credit END
   WHERE base_currency_amount IS NULL;
   ```

2. **Backfill posting_date**
   ```sql
   UPDATE journal_entries
   SET posting_date = entry_date
   WHERE posting_date IS NULL;
   ```

3. **Create missing journal entries**
   - Identify posted invoices/bills without journals
   - Create corresponding journal entries
   - Link via `reference_type` and `reference_id`

4. **Update UI components**
   - Replace direct table queries with canonical view hooks
   - Add FinancialIntegrityBadge to dashboards
   - Add AccountingFilters for date/mode control

5. **Run initial reconciliation**
   ```sql
   SELECT * FROM run_full_reconciliation(organization_id);
   ```

---

## Security Considerations

### Row-Level Security (RLS)

All views and tables enforce organization isolation:

```sql
CREATE POLICY "org_isolation" ON journal_entries
USING (organization_id = current_setting('app.current_org')::uuid);
```

### Audit Trail

All financial operations are logged in `audit_logs`:
- Who made the change
- What changed (old/new values)
- When it happened
- Action type (INSERT, UPDATE, DELETE, POST, REVERSE)

---

## Performance Optimization

### Indexes

Critical indexes for view performance:

```sql
CREATE INDEX idx_journal_entries_posted_not_reversed 
  ON journal_entries(posted, reversed, deleted_at);

CREATE INDEX idx_journal_entry_lines_account_base_amount 
  ON journal_entry_lines(account_id, base_currency_amount);

CREATE INDEX idx_journal_entries_posting_date 
  ON journal_entries(posting_date DESC);
```

### Query Optimization

- Views use covering indexes
- Filtered indexes for common WHERE clauses
- Composite indexes for join operations

---

## Support & Maintenance

### Daily Operations

1. **Run reconciliation** (automated or manual)
   ```sql
   SELECT * FROM run_full_reconciliation(org_id);
   ```

2. **Review alerts**
   ```sql
   SELECT * FROM financial_integrity_alerts 
   WHERE resolved_at IS NULL 
   ORDER BY severity DESC, detected_at DESC;
   ```

3. **Monitor performance**
   - Check view query times
   - Review slow query logs
   - Analyze index usage

### Troubleshooting

**Problem: Dashboard shows different revenue than P&L**
- Check if using canonical view hooks
- Verify date range filters match
- Run reconciliation to identify discrepancy

**Problem: Cannot post invoice**
- Verify journal entry exists and is posted
- Check fiscal period is not locked
- Ensure user has proper permissions

**Problem: Reconciliation shows variance**
- Review unresolved integrity alerts
- Check for orphaned documents
- Verify manual journal entries are balanced

---

## Conclusion

This financial integrity system ensures:
- **Mathematical consistency** across all modules
- **Audit compliance** through immutable records
- **Multi-currency support** with base currency normalization
- **Real-time reconciliation** with automated alerts
- **Performance** through optimized views and indexes

By following these principles and using the provided tools, your financial data will remain accurate, consistent, and trustworthy across the entire application.
