# CFO FINANCE ENGINE - DEPLOYMENT GUIDE

## 🚀 Quick Deploy (Production Ready)

### Prerequisites
- Supabase project with existing Book Explorer schema
- PostgreSQL 14+ with RLS enabled
- Existing migrations applied (fiscal_periods, base functions)

---

## 📋 PRE-DEPLOYMENT VERIFICATION

### Step 1: Verify Dependencies
```bash
# Connect to your database
psql -h your-db-host -U postgres -d book_explorer

# Run verification script
\i verification/check_dependencies.sql
```

Expected output:
```
✓ update_updated_at_column() exists
✓ is_period_locked() exists
✓ is_admin_or_hr() exists
✓ fiscal_periods table exists
```

If any are missing, see **MIGRATION_DEPENDENCIES.md** for setup instructions.

---

## 🔧 DEPLOYMENT STEPS

### Option A: Manual Deployment (Recommended for First Time)

#### 1. Backup Database
```bash
# Create backup before any changes
pg_dump -h your-db-host -U postgres -d book_explorer > backup_pre_cfo_upgrade_$(date +%Y%m%d).sql
```

#### 2. Deploy Phase 1 (Accounting Integrity Layer)
```bash
# Navigate to migrations directory
cd supabase/migrations

# Deploy in order
psql -h your-db-host -U postgres -d book_explorer -f 20260217103000_phase1_journal_entries.sql
psql -h your-db-host -U postgres -d book_explorer -f 20260217103100_phase1_vendors_bills.sql
psql -h your-db-host -U postgres -d book_explorer -f 20260217103200_phase1_payments_credits.sql
psql -h your-db-host -U postgres -d book_explorer -f 20260217103300_phase1_audit_logging.sql
```

#### 3. Verify Phase 1 Deployment
```sql
-- Check all tables created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'journal_entries', 'journal_entry_lines', 'vendors', 'bills', 
  'bill_items', 'payment_allocations', 'credit_notes', 'audit_logs'
)
ORDER BY table_name;
-- Expected: 8 rows

-- Check RLS enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('journal_entries', 'vendors', 'bills', 'audit_logs')
AND rowsecurity = true;
-- Expected: 4 rows (all with rowsecurity = true)
```

#### 4. Deploy Phase 2 (CFO Intelligence Layer)
```bash
# Continue with Phase 2
psql -h your-db-host -U postgres -d book_explorer -f 20260217103400_phase2_budgets_cost_centers.sql
psql -h your-db-host -U postgres -d book_explorer -f 20260217103500_phase2_cash_working_capital.sql
```

#### 5. Verify Phase 2 Deployment
```sql
-- Check all tables created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'cost_centers', 'budgets', 'budget_lines', 
  'cash_position_snapshots', 'cash_projections',
  'ar_aging_snapshots', 'ap_aging_snapshots', 'working_capital_metrics'
)
ORDER BY table_name;
-- Expected: 8 rows
```

---

### Option B: Automated Deployment (Supabase CLI)

```bash
# Using Supabase CLI (if configured)
supabase db push

# Or if using migrations only
supabase migration up
```

---

## ✅ POST-DEPLOYMENT VERIFICATION

### 1. Test Journal Entry Creation
```sql
-- Create a simple journal entry (as authenticated user)
DO $$
DECLARE
  v_entry_id UUID;
  v_cash_account UUID;
  v_equity_account UUID;
BEGIN
  -- Get account IDs (assuming you have some in chart_of_accounts)
  SELECT id INTO v_cash_account FROM chart_of_accounts 
  WHERE account_type = 'asset' LIMIT 1;
  
  SELECT id INTO v_equity_account FROM chart_of_accounts 
  WHERE account_type = 'equity' LIMIT 1;
  
  -- Create journal entry
  INSERT INTO journal_entries (user_id, entry_number, entry_date, description)
  VALUES (auth.uid(), 'TEST-001', CURRENT_DATE, 'Test entry')
  RETURNING id INTO v_entry_id;
  
  -- Add balanced lines
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit)
  VALUES 
    (v_entry_id, v_cash_account, 1000, 0),
    (v_entry_id, v_equity_account, 0, 1000);
  
  -- Try to post (should succeed)
  PERFORM post_journal_entry(v_entry_id);
  
  RAISE NOTICE '✓ Journal entry creation works!';
END $$;
```

### 2. Test Budget Creation
```sql
-- Create a simple budget
INSERT INTO budgets (user_id, budget_name, fiscal_year, start_date, end_date, status)
VALUES (
  auth.uid(), 
  'Test Budget 2026', 
  2026, 
  '2026-01-01', 
  '2026-12-31', 
  'draft'
);

-- Verify
SELECT * FROM budgets WHERE budget_name = 'Test Budget 2026';
```

### 3. Test AR Aging Calculation
```sql
-- Calculate AR aging (should not error even with no data)
SELECT * FROM calculate_ar_aging(auth.uid());

-- Verify snapshot created
SELECT * FROM ar_aging_snapshots 
WHERE user_id = auth.uid() 
ORDER BY snapshot_date DESC LIMIT 1;
```

### 4. Test Audit Logging
```sql
-- Check that audit triggers are working
SELECT COUNT(*) as audit_count FROM audit_logs;
-- Should show audit entries from above tests
```

