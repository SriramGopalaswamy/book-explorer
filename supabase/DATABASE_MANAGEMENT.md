# Supabase ERP - Database Management Guide

## 🎯 Overview

This repository manages a Supabase-based ERP system with **strict separation** between development and production environments:

- **Development**: Full schema + 50 employees + 3 years financial data
- **Production**: Clean schema only, no seed data

## 📁 Directory Structure

```
supabase/
├── migrations/           # Schema migrations (49 files)
│   ├── 20260206074051_*.sql
│   ├── 20260206075203_*.sql
│   └── ... (all schema changes)
├── seed_hr.sql          # HR seed: 50 employees, org structure
├── seed_finance.sql     # Finance seed: 3 years transactional data
├── seed_new.sql         # Master seed orchestrator (PRODUCTION-SAFE)
├── validate_seed.sql    # HR data validation tests
├── validate_finance.sql # Finance data validation tests
├── verify_production.sql # Production deployment verification
├── audit_schema.sql     # Comprehensive schema audit tool
└── config.toml          # Supabase configuration
```

## 🚀 Quick Start

### Development Environment

```bash
# Reset development database (destroys and rebuilds)
supabase db reset

# This will:
# 1. Drop all tables and data
# 2. Run all migrations from migrations/
# 3. Run seed_new.sql (which loads HR + Finance seed data)
# 4. Result: 50 employees + 3 years financial data
```

### Production Environment

```bash
# Deploy schema changes to production (NO DATA)
supabase db push --linked

# This will:
# 1. Apply only schema migrations
# 2. NOT run any seed files
# 3. Result: Clean schema, zero transactional data
```

## 🔒 Production Safety Guards

### Guard #1: Database Name Check

The seed script (`seed_new.sql`) checks the database name:

```sql
IF current_database() ILIKE '%prod%' OR 
   current_database() ILIKE '%production%' THEN
    RAISE EXCEPTION 'Seeding blocked on production database';
END IF;
```

### Guard #2: Environment Variable Check

```sql
IF current_setting('app.seed_allowed', true) = 'false' THEN
    RAISE EXCEPTION 'Seeding disabled via configuration';
END IF;
```

### Guard #3: Manual Verification

Before production deployment, run:

```bash
psql <production-connection-string> -f supabase/verify_production.sql
```

This verifies:
- ✅ Database is clean (no transactional data)
- ✅ Schema tables exist
- ✅ RLS policies enabled
- ✅ Critical functions exist

## 📊 Seed Data Details

### HR Module (seed_hr.sql)

**50 Employees**:
- 1 CEO (Sarah Johnson)
- 4 CXOs (CFO, CTO, CHRO, COO)
- 5 Department Heads
- 10 Managers
- 30 Employees

**Departments**:
- Executive (1)
- Finance (8)
- Technology (10)
- Sales (8)
- Operations (8)
- Human Resources (7)

**Data Generated**:
- Salary structures (realistic bands: ₹6L - ₹36L annually)
- 365 days attendance records per employee
- 12 months payroll history
- Leave balances (casual, earned, sick)
- Leave requests
- Proper manager hierarchy (no circular references)

### Finance Module (seed_finance.sql)

**3 Years of Data** (36 months):
- Chart of Accounts (40+ accounts)
- ~5,000+ journal entries
- Ledger entries (all balanced: debit = credit)
- Customer invoices (10-25 per month)
- Bank accounts (5 accounts)
- Bank transactions (20-50 per month)
- Revenue growth trend (10% YoY)
- Monthly expenses (rent, utilities, marketing, payroll)

**Account Types**:
- Assets (cash, receivables, inventory, fixed assets)
- Liabilities (payables, accruals, loans)
- Equity (share capital, retained earnings)
- Revenue (product sales, service revenue)
- Expenses (COGS, operating expenses, taxes)

## ✅ Validation Scripts

### Validate HR Seed

```bash
psql <dev-connection-string> -f supabase/validate_seed.sql
```

**Tests**:
1. ✅ Exactly 50 employees
2. ✅ One CEO (no manager)
3. ✅ No circular reporting hierarchy
4. ✅ All employees have managers (except CEO)
5. ✅ All employees have salary structures
6. ✅ 12 months payroll records
7. ✅ 365 days attendance records
8. ✅ Leave balances exist
9. ✅ No foreign key violations
10. ✅ Department distribution
11. ✅ Salary bands realistic

### Validate Finance Seed

```bash
psql <dev-connection-string> -f supabase/validate_finance.sql
```

**Critical Tests**:
1. ✅ Chart of accounts (30+ accounts)
2. ✅ 36 months coverage
3. ✅ **All journal entries balanced** (debit = credit)
4. ✅ All ledger entries balanced per journal
5. ✅ No orphaned ledger entries
6. ✅ Valid account codes
7. ✅ Invoices exist (100+ invoices)
8. ✅ Bank accounts and transactions
9. ✅ Monthly transaction distribution
10. ✅ Revenue growth trend (YoY)

