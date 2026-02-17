# CFO FINANCE ENGINE - QUICK REFERENCE GUIDE

## 🚀 Quick Start

### For Users
1. **Navigate to Sales** → Create invoices, view receivables
2. **Navigate to Purchases** → Create bills, manage vendors
3. **Navigate to CFO Dashboard** → View cash position, AR/AP aging, budgets

### For Developers
```bash
# Run migrations locally
npm run supabase:migrate

# Test locally
npm run dev

# Deploy to staging
git push origin copilot/upgrade-financial-module
```

---

## 📊 Key Features

### 1. Journal Entries (General Ledger)
**What:** Double-entry accounting system  
**Why:** Ensures books always balance  
**How:**
```sql
-- Create journal entry
INSERT INTO journal_entries (user_id, entry_number, entry_date, description)
VALUES (auth.uid(), generate_entry_number(auth.uid()), CURRENT_DATE, 'Opening balance');

-- Add lines (must balance)
INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit)
VALUES 
  (entry_id, cash_account, 10000, 0),      -- Debit cash
  (entry_id, equity_account, 0, 10000);    -- Credit equity

-- Post entry (makes it immutable)
SELECT post_journal_entry(entry_id);
```

### 2. Vendors & Bills (Accounts Payable)
**What:** Track what you owe to vendors  
**Why:** Manage cash outflows, vendor relationships  
**How:**
```sql
-- Create vendor
INSERT INTO vendors (user_id, vendor_code, vendor_name)
VALUES (auth.uid(), 'VEN-00001', 'ABC Supplies');

-- Create bill
INSERT INTO bills (user_id, bill_number, vendor_id, amount, due_date)
VALUES (auth.uid(), 'BILL-2026-0001', vendor_id, 5000, '2026-03-15');

-- Create bill with automatic journal entry
SELECT create_bill_with_journal(bill_id, ap_account_id);
```

### 3. Payment Allocations
**What:** Link payments to specific invoices/bills  
**Why:** Track which invoices are paid, partial payments  
**How:**
```sql
-- Allocate payment to invoice
SELECT allocate_payment_to_invoice(
  payment_id,        -- bank transaction
  invoice_id,        -- invoice to pay
  1000.00,          -- amount
  ar_account_id,    -- AR account
  cash_account_id   -- Cash account
);
```

### 4. Budgets & Variance
**What:** Plan vs actual tracking  
**Why:** Control spending, identify overruns  
**How:**
```sql
-- Create budget
INSERT INTO budgets (user_id, budget_name, fiscal_year)
VALUES (auth.uid(), '2026 Operating Budget', 2026);

-- Add budget line
INSERT INTO budget_lines (budget_id, account_id, period, budgeted_amount)
VALUES (budget_id, marketing_account, 1, 5000); -- January

-- Update actuals from journal entries
SELECT update_budget_actuals(budget_id);

-- Get variance report
SELECT * FROM get_budget_variance_report(budget_id);
```

### 5. Cost Centers
**What:** Departmental profitability tracking  
**Why:** See which departments are profitable  
**How:**
```sql
-- Create cost center
INSERT INTO cost_centers (user_id, cost_center_code, cost_center_name)
VALUES (auth.uid(), 'CC-SALES', 'Sales Department');

-- Assign to journal entry line
INSERT INTO journal_entry_lines (entry_id, account_id, cost_center_id, debit)
VALUES (entry_id, salary_account, sales_dept_id, 10000);

-- Get profitability report
SELECT * FROM get_cost_center_profitability(auth.uid(), '2026-01-01', '2026-12-31');
```

### 6. AR/AP Aging
**What:** Track overdue invoices and bills  
**Why:** Improve collections, manage payables  
**How:**
```sql
-- Calculate AR aging
SELECT * FROM calculate_ar_aging(auth.uid());

-- Calculate AP aging
SELECT * FROM calculate_ap_aging(auth.uid());

-- View aging snapshot
SELECT * FROM ar_aging_snapshots 
WHERE user_id = auth.uid() 
ORDER BY snapshot_date DESC LIMIT 1;
```

### 7. Cash Projections
**What:** Forecast cash position 30/60/90 days out  
**Why:** Avoid cash crunches, plan spending  
**How:**
```sql
-- Project 30 days
SELECT * FROM project_cash_flow(auth.uid(), 30);

-- Project 90 days
SELECT * FROM project_cash_flow(auth.uid(), 90);

-- Get cash runway (days until zero)
SELECT * FROM get_cash_runway(auth.uid());
```

### 8. Audit Trail
**What:** Complete history of all changes  
**Why:** Compliance, fraud detection, debugging  
**How:**
```sql
-- View audit trail for specific record
SELECT * FROM get_audit_trail('invoices', invoice_id);

-- View user activity
SELECT * FROM get_user_activity_summary(auth.uid());

-- Detect suspicious activity
SELECT * FROM detect_suspicious_activity(24); -- Last 24 hours
```

---

## 🔧 Common Operations

