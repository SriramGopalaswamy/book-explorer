# How to Get Azure Credentials from Supabase

The Azure credentials for Microsoft 365 authentication were previously stored in Supabase's Edge Function secrets. To retrieve them:

## Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/qfgudhbrjfjmbamwsfuj
2. Navigate to **Settings** → **Edge Functions** → **Secrets**
3. Look for these secrets:
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `AZURE_TENANT_ID`
4. Copy each value and add them to your `.env` file

## Option 2: Supabase CLI

```bash
# List all secrets
supabase secrets list

# Or get specific secret
supabase secrets get AZURE_CLIENT_ID
supabase secrets get AZURE_CLIENT_SECRET
supabase secrets get AZURE_TENANT_ID
```

## Option 3: Check Azure Portal

If you have access to Azure Portal:
1. Go to Azure Active Directory → App registrations
2. Find your app registration
3. Copy:
   - **Application (client) ID** → `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_TENANT_ID`
   - **Certificates & secrets** → Create/View client secret → `AZURE_CLIENT_SECRET`

## Add to .env

Once you have the credentials, add them to your root `.env` file:

```env
# Microsoft 365 OAuth (REQUIRED for MS365 authentication)
AZURE_CLIENT_ID=your-actual-client-id-from-supabase
AZURE_CLIENT_SECRET=your-actual-client-secret-from-supabase
AZURE_TENANT_ID=your-actual-tenant-id-from-supabase
```

The backend API will automatically read these from the `.env` file.