**Critical Query** (must return 0 rows):
```sql
SELECT journal_entry_id, SUM(debit) - SUM(credit) as difference
FROM ledger_entries
GROUP BY journal_entry_id
HAVING ABS(SUM(debit) - SUM(credit)) > 0.01;
```

## 🔍 Schema Audit

Run comprehensive schema audit:

```bash
psql <connection-string> -f supabase/audit_schema.sql > schema_report.txt
```

**Outputs**:
- All tables with columns and data types
- Foreign key relationships
- Indexes (with performance recommendations)
- Unique and check constraints
- Triggers
- RLS policies
- Functions and RPCs
- Extensions
- Table sizes and row counts
- Missing indexes on foreign keys

**Compare dev vs prod**:
```bash
# Generate dev report
psql <dev-connection> -f supabase/audit_schema.sql > dev_schema.txt

# Generate prod report  
psql <prod-connection> -f supabase/audit_schema.sql > prod_schema.txt

# Compare
diff dev_schema.txt prod_schema.txt
```

## 🚨 CI/CD Guards

### GitHub Actions Example

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      # Verify no seed files in production deployment
      - name: Check for seed files
        run: |
          if grep -r "seed_hr.sql\|seed_finance.sql" .github/workflows/; then
            echo "❌ Seed files detected in production workflow"
            exit 1
          fi
          echo "✅ No seed files in deployment"
      
      # Verify connected to production
      - name: Verify production database
        env:
          SUPABASE_DB_URL: ${{ secrets.PROD_DB_URL }}
        run: |
          # Check database name contains 'prod'
          DB_NAME=$(echo $SUPABASE_DB_URL | grep -o 'prod')
          if [ -z "$DB_NAME" ]; then
            echo "❌ Not connected to production database"
            exit 1
          fi
          echo "✅ Connected to production database"
      
      # Run production verification
      - name: Verify clean state
        env:
          SUPABASE_DB_URL: ${{ secrets.PROD_DB_URL }}
        run: |
          psql $SUPABASE_DB_URL -f supabase/verify_production.sql
      
      # Deploy schema only
      - name: Deploy schema
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
        run: |
          npx supabase db push --linked --password ${{ secrets.PROD_DB_PASSWORD }}
```

### Pre-deployment Checklist

- [ ] Running `supabase db push` (NOT `db reset`)
- [ ] Connected to production project
- [ ] Verified with `verify_production.sql`
- [ ] No seed files referenced
- [ ] Migrations reviewed and tested in dev
- [ ] Schema audit completed
- [ ] Backup created

## 📝 Migration Workflow

### Creating New Migrations

```bash
# Create a new migration
supabase migration new add_feature_name

