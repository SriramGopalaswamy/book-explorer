# Admin Platform Features

## Overview
The superadmin platform now supports full organization management capabilities.

## Superadmin Access
- **Email**: admin@grx10.com
- **Access**: Navigate to `/platform` route after login

## Features Implemented

### 1. Organization Management (`/platform`)
The Platform Organizations page now includes:

#### View Organizations
- List all organizations/tenants in the platform
- View operational status (Operational, Suspended, Locked, Archived)
- See member counts per organization
- View creation dates

#### Create New Organizations
Click **"Create Organization"** button to add new organizations with:
- **Organization Name**: Full legal name (e.g., "grx10 Technologies")
- **Slug**: URL-friendly identifier (e.g., "grx10")
- **Subscription Plan**: Choose from Free, Starter, Professional, Enterprise
- **Subscription Duration**: Set validity in months (1-36)

When an organization is created:
1. Organization record is created in `grxbooks.organizations` table
2. Subscription is automatically created in `grxbooks.subscriptions` table
3. Action is logged in `grxbooks.platform_admin_logs`
4. Organization starts with status "active" and org_state "active"
5. Default enabled modules: HRMS, Accounting, GST

#### Organization Actions
- **View as Org**: Switch context to view the platform as that organization
- **Click Row**: Navigate to detailed tenant view

### 2. Subscription Management
Subscriptions are created with:
- **Plan**: free, starter, professional, enterprise
- **Status**: active (by default)
- **Valid Until**: Calculated from creation date + specified months
- **Source**: platform_admin (tracked for audit)
- **Enabled Modules**: Array of accessible features
- **Read-Only Mode**: false (full access)

### 3. Database Tables Structure

#### organizations
```
- id (UUID)
- name (TEXT) - Legal organization name
- slug (TEXT) - URL-friendly identifier
- status (TEXT) - active/suspended
- environment_type (TEXT) - production/staging
- org_state (TEXT) - active/initializing/locked/archived
- settings (JSONB)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
```

#### subscriptions
```
- id (UUID)
- organization_id (UUID) - FK to organizations
- plan (TEXT) - free/starter/professional/enterprise
- status (TEXT) - active/suspended/expired
- source (TEXT) - platform_admin/self_serve/migration
- valid_until (TIMESTAMPTZ)
- is_read_only (BOOLEAN)
- enabled_modules (ARRAY)
- created_at (TIMESTAMPTZ)
```

### 4. MS365 Integration (Coming Soon)
Currently showing as "Coming Soon" in onboarding:
- Azure AD SSO
- Outlook integration
- Teams integration
- OAuth token exchange (server-side)

Future implementation will include:
- Organization-level MS365 app registration
- Client ID/Secret configuration
- Tenant ID setup
- OAuth callback handling
- Calendar sync settings
- Email integration preferences

## Usage Workflow

### Creating a New Organization (Example: grx10)

1. **Login as Superadmin**
   - Email: admin@grx10.com
   - Password: [your password]

2. **Navigate to Platform**
   - Go to `/platform` or click "Platform" in navigation

3. **Create Organization**
   - Click "Create Organization" button
   - Fill in details:
     - Name: "grx10 Technologies"
     - Slug: "grx10"
     - Plan: "enterprise"
     - Duration: 12 months
   - Click "Create Organization"

4. **Result**
   - Organization "grx10" is created
   - Subscription is active for 12 months
   - Organization can now:
     - Add users
     - Setup integrations (once MS365 is implemented)
     - Access all enabled modules
     - Configure their workspace

### Viewing Organization Details
- Click on any organization row to view detailed tenant information
- Use "View as Org" to impersonate and see their workspace

## Next Steps

### Immediate Access
All tables are now created and functional:
- ✅ journal_entries
- ✅ journal_lines
- ✅ profiles_safe (view)
- ✅ All other required tables

### Future Enhancements
1. **MS365 Integration**
   - Add MS365 app configuration to organization settings
   - Implement OAuth flow
   - Add calendar/email sync

2. **Subscription Management**
   - Edit existing subscriptions
   - Upgrade/downgrade plans
   - Manage module access per organization

3. **Organization Settings**
   - Configure integrations per org
   - Manage organization admins
   - Set organization-specific policies

## Backend API Endpoints Used
- `POST /rest/v1/organizations` - Create organization
- `GET /rest/v1/organizations` - List organizations
- `POST /rest/v1/subscriptions` - Create subscription
- `POST /rest/v1/platform_admin_logs` - Log admin actions

## Notes
- DEV_MODE is currently enabled (subscription validation bypassed)
- All operations are logged in platform_admin_logs for audit trail
- RLS policies enforce super_admin access to platform routes
