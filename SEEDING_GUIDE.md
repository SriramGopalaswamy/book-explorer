# Database Seeding Guide

## Overview

This guide explains how to seed your Supabase database with comprehensive demo data for all modules in the Book Explorer application.

## What Gets Seeded

The `supabase/seed.sql` script provides realistic sample data for:

### HR & Operations Modules
- **User Roles**: Admin role assignment for the current user
- **Employee Profiles**: 20 employee records with departments, job titles, contact info
- **Goals**: 30 organizational goals across different categories and statuses
- **Memos**: 25 company-wide memos with varying priorities and departments
- **Attendance Records**: ~150 attendance entries (30 days × 5 employees)
- **Leave Balances**: ~40 leave balance records (4 leave types × 10 employees)
- **Leave Requests**: 15 leave requests with various statuses

### Financial Modules
- **Invoices**: 50 invoices with multiple line items each
- **Bank Accounts**: 5 bank accounts with different types
- **Bank Transactions**: ~120 transactions across active accounts
- **Scheduled Payments**: 25 recurring and one-time payment schedules
- **Chart of Accounts**: 27 standard accounting entries across all account types

## Prerequisites

1. **Supabase Project**: You must have a Supabase project set up
2. **Migrations Applied**: All migrations in `supabase/migrations/` must be applied first
3. **User Account**: At least one user must exist in `auth.users` table

## Seeding Methods

### Method 1: Supabase SQL Editor (Recommended)

1. **Navigate to Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy and Paste Seed Script**
   - Open `supabase/seed.sql`
   - Copy the entire contents
   - Paste into the SQL Editor

4. **Execute the Script**
   - Click "Run" or press `Ctrl/Cmd + Enter`
   - Wait for execution to complete
   - Check the "Results" panel for success messages

5. **Verify Seeding**
   - You should see output messages like:
     ```
     NOTICE: Using user ID: <uuid>
     NOTICE: Seeded user roles
     NOTICE: Seeded employee profiles
     NOTICE: Seeded goals
     ...
     NOTICE: ✅ SEEDING COMPLETED SUCCESSFULLY
     ```

### Method 2: Supabase CLI (For Local Development)

1. **Install Supabase CLI** (if not already installed)
   ```bash
   npm install -g supabase
   ```

2. **Start Local Supabase** (optional, for local development)
   ```bash
   supabase start
   ```

3. **Run Seed Script**
   ```bash
   supabase db reset --db-url "your-database-url"
   ```
   
   Or execute the seed file directly:
   ```bash
   psql "your-database-connection-string" -f supabase/seed.sql
   ```

## Important Notes

### Idempotent Seeding
The seed script is designed to be **idempotent**, meaning you can run it multiple times safely:
- All INSERT statements use `ON CONFLICT DO NOTHING`
- Existing data will not be duplicated
- New data will be added only if it doesn't conflict

### User ID Handling
The script automatically:
1. Gets the first user from `auth.users` table
2. Uses that user ID for all seeded data
3. Throws an error if no users exist

### Demo Employee Profiles
- Employee profiles are created with **random UUIDs** for demo purposes
- These are NOT tied to actual `auth.users` entries
- In production, profiles are created automatically when users sign up via the `handle_new_user()` trigger

### RLS (Row Level Security)
All seeded data respects RLS policies:
- Users can only see their own data unless they have admin/HR roles
- Admin users (seeded with admin role) can see all data
- Published memos are visible to all authenticated users
- Goals and attendance follow department/role-based visibility

## Verification Checklist

After seeding, verify data exists in each table:

### HR Module
- [ ] Check `user_roles`: Should have at least 1 admin role
- [ ] Check `profiles`: Should have 20 employee records
- [ ] Check `goals`: Should have 30 goals
- [ ] Check `memos`: Should have 25 memos
- [ ] Check `attendance_records`: Should have ~150 records
- [ ] Check `leave_balances`: Should have ~40 records
- [ ] Check `leave_requests`: Should have 15 records

### Financial Module
- [ ] Check `invoices`: Should have 50 invoices
- [ ] Check `invoice_items`: Should have 100+ items
- [ ] Check `bank_accounts`: Should have 5 accounts
- [ ] Check `bank_transactions`: Should have ~120 transactions
- [ ] Check `scheduled_payments`: Should have 25 payments
- [ ] Check `chart_of_accounts`: Should have 27 entries

### Quick Verification Queries

Run these in Supabase SQL Editor to verify:

```sql
-- Count all seeded records
SELECT 
  'User Roles' as table_name, COUNT(*) as count FROM user_roles
UNION ALL
SELECT 'Profiles', COUNT(*) FROM profiles
UNION ALL
SELECT 'Goals', COUNT(*) FROM goals
UNION ALL
SELECT 'Memos', COUNT(*) FROM memos
UNION ALL
SELECT 'Attendance', COUNT(*) FROM attendance_records
UNION ALL
SELECT 'Leave Balances', COUNT(*) FROM leave_balances
UNION ALL
SELECT 'Leave Requests', COUNT(*) FROM leave_requests
UNION ALL
SELECT 'Invoices', COUNT(*) FROM invoices
UNION ALL
SELECT 'Invoice Items', COUNT(*) FROM invoice_items
UNION ALL
SELECT 'Bank Accounts', COUNT(*) FROM bank_accounts
UNION ALL
SELECT 'Bank Transactions', COUNT(*) FROM bank_transactions
UNION ALL
SELECT 'Scheduled Payments', COUNT(*) FROM scheduled_payments
UNION ALL
SELECT 'Chart of Accounts', COUNT(*) FROM chart_of_accounts;
```

## Troubleshooting

### Issue: "No users found in auth.users"

**Solution**: Create a user first
1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add User"
3. Create a user with email and password
4. Run the seed script again

### Issue: "Permission denied" or RLS errors

**Solution**: Use Service Role
1. Make sure you're running the script with proper permissions
2. In Supabase SQL Editor, the script runs with elevated permissions
3. For CLI, ensure you're using the service role key, not the anon key

### Issue: Duplicate key violations

**Solution**: This is expected behavior
- The script uses `ON CONFLICT DO NOTHING`
- If data already exists, it won't be duplicated
- Check the NOTICE messages to see what was actually inserted

### Issue: Foreign key constraint violations

**Solution**: Ensure migrations are applied
1. All migrations in `supabase/migrations/` must be applied first
2. Check migration status in Supabase Dashboard → Database → Migrations
3. Apply missing migrations before seeding

## Resetting Data

If you need to clear all data and re-seed:

```sql
-- ⚠️ WARNING: This deletes ALL data - use with caution!

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
-- Note: profiles are auto-created from auth.users, be careful truncating

-- After truncating, run the seed script again
```

## Security Considerations

### Production Use
- **DO NOT** use this seed script in production
- This is for **development and demo purposes only**
- Production data should come from real user interactions

### Sensitive Data
- All seeded data contains **fake/demo information**
- No real personal information is used
- Email addresses use @company.com domain
- Phone numbers use 555 prefix (reserved for fictional use)

## Support

If you encounter issues:
1. Check Supabase logs in the Dashboard
2. Review RLS policies for affected tables
3. Verify all migrations are applied
4. Ensure your user has appropriate roles assigned

## Related Documentation

- [README.md](./README.md) - Project overview
- [DEVELOPMENT_SETUP.md](./DEVELOPMENT_SETUP.md) - Development environment setup
- [DEVELOPER_MODE.md](./DEVELOPER_MODE.md) - Dev tools and role switching
- [RBAC_IMPLEMENTATION.md](./RBAC_IMPLEMENTATION.md) - Role-based access control details
