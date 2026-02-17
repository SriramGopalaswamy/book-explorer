# Book Explorer - Enterprise Application

## Project Overview

Book Explorer is a full-stack enterprise application with comprehensive RBAC (Role-Based Access Control) system, demo mode, and developer tools for debugging and testing permissions.

## Architecture

### Frontend + Supabase
- **Frontend**: React + TypeScript + Vite
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Lovable Cloud
- **Dev Tools**: Client-side with Supabase direct queries

### Backend (Optional - Legacy)
- **Note**: The Express backend in `/backend` folder is no longer required for dev tools
- Dev tools now query Supabase directly
- Backend may still be used for other features if needed

## Developer Mode

This project includes a comprehensive RBAC introspection and governance layer. **As of February 2026, dev tools have been migrated to use Supabase directly**, eliminating the Express backend dependency.

See [DEV_TOOLS_SUPABASE_MIGRATION.md](./DEV_TOOLS_SUPABASE_MIGRATION.md) for migration details.

**Quick Start:**
- Dev mode is enabled by default in development
- Access the dev toolbar from the purple button on the right side of the screen
- Switch roles at runtime to test different permission levels
- View permission matrices and debug access control
- **No backend server required** - all data fetched from Supabase

**How It Works:**
1. Dev tools query `roles`, `permissions`, and `role_permissions` tables in Supabase
2. Permission matrix is built client-side
3. Role switching is client-side only (no backend headers)
4. Permission updates use Supabase RPC functions

## Database Seeding

### Supabase Seeding (Recommended)

**Complete Seed Data Available**: Run `supabase/seed.sql` to populate your database with comprehensive demo data.

The seed script provides realistic sample data for:
- **HR Modules**: Employee profiles (20), Goals (30), Memos (25), Attendance records, Leave balances/requests
- **Financial Modules**: Invoices (50), Bank accounts (5), Bank transactions (~120), Scheduled payments (25), Chart of accounts (27)
- **RBAC**: User roles and permissions

**Quick Start:**
1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste contents of `supabase/seed.sql`
3. Click "Run"
4. Verify with `supabase/diagnostic.sql`

See [SEEDING_GUIDE.md](./SEEDING_GUIDE.md) for detailed instructions and [DATA_RECOVERY_SUMMARY.md](./DATA_RECOVERY_SUMMARY.md) for background.

### RBAC Roles & Permissions

The Supabase migration `20260217000000_dev_tools_rbac.sql` automatically seeds:
- 5 roles (SuperAdmin, Admin, Moderator, Author, Reader)
- ~17 permissions across different modules
- Role-permission mappings

### Legacy Backend Seeding (Deprecated)

The Express backend in `/backend` is no longer required. All seeding is now done via Supabase.

## Bulk Excel Ingestion Engine

**New Feature (February 2026)**: Enterprise-grade bulk upload system for importing data at scale.

### Features
- ✨ **Payroll Bulk Upload** - Import employee payroll records with auto-calculations
- ✨ **Attendance Bulk Upload** - Import attendance with in-time/out-time tracking
- ✨ **Roles Bulk Upload** - Import role-permission mappings
- 🔒 **Two-Phase Processing** - Validation before data insertion
- 📊 **Row-Level Tracking** - Track success/failure of each row
- 🔐 **RLS & Permissions** - Secure, permission-based access control
- 📝 **Comprehensive Audit Trail** - Full logging for compliance

### Quick Start
1. Download CSV templates from `templates/` folder
2. Fill in your data following the template format
3. Use RPC functions to upload:
   - `validate_[module]_bulk_upload()` - Validate data
   - `process_[module]_bulk_upload()` - Process validated data

### Documentation
- **User Guide**: [BULK_UPLOAD_GUIDE.md](./BULK_UPLOAD_GUIDE.md) - Complete usage guide with examples
- **Technical Spec**: [BULK_UPLOAD_TECHNICAL_SPEC.md](./BULK_UPLOAD_TECHNICAL_SPEC.md) - Architecture and design
- **Features**: [BULK_UPLOAD_FEATURES.md](./BULK_UPLOAD_FEATURES.md) - Feature summary
- **Templates**: [templates/README.md](./templates/README.md) - Template usage instructions

### Key Capabilities
- ✅ Attendance time tracking (check_in, check_out times)
- ✅ Working week policy (5-day or 6-day work week per employee)
- ✅ Fiscal period validation (prevents posting to closed periods)
- ✅ Employee status validation (blocks inactive employees)
- ✅ Duplicate prevention across all modules
- ✅ System role protection for security

## Environment Variables

### Frontend (.env)

```bash
# Supabase configuration (Required)
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-key

# Developer mode (optional)
VITE_DEV_MODE=true
VITE_ALLOW_PERMISSION_EDITING=true

# Backend API URL (optional - only if using Express backend for other features)
VITE_API_URL=http://localhost:3000/api
```

### Backend (.env) - Optional

Only required if using Express backend for non-dev-tools features.

```bash
# Session secret
SESSION_SECRET=your-secret-key-here

# Database
DATABASE_URL=your-database-url

# Developer mode (deprecated for dev tools)
DEV_MODE=true
ALLOW_PERMISSION_EDITING=true
```

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Lovable Platform Compatibility

This project is fully compatible with Lovable.dev platform and follows all best practices for optimal AI-assisted development.

### Key Lovable Features
- ✅ **Component Tagger**: `lovable-tagger` plugin enabled for visual component tracking
- ✅ **Two-Way Sync**: Changes sync automatically between Lovable and GitHub
- ✅ **Modern Stack**: React 18 + TypeScript 5 + Vite 5 + Tailwind CSS
- ✅ **Code Splitting**: Optimized bundle with manual chunking for performance
- ✅ **shadcn/ui**: Pre-integrated component library for rapid development

### Documentation
- **[LOVABLE_COMPATIBILITY.md](./LOVABLE_COMPATIBILITY.md)** - Comprehensive compatibility guide
- **[LOVABLE_QUICK_REFERENCE.md](./LOVABLE_QUICK_REFERENCE.md)** - Quick reference for Lovable users

### AI Prompting Best Practices
When using Lovable's AI to edit this project:
- ✅ Be specific: Include file paths and component names
- ✅ Provide context: Mention user roles and permissions
- ✅ Break down tasks: Split large features into focused changes
- ✅ Use Plan Mode: For complex features, request a plan first

Example good prompt:
```
In src/components/dashboard/ModuleCard.tsx, add a 'favorited' state 
that shows a star icon when true. Only SuperAdmin and Admin roles 
should be able to toggle favorites.
```

### Performance Optimization
The build is optimized for production with:
- Manual code splitting for vendor libraries
- Lazy loading for routes
- Optimized bundle size (~500kb main + vendor chunks)
- Tree shaking and minification