### Month-End Close
```sql
-- 1. Update budget actuals
SELECT update_budget_actuals(budget_id);

-- 2. Calculate AR/AP aging
SELECT calculate_ar_aging(auth.uid());
SELECT calculate_ap_aging(auth.uid());

-- 3. Take cash snapshot
SELECT calculate_cash_position(auth.uid());

-- 4. Close fiscal period
SELECT close_fiscal_period(period_id);
```

### Reverse a Mistake
```sql
-- Never delete posted entries - reverse them instead
SELECT reverse_journal_entry(
  entry_id, 
  CURRENT_DATE, 
  'Correction: wrong account used'
);
```

### Generate Financial Reports
```sql
-- P&L Statement (from journal entries)
SELECT 
  coa.account_name,
  SUM(jel.credit - jel.debit) as revenue
FROM journal_entry_lines jel
JOIN chart_of_accounts coa ON coa.id = jel.account_id
JOIN journal_entries je ON je.id = jel.entry_id
WHERE je.posted = true
  AND coa.account_type = 'revenue'
  AND je.entry_date BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY coa.account_name;
```

---

## 🛡️ Security Best Practices

### Row Level Security (RLS)
All tables use RLS to ensure users only see their own data:
```sql
-- Users automatically see only their records
SELECT * FROM journal_entries; -- Automatically filtered by user_id

-- Multi-org support (when enabled)
SELECT * FROM journal_entries; -- Filtered by organization membership
```

### Immutability
```sql
-- Posted entries cannot be modified
UPDATE journal_entries SET description = 'Changed'; -- ❌ ERROR if posted = true

-- Must reverse instead
SELECT reverse_journal_entry(entry_id, CURRENT_DATE, 'Reason'); -- ✅ Correct
```

### Fiscal Period Locking
```sql
-- Closed periods cannot be modified
INSERT INTO journal_entries (entry_date, ...) VALUES ('2025-12-15', ...); 
-- ❌ ERROR if December 2025 is closed

-- Must reopen period first (admin only)
SELECT reopen_fiscal_period(period_id); -- Then insert
```

---

## 📈 Performance Tips

### Use Indexes
All critical queries have indexes:
```sql
-- Fast: Uses idx_journal_entries_user_date
SELECT * FROM journal_entries 
WHERE user_id = auth.uid() 
ORDER BY entry_date DESC;

-- Fast: Uses idx_budget_lines_variance
SELECT * FROM budget_lines 
WHERE budget_id = ? 
ORDER BY variance_percent DESC;
```

### Batch Operations
```sql
-- Good: Single transaction
BEGIN;
INSERT INTO journal_entries (...) RETURNING id INTO entry_id;
INSERT INTO journal_entry_lines (entry_id, ...) VALUES (entry_id, ...);
INSERT INTO journal_entry_lines (entry_id, ...) VALUES (entry_id, ...);
COMMIT;

-- Bad: Multiple round trips
-- (Don't do this)
```

### Scheduled Jobs
Run these daily/weekly:
```sql
-- Daily (via cron or app scheduler)
SELECT calculate_ar_aging(user_id) FROM auth.users;
SELECT calculate_ap_aging(user_id) FROM auth.users;
SELECT calculate_cash_position(user_id) FROM auth.users;

-- Weekly
SELECT update_budget_actuals(budget_id) FROM budgets WHERE status = 'active';
```

---

## 🚨 Troubleshooting

### Journal Entry Won't Post
```
ERROR: Journal entry out of balance: Debits=10000 Credits=9500
```
**Solution:** Add missing $500 to balance debits and credits.

### Can't Modify Invoice
```
ERROR: Cannot modify posted journal entry
```
**Solution:** Don't modify directly. Create credit note or reversal.

### RLS Access Denied
```
ERROR: new row violates row-level security policy
```
**Solution:** Ensure `user_id = auth.uid()` or user is in organization.

### Slow Query
```
Query took 5 seconds
```
**Solution:** Check if index exists. Run `EXPLAIN ANALYZE`.

---

## 📞 Support

### Documentation
- **Technical Design:** `CFO_FINANCE_ENGINE_DESIGN.md`
- **Implementation Roadmap:** `IMPLEMENTATION_ROADMAP.md`
- **This Guide:** `QUICK_REFERENCE_GUIDE.md`

### Get Help
- **Issues:** Create GitHub issue with `[Finance]` prefix
- **Questions:** Ask in team Slack #finance-module
- **Bugs:** Include error message, SQL query, and expected behavior

---

## 🎯 Key Metrics

Track these to measure success:
- **Accounting Accuracy:** Debits = Credits (always 100%)
- **Month-End Close Time:** < 2 days (target)
- **Invoice Collection Time:** DSO < 45 days (target)
- **Budget Variance:** < 10% overrun (target)
- **Cash Runway:** > 90 days (target)

---

**Version:** 1.0  
**Last Updated:** February 17, 2026  
**Maintainer:** GitHub Copilot
