# Comprehensive QA Test Plan - Supabase ERP System

## 🎯 Test Objectives

1. **Development Environment**: Verify complete seed data loads correctly
2. **Production Environment**: Verify database remains clean
3. **MS 365 Auth**: Verify production users get clean slate
4. **Data Integrity**: Verify all seed data is valid and consistent
5. **Protection Guards**: Verify production cannot be accidentally seeded

---

## 📋 Test Suite

### Phase 1: Development Environment Tests

#### Test 1.1: Database Reset with Full Seed
**Command**:
```bash
supabase db reset
```

**Expected Results**:
- ✅ All 49 migrations execute successfully
- ✅ seed_new.sql executes (production guard passes for dev)
- ✅ seed_hr.sql loads 50 employees
- ✅ seed_finance.sql loads 3 years data
- ✅ No errors in console output

**Validation**:
```bash
psql <dev-connection> -f supabase/validate_seed.sql
psql <dev-connection> -f supabase/validate_finance.sql
```

**Success Criteria**:
- Employee count = 50
- CEO exists (1 person with no manager)
- No circular reporting hierarchy
- Payroll records >= 600 (50 employees × 12 months)
- Attendance records >= 18,250 (50 employees × 365 days)
- Journal entries >= 1,000
- All journal entries balanced (debit = credit)

---

#### Test 1.2: HR Data Integrity
**Commands**:
```sql
-- Test: Exactly 50 employees
SELECT COUNT(*) FROM profiles WHERE is_deleted = FALSE;
-- Expected: 50

-- Test: CEO exists
SELECT full_name, job_title FROM profiles WHERE manager_id IS NULL;
-- Expected: 1 row (Sarah Johnson, CEO)

-- Test: No circular hierarchy
WITH RECURSIVE hierarchy AS (
    SELECT id, manager_id, ARRAY[id] as path
    FROM profiles
    WHERE manager_id IS NOT NULL
    UNION ALL
    SELECT h.id, p.manager_id, h.path || p.id
    FROM hierarchy h
    JOIN profiles p ON h.manager_id = p.id
    WHERE p.id = ANY(h.path) = FALSE
)
SELECT COUNT(*) FROM hierarchy WHERE id = ANY(path[2:]);
-- Expected: 0 (no cycles)

-- Test: All employees except CEO have managers
SELECT COUNT(*) FROM profiles 
WHERE manager_id IS NULL 
  AND job_title NOT ILIKE '%CEO%';
-- Expected: 0

-- Test: Salary structures exist
SELECT COUNT(*) FROM profiles p
LEFT JOIN salary_structures ss ON ss.profile_id = p.id AND ss.is_current = TRUE
WHERE ss.id IS NULL;
-- Expected: 0

-- Test: Department distribution
SELECT department, COUNT(*) 
FROM profiles 
GROUP BY department 
ORDER BY COUNT(*) DESC;
-- Expected: Finance, Technology, Sales, Operations, HR, Executive

-- Test: Payroll coverage
SELECT COUNT(DISTINCT profile_id) FROM payroll_records;
-- Expected: ~50

-- Test: Attendance coverage
SELECT 
    COUNT(*) as total_records,
    COUNT(DISTINCT profile_id) as unique_employees,
    AVG(day_count) as avg_days_per_employee
FROM (
    SELECT profile_id, COUNT(*) as day_count
    FROM attendance_records
    GROUP BY profile_id
) sub;
-- Expected: ~18,250 total, 50 employees, ~365 days average
```

**Success Criteria**:
- ✅ All queries return expected values
- ✅ No NULL values where not expected
- ✅ No FK violations
- ✅ Realistic data distribution

---

