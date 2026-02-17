# Seed Script Testing & Verification

## Pre-Testing Checklist

Before running the seed script, verify:

- [ ] All migrations in `supabase/migrations/` are applied
- [ ] At least one user exists in `auth.users` table
- [ ] You have access to Supabase SQL Editor or CLI
- [ ] Environment variables are correctly configured

## Testing Steps

### Step 1: Backup Check (Optional)

If you have existing data you want to preserve:

```sql
-- Check if you have any existing data
SELECT 
  'profiles' as table_name, COUNT(*) FROM profiles
UNION ALL
SELECT 'goals', COUNT(*) FROM goals
UNION ALL
SELECT 'memos', COUNT(*) FROM memos
UNION ALL
SELECT 'invoices', COUNT(*) FROM invoices;
```

### Step 2: Run Diagnostic Script (Before Seeding)

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `supabase/diagnostic.sql`
3. Paste and run
4. Review output for:
   - Current user information
   - Existing data counts (should be mostly 0)
   - RLS status (should all be ENABLED)
   - Potential issues

Expected output before seeding:
```
⚠️  WARNING: Profiles table is empty
⚠️  WARNING: Goals table is empty
⚠️  WARNING: Memos table is empty
```

### Step 3: Run Seed Script

1. Open Supabase Dashboard → SQL Editor
2. Create a new query
3. Copy entire contents of `supabase/seed.sql`
4. Paste into the editor
5. Click "Run" (or press Ctrl/Cmd + Enter)
6. Wait for execution to complete (may take 10-30 seconds)

### Step 4: Verify Success Messages

You should see NOTICE messages in the output:

```
NOTICE: Using user ID: <uuid>
NOTICE: Seeded user roles
NOTICE: Seeded employee profiles
NOTICE: Seeded goals
NOTICE: Seeded memos
NOTICE: Seeded attendance records
NOTICE: Seeded leave balances
NOTICE: Seeded leave requests
NOTICE: Seeded invoices and invoice items
NOTICE: Seeded bank accounts
NOTICE: Seeded bank transactions
NOTICE: Seeded scheduled payments
NOTICE: Seeded chart of accounts
NOTICE: ✅ SEEDING COMPLETED SUCCESSFULLY
NOTICE: Summary:
NOTICE:   User Roles: 1
NOTICE:   Employee Profiles: 20
NOTICE:   Goals: 30
NOTICE:   Memos: 25
NOTICE:   Attendance Records: ~150
NOTICE:   Leave Balances: ~40
NOTICE:   Leave Requests: 15
NOTICE:   Invoices: 50
NOTICE:   Bank Accounts: 5
NOTICE:   Bank Transactions: ~120
NOTICE:   Scheduled Payments: 25
NOTICE:   Chart of Accounts: 27 entries
```

### Step 5: Run Diagnostic Script (After Seeding)

1. Run `supabase/diagnostic.sql` again
2. Verify:
   - Data counts match expectations
   - All RLS is still enabled
   - Current user has admin role
   - No warnings about empty tables

Expected output after seeding:
```
✓ Admin roles exist
✓ Profiles table has data
✓ Goals table has data
✓ Memos table has data
```

### Step 6: Manual Data Verification

Run these queries to spot-check the data:

```sql
-- Check employee profiles
SELECT id, full_name, department, job_title, status 
FROM profiles 
LIMIT 5;

-- Check goals
SELECT id, title, category, status, progress, due_date 
FROM goals 
LIMIT 5;

-- Check memos
SELECT id, title, department, priority, status, author_name 
FROM memos 
LIMIT 5;

-- Check attendance
SELECT user_id, date, status, check_in, check_out 
FROM attendance_records 
ORDER BY date DESC 
LIMIT 5;

-- Check invoices
SELECT id, invoice_number, client_name, amount, status 
FROM invoices 
LIMIT 5;

-- Check bank accounts
SELECT id, name, account_type, balance, status 
FROM bank_accounts;
```

### Step 7: Test RLS Policies

Verify data visibility through RLS:

```sql
-- As authenticated user (should see own data + published memos)
SELECT COUNT(*) FROM goals WHERE user_id = auth.uid();
SELECT COUNT(*) FROM memos WHERE status = 'published';

-- Check if current user has admin role (should see all data)
SELECT has_role(auth.uid(), 'admin');
```

## Verification Checklist

After seeding, verify all data counts:

### HR & Operations
- [ ] User roles: At least 1 (admin for current user)
- [ ] Profiles: 20 employees
- [ ] Goals: 30 goals
- [ ] Memos: 25 memos
- [ ] Attendance records: ~150 entries
- [ ] Leave balances: ~40 records
- [ ] Leave requests: 15 requests

### Financial
- [ ] Invoices: 50 invoices
- [ ] Invoice items: 100+ items
- [ ] Bank accounts: 5 accounts
- [ ] Bank transactions: ~120 transactions
- [ ] Scheduled payments: 25 payments
- [ ] Chart of accounts: 27 entries

### Data Quality
- [ ] All tables have reasonable data (no NULLs in required fields)
- [ ] Dates are realistic (within expected ranges)
- [ ] Random data varies (not all the same values)
- [ ] Relationships are valid (foreign keys reference existing records)

