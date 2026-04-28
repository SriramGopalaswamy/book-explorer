# Supabase — Operations Guide

## Seed data (development / sandbox only)

`seed.sql` contains a production guard that aborts if real organizations are detected.
Never run any seed file against a live instance with customer data.

```bash
# Run in Supabase SQL Editor — local or staging only
\i supabase/seed.sql
```

---

## Migration squash playbook

383 migrations accumulated since February 2026. Squashing into a single baseline
reduces cold-start replay time and eliminates drift risk. Run this when you have
access to a live Supabase project with the full schema applied.

### Prerequisites
- Supabase CLI installed (`brew install supabase/tap/supabase`)
- Project linked (`supabase link --project-ref <ref>`)
- Database accessible

### Steps

```bash
# 1. Dump the current live schema (public + auth extensions only)
supabase db dump --schema public -f supabase/migrations/00000000000000_squashed_baseline.sql

# 2. Prepend a safety header to the dump
sed -i '1s/^/-- SQUASHED BASELINE — generated $(date +%Y-%m-%d)\n-- Do not edit manually. Generated from live DB schema.\n\n/' \
  supabase/migrations/00000000000000_squashed_baseline.sql

# 3. Delete all old migration files EXCEPT the new baseline and the 3 post-squash migrations
find supabase/migrations -name "*.sql" \
  ! -name "00000000000000_squashed_baseline.sql" \
  ! -name "20260428100000_fix_rbac_superadmin_write.sql" \
  ! -name "20260428110000_enforce_payroll_lock_at_db.sql" \
  -delete

# 4. Tell Supabase that all old migrations are already applied
supabase migration repair --status applied

# 5. Verify the local schema matches the remote
supabase db diff
```

### Post-squash check
```sql
-- Run in SQL Editor after squash to confirm RLS is intact
SELECT schemaname, tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;
-- Expected: ~153 tables with policies
```

### What NOT to squash
Keep the following migrations separate (applied after squash baseline):
- `20260428100000_fix_rbac_superadmin_write.sql`
- `20260428110000_enforce_payroll_lock_at_db.sql`

---

## Timestamp collision fix (done 2026-04-28)

Three pairs of migrations had duplicate timestamps, which causes non-deterministic
replay order. These were renamed to sequential timestamps:

| Before | After |
|---|---|
| `20260312000000_fix-exchange-rates-rls.sql` | `20260312000001_fix-exchange-rates-rls.sql` |
| `20260319130000_messaging_refactor_fixes.sql` | `20260319130001_messaging_refactor_fixes.sql` |
| `20260413000001_fix_employee_full_profiles_dob_coalesce.sql` | `20260413000003_fix_employee_full_profiles_dob_coalesce.sql` |