#### Test 1.3: Finance Data Integrity
**Commands**:
```sql
-- Test: Chart of accounts
SELECT COUNT(*) FROM chart_of_accounts;
-- Expected: >= 40

-- Test: Account types
SELECT account_type, COUNT(*) 
FROM chart_of_accounts 
GROUP BY account_type;
-- Expected: asset, liability, equity, revenue, expense

-- Test: Journal entries period
SELECT 
    COUNT(*) as total_entries,
    MIN(entry_date) as oldest,
    MAX(entry_date) as newest,
    COUNT(DISTINCT date_trunc('month', entry_date)) as months
FROM journal_entries;
-- Expected: >= 1000 entries, >= 36 months

-- Test: CRITICAL - All journals balanced
SELECT COUNT(*) FROM journal_entries
WHERE ABS(total_debit - total_credit) > 0.01;
-- Expected: 0 (all balanced)

-- Test: Ledger entries balanced per journal
SELECT 
    journal_entry_id,
    SUM(debit) as total_debit,
    SUM(credit) as total_credit,
    ABS(SUM(debit) - SUM(credit)) as difference
FROM ledger_entries
GROUP BY journal_entry_id
HAVING ABS(SUM(debit) - SUM(credit)) > 0.01;
-- Expected: 0 rows (all balanced)

-- Test: No orphaned ledger entries
SELECT COUNT(*) FROM ledger_entries le
LEFT JOIN journal_entries je ON le.journal_entry_id = je.id
WHERE je.id IS NULL;
-- Expected: 0

-- Test: Valid account codes
SELECT COUNT(*) FROM ledger_entries le
LEFT JOIN chart_of_accounts coa ON le.account_code = coa.code
WHERE coa.code IS NULL;
-- Expected: 0

-- Test: Revenue growth trend
SELECT 
    EXTRACT(YEAR FROM le.entry_date) as year,
    SUM(le.credit) as total_revenue
FROM ledger_entries le
WHERE le.account_code LIKE '4%'
GROUP BY EXTRACT(YEAR FROM le.entry_date)
ORDER BY year;
-- Expected: Revenue increases year over year

-- Test: Invoices
SELECT COUNT(*) FROM invoices;
-- Expected: >= 100

-- Test: Bank accounts
SELECT COUNT(*) FROM bank_accounts;
-- Expected: >= 3

-- Test: Bank transactions
SELECT COUNT(*) FROM bank_transactions;
-- Expected: >= 500
```

**Success Criteria**:
- ✅ All journal entries balanced
- ✅ No orphaned records
- ✅ Valid account codes
- ✅ 36+ months coverage
- ✅ Revenue growth visible

---

### Phase 2: Production Environment Tests

#### Test 2.1: Production Verification (Pre-Deployment)
**Command**:
```bash
psql <prod-connection> -f supabase/verify_production.sql
```

**Expected Results**:
- ✅ Database detected as production
- ✅ Profile count <= 10 (only real users)
- ✅ Payroll records = 0
- ✅ Journal entries = 0
- ✅ Invoices = 0
- ✅ All required tables exist
- ✅ All tables have RLS enabled
- ✅ Critical functions exist

**Success Criteria**:
- No warnings or errors
- "Production database is clean" message displayed

---

#### Test 2.2: Schema-Only Deployment
**Command**:
```bash
supabase db push --linked
```

**Expected Results**:
- ✅ All migrations apply successfully
- ✅ NO seed files executed
- ✅ Schema matches development
- ✅ Zero transactional data

**Validation**:
```sql
-- Verify schema exists
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- Expected: All tables present

-- Verify NO seed data
SELECT COUNT(*) FROM profiles WHERE employee_id LIKE 'EMP%';
-- Expected: 0

SELECT COUNT(*) FROM payroll_records;
-- Expected: 0

SELECT COUNT(*) FROM journal_entries;
-- Expected: 0
```

**Success Criteria**:
- ✅ Schema complete
- ✅ Zero seed data
- ✅ No errors

---

#### Test 2.3: Production Seed Guard
**Command**:
```bash
# Attempt to run seed in production (should fail)
psql <prod-connection> -f supabase/seed_new.sql
```

**Expected Results**:
- ❌ **ERROR**: "Seeding blocked on production database"
- ❌ Seed execution aborts immediately
- ✅ No data inserted

**Validation**:
```sql
SELECT COUNT(*) FROM profiles;
-- Should remain 0 or minimal (only real users)
```

