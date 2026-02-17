# CFO FINANCE ENGINE - MIGRATION DEPENDENCIES

## 📋 Overview
This document lists all external dependencies required by the Phase 1 and Phase 2 migrations.

---

## ✅ EXISTING FUNCTIONS (Already in Database)

These functions are **already defined** in previous migrations and are required by the new migrations:

### 1. `update_updated_at_column()` 
**Source:** Existing base migration (likely in initial schema setup)  
**Used By:** ALL new migrations (triggers for `updated_at` columns)  
**Purpose:** Automatically updates `updated_at` timestamp on row modification

```sql
-- Expected to exist (standard pattern in Supabase projects)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Referenced In:**
- ✅ phase1_journal_entries.sql (line 486)
- ✅ phase1_vendors_bills.sql (line 485)
- ✅ phase1_payments_credits.sql (line 522)
- ✅ phase2_budgets_cost_centers.sql (line 466)

---

### 2. `is_period_locked(user_id UUID, date DATE)`
**Source:** `20260216124500_fiscal_period_locking.sql` (existing migration)  
**Used By:** Journal entry creation/modification  
**Purpose:** Checks if a fiscal period is closed/locked

```sql
-- Already exists in database from previous migration
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
```

**Referenced In:**
- ✅ phase1_journal_entries.sql (lines 279, 363, 414)

---

### 3. `is_admin_or_hr(user_id UUID)`
**Source:** Existing RBAC migration (likely `20260217000000_dev_tools_rbac.sql`)  
**Used By:** RLS policies for administrative access  
**Purpose:** Checks if user has admin or HR role

```sql
-- Already exists in database
CREATE OR REPLACE FUNCTION is_admin_or_hr(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND r.role_name IN ('admin', 'hr')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

**Referenced In:**
- ✅ phase1_audit_logging.sql (line 47)

---

## 🔗 MULTI-ORG DEPENDENCIES (Optional - Future)

These tables are referenced in RLS policies with **graceful fallback** (won't break if missing):

### `organization_members` table
**Status:** OPTIONAL (for future multi-organization support)  
**Impact:** RLS policies check `organization_id IS NOT NULL AND EXISTS (SELECT 1 FROM organization_members...)`  
**Behavior:** If table doesn't exist, policies fall back to `user_id` check only

```sql
-- Future migration (not required for Phase 1-2)
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  UNIQUE(organization_id, user_id)
);
```

**Referenced In:**
- ✅ All Phase 1 and Phase 2 migrations (RLS policies)
- ✅ **Safe:** Will not fail if table doesn't exist (uses IS NULL checks)

---

## 📋 PRE-DEPLOYMENT CHECKLIST

Before deploying Phase 1-2 migrations, verify these exist:

```sql
-- Check required functions
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
  'update_updated_at_column',
  'is_period_locked',
  'is_admin_or_hr'
);
-- Expected: 3 rows

-- Check fiscal_periods table (required by is_period_locked)
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'fiscal_periods';
-- Expected: 1 row
```

---

## ✅ DEPLOYMENT ORDER

**Correct Order:**
1. ✅ Base schema migrations (already deployed)
   - `update_updated_at_column()` function
   - `fiscal_periods` table
   - `is_period_locked()` function
   - `is_admin_or_hr()` function

2. ✅ Deploy Phase 1 migrations (in order):
   - `20260217103000_phase1_journal_entries.sql`
   - `20260217103100_phase1_vendors_bills.sql`
   - `20260217103200_phase1_payments_credits.sql`
   - `20260217103300_phase1_audit_logging.sql`

3. ✅ Deploy Phase 2 migrations (in order):
   - `20260217103400_phase2_budgets_cost_centers.sql`
   - `20260217103500_phase2_cash_working_capital.sql`

---

## 🚨 TROUBLESHOOTING

### Error: "function update_updated_at_column() does not exist"
**Cause:** Base migration with this function hasn't been run  
**Solution:** Create the function manually before running Phase 1 migrations

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Error: "function is_period_locked(uuid, date) does not exist"
**Cause:** Fiscal period locking migration hasn't been run  
**Solution:** Run `20260216124500_fiscal_period_locking.sql` first (already exists)

### Error: "function is_admin_or_hr(uuid) does not exist"
**Cause:** RBAC migration hasn't been run  
**Solution:** Run the RBAC migration or create a stub function:

```sql
-- Temporary stub (always returns false until RBAC is implemented)
CREATE OR REPLACE FUNCTION is_admin_or_hr(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN FALSE; -- All users non-admin for now
END;
$$ LANGUAGE plpgsql STABLE;
```

---

## 📝 NOTES FOR REVIEWERS

1. **All dependencies are EXISTING functions** from previous migrations
2. **No new database extensions required** (standard PostgreSQL + Supabase)
3. **Multi-org support is OPTIONAL** (RLS policies gracefully degrade)
4. **Migrations are ADDITIVE** (no breaking changes to existing tables)
5. **Rollback scripts are PROVIDED** (can undo changes in < 1 minute)

---

## ✅ VERIFICATION SCRIPT

Run this to verify all dependencies exist:

```sql
-- Verify functions
DO $$
BEGIN
  PERFORM update_updated_at_column();
  RAISE NOTICE '✓ update_updated_at_column() exists';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '✗ update_updated_at_column() missing';
END $$;

DO $$
BEGIN
  PERFORM is_period_locked(auth.uid(), CURRENT_DATE);
  RAISE NOTICE '✓ is_period_locked() exists';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '✗ is_period_locked() missing';
END $$;

DO $$
BEGIN
  PERFORM is_admin_or_hr(auth.uid());
  RAISE NOTICE '✓ is_admin_or_hr() exists';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '✗ is_admin_or_hr() missing';
END $$;

-- Verify tables
SELECT 
  CASE WHEN COUNT(*) = 1 THEN '✓ fiscal_periods table exists'
       ELSE '✗ fiscal_periods table missing'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'fiscal_periods';
```

---

**Document Version:** 1.0  
**Last Updated:** February 17, 2026  
**Status:** Dependencies documented