# Edit the generated file in supabase/migrations/
# Example: supabase/migrations/20240218_add_feature_name.sql
```

**Migration File Structure**:
```sql
-- Add new table
CREATE TABLE new_feature (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE new_feature ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Users view own" ON new_feature
    FOR SELECT USING (auth.uid() = user_id);

-- Add indexes
CREATE INDEX idx_new_feature_name ON new_feature(name);
```

### Testing Migrations

```bash
# Test in development
supabase db reset  # Rebuilds with all migrations

# Verify schema
psql <dev-connection> -f supabase/audit_schema.sql

# Run validations
psql <dev-connection> -f supabase/validate_seed.sql
```

### Deploying Migrations

```bash
# Push to production (schema only)
supabase db push --linked
```

## 🔐 Security Best Practices

1. **Never run `supabase db reset` in production**
   - This would destroy all data
   - Only use `supabase db push`

2. **Always verify before deployment**
   ```bash
   psql $PROD_URL -f supabase/verify_production.sql
   ```

3. **Use environment-specific connection strings**
   - Dev: `SUPABASE_DEV_URL`
   - Prod: `SUPABASE_PROD_URL`

4. **Enable production configuration**
   ```sql
   -- Set in production database
   ALTER DATABASE postgres SET app.seed_allowed = 'false';
   ```

5. **Monitor for unexpected data**
   ```sql
   -- Should return 0-10 in fresh production
   SELECT COUNT(*) FROM profiles;
   
   -- Should return 0 in fresh production
   SELECT COUNT(*) FROM payroll_records;
   ```

## 🎓 Common Scenarios

### Scenario 1: New Developer Onboarding

```bash
# Clone repo
git clone <repo-url>
cd book-explorer

# Install Supabase CLI
npm install -g supabase

# Link to dev project
supabase link --project-ref <dev-project-ref>

# Reset database (loads all seed data)
supabase db reset

# Verify
psql <dev-connection> -f supabase/validate_seed.sql
```

**Result**: Development database with 50 employees + 3 years financial data

### Scenario 2: Production Deployment

```bash
# Link to production project
supabase link --project-ref <prod-project-ref>

# Verify clean state
psql <prod-connection> -f supabase/verify_production.sql

# Deploy schema only
supabase db push --linked

# Verify schema applied
psql <prod-connection> -f supabase/audit_schema.sql
```

**Result**: Production database with clean schema, no transactional data

### Scenario 3: MS 365 User Signs Up (Production)

When a user signs up via MS 365 Auth in production:

1. **Auth Flow**: User authenticates via MS 365
2. **Profile Creation**: Trigger creates profile in `profiles` table
3. **Clean Data**: Only that one user's profile exists
4. **No Seed Data**: No pre-existing employees, payroll, or finance data
5. **RLS Protection**: User can only see their own data

**Verification**:
```sql
-- Check that only real users exist (not seed data)
SELECT COUNT(*) FROM profiles;
-- Should return number of actual signups (1-10 typically)

-- Verify no bulk seed data
SELECT employee_id, full_name FROM profiles ORDER BY created_at;
-- Should NOT show "Employee 1 Finance", "Manager 2 Technology", etc.
```

### Scenario 4: Adding New Table with Seed

1. Create migration:
   ```bash
   supabase migration new add_projects_table
   ```

2. Add table in migration file:
   ```sql
   CREATE TABLE projects (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name TEXT NOT NULL,
       owner_id UUID REFERENCES profiles(id),
       created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. Update seed file (seed_hr.sql or seed_finance.sql):
   ```sql
   -- Add at end of seed_hr.sql
   INSERT INTO projects (name, owner_id)
   SELECT 
       'Project ' || generate_series(1, 20),
       p.id
   FROM profiles p
   WHERE p.job_title ILIKE '%Manager%'
   LIMIT 20;
   ```

4. Test in dev:
   ```bash
   supabase db reset
   # Verify new data exists
   psql <dev> -c "SELECT COUNT(*) FROM projects"
   ```

5. Deploy to production:
   ```bash
   supabase db push --linked
   # Schema created, no data seeded
   psql <prod> -c "SELECT COUNT(*) FROM projects"
   # Should return 0
   ```

## 📊 Performance Monitoring

### Check Missing Indexes on Foreign Keys

```sql
SELECT
    tc.table_name,
    kcu.column_name,
    CASE 
        WHEN idx.indexname IS NULL THEN '❌ MISSING INDEX'
        ELSE '✅ INDEXED'
    END as index_status
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
LEFT JOIN pg_indexes idx
    ON idx.tablename = tc.table_name
    AND idx.indexdef LIKE '%' || kcu.column_name || '%'
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;
```

### Identify Slow Queries

```sql
SELECT
    schemaname,
    tablename,
    seq_scan as sequential_scans,
    seq_tup_read as rows_read_sequentially,
    idx_scan as index_scans,
    idx_tup_fetch as rows_fetched_via_index
FROM pg_stat_user_tables
WHERE seq_scan > 1000
ORDER BY seq_scan DESC;
```

## 🆘 Troubleshooting

### Problem: Seed data appearing in production

**Diagnosis**:
```sql
-- Check for seed data indicators
SELECT COUNT(*) FROM profiles WHERE employee_id LIKE 'EMP%';
-- Should return 0 in production
```

**Solution**:
```bash
# DO NOT run db reset in production!
# Instead, manually clean:
DELETE FROM payroll_records;
DELETE FROM attendance_records;
DELETE FROM salary_structures;
DELETE FROM profiles WHERE employee_id LIKE 'EMP%';
```

**Prevention**:
- Always use `supabase db push` for production
- Never run `supabase db reset` in production
- Set `app.seed_allowed = false` in production

### Problem: Migration fails in production

**Diagnosis**:
```bash
# Check migration status
supabase migration list

# Check for schema drift
psql <prod> -f supabase/audit_schema.sql > prod_current.txt
diff prod_expected.txt prod_current.txt
```

**Solution**:
```bash
# If safe, repair migration:
supabase db push --linked

# If conflicts, may need to manually fix
psql <prod> -c "ALTER TABLE ..."
```

### Problem: Validation fails after seed

**Diagnosis**:
```bash
psql <dev> -f supabase/validate_seed.sql | grep "FAIL"
```

**Solution**:
- Fix the seed file
- Re-run: `supabase db reset`
- Verify again

## 📞 Support

For issues or questions:
1. Check this README
2. Run validation scripts
3. Review audit reports
4. Check migration history
5. Contact: DevOps team

---

**Last Updated**: February 18, 2026
**Version**: 1.0
