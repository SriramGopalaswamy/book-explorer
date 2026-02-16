# Supabase Seeding Guide

## Overview

This directory contains SQL scripts and Node.js tools for seeding financial module data into Supabase.

## What Gets Seeded

The seeding process populates the following modules with realistic test data:

1. **Invoicing Module**
   - 50 invoices with varied statuses
   - Multiple invoice items per invoice
   - Date ranges spanning 12 months

2. **Banking Module**
   - 5 bank accounts (various types)
   - ~120 bank transactions across active accounts
   - Realistic transaction categories and amounts

3. **Cash Flow Module**
   - 25 scheduled payments
   - Mix of inflows and outflows
   - Recurring and one-time payments

4. **Analytics Module**
   - 27 standard chart of accounts entries
   - Assets, Liabilities, Equity, Revenue, Expenses
   - Opening and current balances

## Seeding Methods

### Method 1: SQL Script (Recommended for Production)

Run the SQL script directly in Supabase SQL Editor:

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Open `supabase/seed.sql`
4. Run the script

The script will automatically:
- Detect the first user in your database
- Seed all data for that user
- Handle conflicts gracefully
- Provide progress notifications

### Method 2: Node.js Script (For Development)

**Note**: This requires network access to Supabase and may not work in restricted environments.

```bash
# Install dependencies (if not already done)
npm install

# Set environment variables
export VITE_SUPABASE_URL="your-supabase-url"
export VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-key"

# Run seeding
npm run supabase:seed
```

For service role access (more permissions):
```bash
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
npm run supabase:seed
```

### Method 3: Seed All (Backend + Supabase)

To seed both the backend Express database and Supabase:

```bash
npm run seed:all
```

This runs:
1. Backend seeding (`npm run backend:seed`)
2. Supabase seeding (`npm run supabase:seed`)

## Verification

After seeding, verify data exists:

### Check via Supabase Dashboard

1. Go to Table Editor
2. Check these tables:
   - `invoices` - Should have 50 rows
   - `bank_accounts` - Should have 5 rows
   - `bank_transactions` - Should have ~120 rows
   - `scheduled_payments` - Should have 25 rows
   - `chart_of_accounts` - Should have 27 rows

### Check via SQL Query

```sql
SELECT 
  (SELECT COUNT(*) FROM invoices) as invoices,
  (SELECT COUNT(*) FROM bank_accounts) as bank_accounts,
  (SELECT COUNT(*) FROM bank_transactions) as transactions,
  (SELECT COUNT(*) FROM scheduled_payments) as payments,
  (SELECT COUNT(*) FROM chart_of_accounts) as coa_entries;
```

### Check via Frontend

1. Login to the application
2. Navigate to each financial module:
   - **Invoicing** - Should show invoice list
   - **Banking** - Should show accounts and transactions
   - **Cash Flow** - Should show scheduled payments
   - **Analytics** - Should show charts and reports

## Troubleshooting

### "No users found" Error

The seed script requires at least one user in `auth.users`. Create a user first:

```sql
-- Check if users exist
SELECT id, email FROM auth.users;

-- If no users, sign up via the application first
```

### Duplicate Data

If you run the seed multiple times, duplicates will be skipped due to ON CONFLICT clauses.

To reset and re-seed:

```sql
-- WARNING: This deletes all data
DELETE FROM invoice_items;
DELETE FROM invoices;
DELETE FROM bank_transactions;
DELETE FROM bank_accounts;
DELETE FROM scheduled_payments;
DELETE FROM chart_of_accounts;

-- Then run seed.sql again
```

### Network Issues (Node.js Script)

If the Node.js script fails with network errors:
1. Check your internet connection
2. Verify Supabase URL is correct
3. Use Method 1 (SQL Script) instead

### Permission Errors

Ensure Row Level Security (RLS) policies allow:
- Users to insert their own data
- Service role has admin access (if using service key)

## Data Characteristics

### Realistic Data

- **Amounts**: Varied (₹5,000 - ₹5,00,000)
- **Dates**: Distributed over past 12 months
- **Statuses**: Multiple states (draft, sent, paid, overdue, etc.)
- **Categories**: Standard business categories

### Relational Integrity

- All foreign keys are properly linked
- Invoice items link to invoices
- Transactions link to bank accounts
- All records link to user_id

### Temporal Distribution

Data is spread across time to simulate organic business activity:
- Recent transactions
- Historical invoices
- Future scheduled payments

## Safety

- **User Scoped**: All data is scoped to specific users
- **Idempotent**: Safe to run multiple times
- **No Production Risk**: Runs on development Supabase project only

## Next Steps

After seeding:

1. **Verify All Modules**: Check each financial page loads with data
2. **Test Functionality**: Create, update, delete records
3. **Check Charts**: Ensure visualizations render correctly
4. **Validate Filters**: Test date ranges, status filters, etc.

## Architecture Notes

The system uses a **dual-database architecture**:

- **Backend (Express + SQLite)**: Dashboard financial records
- **Frontend (Supabase + PostgreSQL)**: Invoicing, Banking, CashFlow, Analytics

This is why both `backend:seed` and `supabase:seed` are needed for complete seeding.