---

## 🔄 ROLLBACK PROCEDURE (If Needed)

### Phase 2 Rollback
```bash
psql -h your-db-host -U postgres -d book_explorer -f rollback/phase2_rollback.sql
```

### Phase 1 Rollback
```bash
psql -h your-db-host -U postgres -d book_explorer -f rollback/phase1_rollback.sql
```

### Full Rollback + Restore from Backup
```bash
# Drop database and restore
dropdb book_explorer
createdb book_explorer
psql -h your-db-host -U postgres -d book_explorer < backup_pre_cfo_upgrade_YYYYMMDD.sql
```

---

## 📊 PERFORMANCE MONITORING

### 1. Check Index Usage
```sql
-- Verify indexes were created
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('journal_entries', 'budget_lines', 'ar_aging_snapshots')
ORDER BY tablename, indexname;
```

### 2. Monitor Query Performance
```sql
-- Enable query stats (if not already enabled)
-- Add to postgresql.conf: shared_preload_libraries = 'pg_stat_statements'

-- View slow queries
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query ILIKE '%journal_entries%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## 🔐 SECURITY VERIFICATION

### 1. Verify RLS Policies
```sql
-- Check that RLS is enabled on all financial tables
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'journal_entries', 'vendors', 'bills', 'budgets',
    'cash_position_snapshots', 'ar_aging_snapshots'
  )
ORDER BY tablename;
-- All should have rowsecurity = true
```

### 2. Test RLS Isolation
```sql
-- As user A: create journal entry
-- As user B: try to view user A's entries
SELECT * FROM journal_entries WHERE user_id != auth.uid();
-- Should return 0 rows
```

---

## 📈 SCHEDULED JOBS (Recommended)

Set up these scheduled jobs for optimal performance:

### Daily Jobs (Run at 2 AM)
```sql
-- Update AR/AP aging for all users
SELECT calculate_ar_aging(user_id) FROM auth.users;
SELECT calculate_ap_aging(user_id) FROM auth.users;

-- Take cash position snapshots
SELECT calculate_cash_position(user_id) FROM auth.users;

-- Update cash projections
SELECT project_cash_flow(user_id, 30) FROM auth.users;
SELECT project_cash_flow(user_id, 60) FROM auth.users;
SELECT project_cash_flow(user_id, 90) FROM auth.users;
```

### Weekly Jobs (Run on Sundays)
```sql
-- Update budget actuals from journal entries
SELECT update_budget_actuals(id) FROM budgets WHERE status = 'active';
```

### Using pg_cron (if available):
```sql
-- Install pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily AR aging
SELECT cron.schedule(
  'daily-ar-aging',
  '0 2 * * *', -- 2 AM daily
  $$SELECT calculate_ar_aging(user_id) FROM auth.users$$
);

-- Schedule weekly budget updates
SELECT cron.schedule(
  'weekly-budget-update',
  '0 2 * * 0', -- 2 AM Sundays
  $$SELECT update_budget_actuals(id) FROM budgets WHERE status = 'active'$$
);
```

---

## 🎯 NEXT STEPS AFTER DEPLOYMENT

### 1. Build API Layer
Create REST API endpoints for:
- Journal entries (CRUD + post + reverse)
- Vendors (CRUD)
- Bills (CRUD + approve)
- Payment allocations
- Budget management
- Dashboard metrics

### 2. Create UI Components
- Journal entry form
- Vendor management screen
- Bill creation wizard
- CFO Dashboard
- AR/AP aging reports

### 3. User Training
- Create training videos
- Write user documentation
- Conduct training sessions
- Gather feedback

### 4. Gradual Rollout
- Start with internal team (week 1)
- Expand to power users (week 2-3)
- Full rollout (week 4+)

---

## 🆘 SUPPORT

### Troubleshooting
1. Check **MIGRATION_DEPENDENCIES.md** for missing dependencies
2. Review error logs: `tail -f /var/log/postgresql/postgresql.log`
3. Verify RLS policies: All policies should have `USING` and `WITH CHECK` clauses

### Getting Help
- **Documentation:** See CFO_FINANCE_ENGINE_DESIGN.md
- **Quick Reference:** See QUICK_REFERENCE_GUIDE.md
- **GitHub Issues:** Create issue with `[Finance]` prefix
- **Slack:** #finance-module channel

---

## ✅ DEPLOYMENT CHECKLIST

- [ ] Backup database created
- [ ] Dependencies verified (update_updated_at_column, is_period_locked, is_admin_or_hr)
- [ ] Phase 1 migrations deployed successfully
- [ ] Phase 1 verification tests passed
- [ ] Phase 2 migrations deployed successfully
- [ ] Phase 2 verification tests passed
- [ ] RLS policies verified
- [ ] Performance indexes verified
- [ ] Test journal entry created and posted
- [ ] Test budget created
- [ ] AR aging calculation tested
- [ ] Audit logging verified
- [ ] Scheduled jobs configured (optional)
- [ ] Rollback procedure tested (on staging)
- [ ] Team notified of deployment
- [ ] Monitoring dashboards updated

---

**Status:** Ready for Production Deployment  
**Version:** 1.0  
**Last Updated:** February 17, 2026