**Success Criteria**:
- ✅ Seed script refuses to run
- ✅ Production remains clean

---

### Phase 3: MS 365 Authentication Tests

#### Test 3.1: Production User Signup via MS 365
**Test Steps**:
1. Navigate to production app: `https://your-app.com`
2. Click "Sign in with Microsoft 365"
3. Authenticate with MS 365 credentials
4. Complete authentication flow

**Expected Results**:
- ✅ User authenticates successfully
- ✅ Profile created in `auth.users`
- ✅ Profile trigger creates record in `profiles` table
- ✅ User sees empty/clean interface (no pre-existing data)

**Database Validation**:
```sql
-- Check auth.users
SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC LIMIT 1;
-- Expected: Your MS 365 user

-- Check profiles
SELECT id, user_id, full_name, email, employee_id 
FROM profiles 
WHERE user_id = (SELECT id FROM auth.users ORDER BY created_at DESC LIMIT 1);
-- Expected: One profile for your user

-- Verify NO seed data visible
SELECT COUNT(*) FROM profiles WHERE employee_id LIKE 'EMP%';
-- Expected: 0 (no seed employees)

-- Verify user can only see own data (RLS)
SELECT COUNT(*) FROM profiles WHERE user_id != auth.uid();
-- Expected: 0 (RLS blocks other profiles)
```

**Success Criteria**:
- ✅ User profile created
- ✅ No seed data visible
- ✅ RLS enforced
- ✅ Clean user experience

---

#### Test 3.2: Multiple Users in Production
**Test Steps**:
1. Have 3-5 different users sign up via MS 365
2. Each user logs in separately

**Expected Results per User**:
- ✅ Each sees only their own profile
- ✅ No pre-existing employees visible
- ✅ No payroll data visible
- ✅ No finance data visible
- ✅ Can create their own data

**Database Validation**:
```sql
-- Check total real users
SELECT COUNT(*) FROM auth.users;
-- Expected: 3-5

-- Check profiles match auth users
SELECT 
    (SELECT COUNT(*) FROM auth.users) as auth_users,
    (SELECT COUNT(*) FROM profiles) as profiles;
-- Expected: Same count

-- Verify NO seed data
SELECT COUNT(*) FROM profiles WHERE employee_id LIKE 'EMP%';
-- Expected: 0
```

**Success Criteria**:
- ✅ Each user isolated
- ✅ No seed data pollution
- ✅ RLS working correctly

---

### Phase 4: Schema Drift Detection

#### Test 4.1: Compare Dev vs Prod Schema
**Commands**:
```bash
# Generate dev schema report
psql <dev-connection> -f supabase/audit_schema.sql > dev_schema.txt

# Generate prod schema report
psql <prod-connection> -f supabase/audit_schema.sql > prod_schema.txt

# Compare (ignore data differences)
diff <(grep -v "row_count\|pg_size_pretty" dev_schema.txt) \
     <(grep -v "row_count\|pg_size_pretty" prod_schema.txt)
```

**Expected Results**:
- ✅ No schema differences
- ✅ Same tables in both
- ✅ Same columns in both
- ✅ Same indexes in both
- ✅ Same constraints in both
- ✅ Only data counts differ

**Success Criteria**:
- No significant schema drift
- Migrations in sync

---

### Phase 5: Rollback and Recovery

#### Test 5.1: Development Reset After Changes
**Test Steps**:
1. Modify some data in development manually
2. Run `supabase db reset`

**Expected Results**:
- ✅ All manual changes wiped
- ✅ Database rebuilt from migrations
- ✅ Seed data reloaded (50 employees + 3 years finance)
- ✅ Consistent state restored

**Success Criteria**:
- Fresh seed data every reset
- Deterministic state

---

#### Test 5.2: Production Rollback (if needed)
**Test Steps**:
1. Create backup before deployment
2. Deploy new migration
3. If issues, rollback

**Commands**:
```bash
# Backup (before deployment)
pg_dump <prod-connection> > backup_before_migration.sql

# If rollback needed
psql <prod-connection> < backup_before_migration.sql
```

