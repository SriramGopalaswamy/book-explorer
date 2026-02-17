# Dev Tools Migration to Supabase

## Overview

This document describes the architectural refactoring that migrated the Developer Tools functionality from an Express backend to Supabase.

## What Changed

### Before (Express Backend)
- Dev tools relied on Express server endpoints
- Required running Express backend on `localhost:3000`
- Used `x-dev-role` HTTP headers for role impersonation
- Made API calls to `/api/dev/*` endpoints
- Backend needed to be deployed alongside frontend
- **Problem**: Lovable Cloud cannot run Express servers

### After (Supabase Direct)
- Dev tools query Supabase tables directly
- No Express backend dependency for dev tools
- Client-side only role simulation
- Uses Supabase RPC functions for updates
- Can deploy to Lovable Cloud without backend
- **Solution**: Pure frontend implementation with Supabase

## Database Changes

### New Supabase Tables

1. **`roles` table**
   - Stores role definitions with priorities
   - Fields: `id`, `name`, `description`, `priority`, `is_system_role`, `is_active`

2. **`permissions` table**
   - Stores permission definitions
   - Fields: `id`, `module`, `resource`, `action`, `permission_string`, `description`

3. **`role_permissions` table**
   - Junction table linking roles to permissions
   - Fields: `id`, `role_id`, `permission_id`

### New Supabase Functions

1. **`update_role_permissions(role_name, permission_strings)`**
   - RPC function to update role permissions atomically
   - Replaces Express PUT endpoint
   - Only callable by admins (enforced by RLS)

## Code Changes

### Modified Files

1. **`src/contexts/DevModeContext.tsx`**
   - Replaced `api.get('/dev/roles')` → `supabase.from('roles').select('*')`
   - Replaced `api.get('/dev/permissions')` → `supabase.from('permissions').select('*')`
   - Replaced `api.get('/dev/role-permissions')` → `supabase.from('role_permissions').select(...)`
   - Replaced `api.put('/dev/role-permissions/:id')` → `supabase.rpc('update_role_permissions')`
   - Removed `setCustomHeader('x-dev-role')` calls (no longer needed)
   - Removed `removeCustomHeader('x-dev-role')` calls
   - Built role info client-side instead of fetching from backend

2. **`src/integrations/supabase/types.ts`**
   - Added TypeScript types for `roles`, `permissions`, `role_permissions` tables
   - Added type for `update_role_permissions` RPC function

3. **`supabase/migrations/20260217000000_dev_tools_rbac.sql`**
   - New migration creating all RBAC tables
   - Seeds initial roles (SuperAdmin, Admin, Moderator, Author, Reader)
   - Seeds initial permissions
   - Creates RPC function for updates
   - Sets up RLS policies

### Files NOT Changed

- `src/lib/api.ts` - Still used for other backend API calls (if any)
- `src/components/dev/DevToolbar.tsx` - UI component unchanged
- Backend files remain but are no longer used by dev tools

## How It Works Now

### Initialization Flow

1. User logs in or enters Developer Mode
2. `DevModeContext` queries Supabase for roles, permissions, and role_permissions
3. Data is transformed into the `PermissionMatrix` structure
4. Highest priority role is selected as default
5. Role info is built client-side

### Role Switching

1. User selects a role from the dropdown in DevToolbar
2. `setActiveRole(roleName)` updates local state
3. Permission info is recalculated client-side from the matrix
4. **No backend call required**

### Permission Updates (Admin Only)

1. Admin edits role permissions via Governance Panel
2. Frontend calls `supabase.rpc('update_role_permissions', { role_name, permission_strings })`
3. Supabase validates admin role via RLS
4. RPC function atomically updates role_permissions table
5. Frontend refetches all data to reflect changes

## Benefits

✅ No Express backend dependency  
✅ Deployable to Lovable Cloud  
✅ Simpler architecture (frontend + Supabase only)  
✅ Persistent permission changes (stored in Supabase)  
✅ Better security (Supabase RLS enforced)  
✅ Faster dev mode initialization (fewer network hops)  
✅ Works in production mode on Lovable Cloud  

## Migration Checklist

- [x] Create Supabase RBAC tables
- [x] Create update RPC function
- [x] Update TypeScript types
- [x] Migrate DevModeContext to Supabase
- [x] Remove Express API dependencies
- [x] Remove x-dev-role header logic
- [x] Build and verify no TypeScript errors
- [ ] Test dev mode initialization
- [ ] Test role switching
- [ ] Test permission matrix
- [ ] Test permission updates
- [ ] Document changes

## Testing

To test the changes:

1. Ensure Supabase migrations are applied:
   ```bash
   # Run migrations (if using local Supabase)
   supabase db reset
   ```

2. Start the frontend:
   ```bash
   npm run dev
   ```

3. Open developer mode and verify:
   - Roles load in the dropdown
   - Permission matrix displays correctly
   - Role switching works
   - No console errors about localhost:3000

## Rollback Plan

If issues arise, the Express backend files are still in the repository. To rollback:

1. Revert changes to `DevModeContext.tsx`
2. Start the Express backend: `cd backend && npm start`
3. Ensure `VITE_API_URL` points to backend

However, this won't work on Lovable Cloud deployment.

## Future Improvements

- Remove unused backend files entirely
- Add unit tests for Supabase queries
- Add integration tests for RPC functions
- Consider adding permission caching
- Add audit logging for permission changes
