# Quick Reference Card - Data Recovery

## 🚀 Quick Start (3 Steps)

### Step 1: Run Seed Script
1. Open Supabase Dashboard → SQL Editor
2. Copy all of `supabase/seed.sql`
3. Paste and click "Run"

### Step 2: Verify
1. Run `supabase/diagnostic.sql`
2. Check counts match expected

### Step 3: Test
1. Login to application
2. Check all modules display data

---

## 📋 Expected Results

### Seed Script Output
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
```

### Data Counts
- User Roles: 1
- Employees: 20
- Goals: 30
- Memos: 25
- Attendance: ~150
- Leave Balances: ~40
- Leave Requests: 15
- Invoices: 50
- Bank Accounts: 5
- Bank Transactions: ~120
- Scheduled Payments: 25
- Chart of Accounts: 27

---

## 🔍 Verification Queries

### Quick Count Check
```sql
SELECT 
  'User Roles' as table_name, COUNT(*) FROM user_roles
UNION ALL
SELECT 'Profiles', COUNT(*) FROM profiles
UNION ALL
SELECT 'Goals', COUNT(*) FROM goals
UNION ALL
SELECT 'Memos', COUNT(*) FROM memos
UNION ALL
SELECT 'Invoices', COUNT(*) FROM invoices;
```

### Check Current User Admin
```sql
SELECT has_role(auth.uid(), 'admin');
-- Should return: true
```

### View Sample Data
```sql
SELECT * FROM profiles LIMIT 5;
SELECT * FROM goals LIMIT 5;
SELECT * FROM memos WHERE status = 'published' LIMIT 5;
```

---

## 🛠️ Common Issues

### "No users found"
**Solution**: Create user in Dashboard → Authentication → Users

### Can't see data
**Solution**: Check you have admin role
```sql
SELECT * FROM user_roles WHERE user_id = auth.uid();
```

### Duplicate key errors
**Expected**: Script uses ON CONFLICT DO NOTHING - this is normal

---

## 📚 Documentation

- **Full Guide**: [SEEDING_GUIDE.md](./SEEDING_GUIDE.md)
- **Testing**: [SEED_TESTING_GUIDE.md](./SEED_TESTING_GUIDE.md)
- **Details**: [DATA_RECOVERY_SUMMARY.md](./DATA_RECOVERY_SUMMARY.md)
- **Summary**: [IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md)

---

## ✅ Success Checklist

After seeding:
- [ ] Seed script ran without errors
- [ ] All NOTICE messages appeared
- [ ] Diagnostic shows correct counts
- [ ] Current user has admin role
- [ ] UI displays data in all modules
- [ ] CRUD operations work

---

## 🎯 What Was Fixed

| Module | Before | After |
|--------|--------|-------|
| Employees | ❌ Empty | ✅ 20 profiles |
| Goals | ❌ Empty | ✅ 30 goals |
| Memos | ❌ Empty | ✅ 25 memos |
| Attendance | ❌ Empty | ✅ ~150 records |
| Leave | ❌ Empty | ✅ ~55 records |
| Invoices | ✅ 50 | ✅ 50 (preserved) |
| Banking | ✅ Working | ✅ Working (preserved) |

---

## 🔄 Re-running Safe

The seed script is **idempotent**:
- ✓ Safe to run multiple times
- ✓ Won't duplicate data
- ✓ Won't overwrite existing records
- ✓ Uses ON CONFLICT DO NOTHING

---

## 🎨 Sample Data Highlights

### Employees
- Diverse names and departments
- Engineering, HR, Sales, Marketing, Finance, Operations
- Various job titles and seniority levels
- Realistic contact information

### Goals
- Strategic initiatives across departments
- Various progress levels (0-100%)
- Different statuses (on_track, at_risk, delayed, completed)
- Due dates within next 6 months

### Memos
- Company-wide and department-specific
- Different priorities (low, medium, high)
- Draft, pending, and published statuses
- Recipients field populated

---

## 📞 Support

If issues persist:
1. Check Supabase logs (Dashboard → Logs)
2. Run diagnostic script for details
3. Review SEEDING_GUIDE.md troubleshooting
4. Verify all migrations are applied

---

## 🎉 Status: READY TO USE

All implementation complete. Just run the seed script and verify!

**Time to complete**: ~5 minutes
**Complexity**: Low (just copy and paste SQL)
**Risk**: Zero (idempotent, safe design)