**Success Criteria**:
- ✅ Backup restores successfully
- ✅ No data loss

---

## 🎯 QA Execution Checklist

### Pre-Deployment

- [ ] Run development reset: `supabase db reset`
- [ ] Validate HR seed: `validate_seed.sql`
- [ ] Validate finance seed: `validate_finance.sql`
- [ ] All 50 employees loaded
- [ ] All journal entries balanced
- [ ] No FK violations
- [ ] Schema audit clean: `audit_schema.sql`

### Production Deployment

- [ ] Run production verification: `verify_production.sql`
- [ ] Database is clean (no seed data)
- [ ] Schema matches development
- [ ] Backup created
- [ ] Deploy: `supabase db push --linked`
- [ ] Verify schema applied
- [ ] Verify no seed data inserted
- [ ] Test seed guard (should fail)

### Post-Deployment

- [ ] MS 365 login works
- [ ] User profile created correctly
- [ ] No seed data visible to new user
- [ ] RLS enforces isolation
- [ ] Schema drift check passes

### Ongoing Monitoring

- [ ] Monitor profile count (should not jump to 50)
- [ ] Monitor for seed employee_ids (EMP001-EMP050)
- [ ] Monitor transaction volume (should be organic)
- [ ] Weekly schema audit

---

## 🚨 Red Flags to Watch For

### In Production:
❌ **CRITICAL**: Profile count suddenly jumps to 50+
❌ **CRITICAL**: Employees with IDs like "EMP001", "EMP002"
❌ **CRITICAL**: Thousands of journal entries appear overnight
❌ **CRITICAL**: Payroll records exist for employees who didn't sign up
❌ **WARNING**: Schema drift detected
❌ **WARNING**: RLS policies disabled

**If any occur**: Someone ran seed in production! Investigate immediately.

### In Development:
⚠️ **WARNING**: Validation tests fail
⚠️ **WARNING**: Journal entries unbalanced
⚠️ **WARNING**: Circular hierarchy detected
⚠️ **WARNING**: Missing foreign keys

**If any occur**: Fix seed files and re-test.

---

## 📊 Success Metrics

### Development
- ✅ 100% validation pass rate
- ✅ 0 unbalanced journal entries
- ✅ 0 FK violations
- ✅ 50 employees consistently
- ✅ 36 months data consistently

### Production
- ✅ 0 seed data records
- ✅ 100% schema parity with dev
- ✅ 0 schema drift warnings
- ✅ 100% seed guard success rate
- ✅ Only organic user data

---

## 🔄 Test Frequency

- **Pre-deployment**: Every deployment
- **Post-deployment**: Within 1 hour of deployment
- **Weekly**: Schema audit and drift detection
- **Monthly**: Full validation suite
- **Quarterly**: Penetration testing for seed guards

---

## 📝 Test Results Template

```markdown
## Test Execution Report

**Date**: 2026-02-18
**Tester**: [Your Name]
**Environment**: Development / Production

### Test Results

| Test ID | Test Name | Status | Notes |
|---------|-----------|--------|-------|
| 1.1 | DB Reset Full Seed | ✅ PASS | 50 employees loaded |
| 1.2 | HR Data Integrity | ✅ PASS | All validations passed |
| 1.3 | Finance Data Integrity | ✅ PASS | All journals balanced |
| 2.1 | Production Verification | ✅ PASS | Database clean |
| 2.2 | Schema-Only Deployment | ✅ PASS | No seed data |
| 2.3 | Production Seed Guard | ✅ PASS | Blocked correctly |
| 3.1 | MS 365 User Signup | ✅ PASS | Clean user experience |
| 3.2 | Multiple Users | ✅ PASS | RLS enforced |
| 4.1 | Schema Drift | ✅ PASS | No drift detected |

### Issues Found
- None

### Recommendations
- Continue monitoring
- Schedule weekly audits

**Sign-off**: [Name], [Date]
```

---

**Last Updated**: February 18, 2026
**Version**: 1.0