### RLS Verification
- [ ] All tables have RLS enabled
- [ ] Users can see their own data
- [ ] Admin users can see all data
- [ ] Published memos visible to all authenticated users

## Common Issues & Solutions

### Issue: Script runs but no data appears

**Possible Causes:**
1. RLS blocking visibility
2. Running as different user than expected
3. Tables were truncated after seeding

**Solutions:**
1. Check if you have admin role: `SELECT * FROM user_roles WHERE user_id = auth.uid();`
2. Verify data exists: `SELECT COUNT(*) FROM profiles;` (run without WHERE clause)
3. Re-run seed script (it's idempotent)

### Issue: Duplicate key violations

**Expected Behavior:**
- The script uses `ON CONFLICT DO NOTHING`
- Duplicate key errors are caught and ignored
- This is normal if running the script multiple times

**Action:**
- Check the NOTICE messages for actual insert counts
- If some data already exists, only new data will be inserted

### Issue: Foreign key constraint violations

**Cause:**
- Migrations not applied in correct order
- Tables don't exist yet

**Solution:**
1. Check all migrations are applied: Dashboard → Database → Migrations
2. Apply missing migrations
3. Re-run seed script

### Issue: "No users found" error

**Cause:**
- No users in `auth.users` table

**Solution:**
1. Create a user in Supabase Dashboard → Authentication → Users
2. Re-run seed script
3. The script will automatically use the first user

## Performance Notes

- Script execution time: 10-30 seconds
- Database size increase: ~5-10 MB
- No indexes are modified
- No schema changes are made

## Re-running the Script

The seed script is **idempotent** and can be run multiple times safely:

- ✓ Safe to re-run
- ✓ Won't duplicate data (uses ON CONFLICT)
- ✓ Won't fail on existing records
- ✓ Will add new data if tables are empty

## Cleanup (If Needed)

To remove all seed data and start fresh:

```sql
-- ⚠️ WARNING: This deletes ALL data!
-- Only run in development/testing environments

BEGIN;

TRUNCATE TABLE public.attendance_records CASCADE;
TRUNCATE TABLE public.leave_requests CASCADE;
TRUNCATE TABLE public.leave_balances CASCADE;
TRUNCATE TABLE public.goals CASCADE;
TRUNCATE TABLE public.memos CASCADE;
TRUNCATE TABLE public.invoice_items CASCADE;
TRUNCATE TABLE public.invoices CASCADE;
TRUNCATE TABLE public.bank_transactions CASCADE;
TRUNCATE TABLE public.bank_accounts CASCADE;
TRUNCATE TABLE public.scheduled_payments CASCADE;
TRUNCATE TABLE public.chart_of_accounts CASCADE;
TRUNCATE TABLE public.user_roles CASCADE;

-- Verify all tables are empty
SELECT 'profiles' as table_name, COUNT(*) FROM profiles
UNION ALL
SELECT 'goals', COUNT(*) FROM goals
UNION ALL
SELECT 'memos', COUNT(*) FROM memos;

-- If everything looks good, commit
COMMIT;

-- After cleanup, run the seed script again
```

## Next Steps After Successful Seeding

1. **Test in UI:**
   - Login to the application
   - Navigate to each module
   - Verify data displays correctly
   - Test CRUD operations

2. **Verify Permissions:**
   - Test with different user roles
   - Verify RLS policies work as expected
   - Check admin/HR can see all data
   - Check regular users see only their own data

3. **Document Custom Changes:**
   - If you modified the seed script, document changes
   - Update seed counts if you changed quantities
   - Add any additional seed data needed for your use case

## Support

If issues persist:
1. Check Supabase logs in Dashboard → Logs
2. Review error messages in SQL Editor
3. Run diagnostic script for detailed analysis
4. Refer to [SEEDING_GUIDE.md](./SEEDING_GUIDE.md) for troubleshooting

## Success Criteria

Seeding is successful when:
- ✅ All NOTICE messages show "Seeded" confirmations
- ✅ Diagnostic script shows expected data counts
- ✅ Manual queries return sample data
- ✅ RLS policies allow appropriate data access
- ✅ UI displays data in all modules
- ✅ No error messages in Supabase logs

---

**Status Template:**

Copy this template and fill it out after testing:

```
## Seed Script Test Results

Date: YYYY-MM-DD
Tester: [Your Name]
Environment: [Development/Staging/etc]

### Execution
- [ ] Script ran without errors
- [ ] All NOTICE messages appeared
- [ ] Execution time: ___ seconds

### Data Counts
- [ ] User Roles: ___
- [ ] Profiles: ___
- [ ] Goals: ___
- [ ] Memos: ___
- [ ] Attendance: ___
- [ ] Leave Balances: ___
- [ ] Leave Requests: ___
- [ ] Invoices: ___
- [ ] Bank Accounts: ___
- [ ] Bank Transactions: ___
- [ ] Scheduled Payments: ___
- [ ] Chart of Accounts: ___

### Verification
- [ ] Diagnostic script passed
- [ ] Manual queries returned data
- [ ] RLS policies working correctly
- [ ] UI displays data

### Issues Found
[List any issues or deviations from expected results]

### Notes
[Any additional observations or comments]
```
