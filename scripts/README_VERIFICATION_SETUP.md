# Financial Verification Function Setup

This guide helps you set up the `run_financial_verification` function in your PostgreSQL database.

## What This Does

The verification function performs comprehensive integrity checks on your financial system, including:
- Tenant & Access Integrity checks
- Financial Integrity checks (journal entries, invoices, etc.)
- Returns a JSON result with pass/fail status for each check

## Quick Setup

### Option 1: Using the Automated Script (Recommended)

1. Make sure your backend API is configured with the correct `DATABASE_URL` in `.env`
2. Run the setup script:
   ```bash
   # From the project root
   node scripts/setup-verification.js
   ```

   Or double-click: `scripts\SETUP_VERIFICATION.bat`

3. The script will:
   - Connect to your PostgreSQL database
   - Create the `run_financial_verification` function
   - Test the function and show results

### Option 2: Manual Setup via psql

If you prefer to use psql directly:

```bash
psql "postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm" -f scripts/create_verification_function.sql
```

## Testing

After setup, you can test the function:

1. Start your backend API:
   ```bash
   cd backend-api
   npm run dev
   ```

2. Start your frontend:
   ```bash
   npm run dev
   ```

3. Navigate to the Platform Integrity page and click "Run Verification"

## Troubleshooting

### Error: "relation does not exist"

Some tables may not exist in your database yet. The function is designed to skip checks for missing tables gracefully.

### Error: "permission denied"

Make sure your database user has permission to create functions in the `grxbooks` schema.

### Error: "connection refused"

Check that:
- Your `DATABASE_URL` in `.env` is correct
- Your database is accessible from your network
- Render database is not in sleep mode (free tier databases may sleep)

## What Was Changed

1. **Backend API** (`backend-api/server.js`):
   - Added RPC endpoint at `/rest/v1/rpc/:functionName` to call PostgreSQL functions

2. **Database Client** (`src/integrations/database/client.ts`):
   - Added `rpc()` method to support calling database functions

3. **Database**:
   - Created `grxbooks.run_financial_verification()` function

## Next Steps

Once the function is set up:
- The Platform Integrity page will work correctly
- You can monitor system health and integrity
- Any critical failures will show as "BLOCKED" status
