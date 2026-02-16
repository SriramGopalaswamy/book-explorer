# Developer Mode - RBAC Introspection & Governance Layer

## Overview

This system provides a comprehensive RBAC (Role-Based Access Control) introspection and governance layer for development and debugging. It allows developers to:

- **Impersonate roles** at runtime without modifying the database
- **View permission matrices** to understand role-permission mappings
- **Debug permission checks** with live feedback
- **Edit permissions** (SuperAdmin only) with full audit logging
- **Zero production leakage** - all dev tools are automatically disabled in production

## Architecture

The system is built with a layered architecture:

1. **Environment Control Layer** - System flags that control feature availability
2. **Effective Role Resolution** - Backend middleware for role impersonation
3. **Backend API Layer** - RESTful endpoints for dev mode operations
4. **Frontend Context Layer** - React context for state management
5. **UI Toolbar** - Right-side panel for developer tools

## Environment Variables

### Backend (.env or environment)

```bash
# Developer mode (default: true in development, false in production)
DEV_MODE=true

# Allow runtime permission editing (default: true in development, false in production)
ALLOW_PERMISSION_EDITING=true

# Node environment
NODE_ENV=development
```

### Frontend (.env or environment)

```bash
# Developer mode (default: true in development, false in production)
VITE_DEV_MODE=true

# Allow permission editing (default: true in development, false in production)
VITE_ALLOW_PERMISSION_EDITING=true
```

## Features

### 1. Role Impersonation

Developers can switch between different roles at runtime to test permission enforcement:

```typescript
// Frontend usage
const { setActiveRole, activeRole, isImpersonating } = useDevMode();

// Switch to a different role
setActiveRole('admin');
```

**How it works:**
- When a role is selected, the frontend sets `x-dev-role` header on all API requests
- Backend middleware reads this header and sets `req.effectiveRole`
- All permission checks use `effectiveRole` instead of actual user role
- Original user role is never modified in the database
- Role switch is logged for audit trail

### 2. Permission Matrix View

View complete role-permission mappings in an easy-to-read format:

- Shows all roles and their assigned permissions
- Highlights wildcard (*) permissions
- Displays permission counts
- Real-time updates when permissions change

### 3. Current Role Permissions

See exactly what permissions the current effective role has:

- List of all permissions for current role
- Visual indicators for wildcard access
- Permission string format: `module.resource.action`

### 4. Permission Editing (SuperAdmin Only)

SuperAdmin users can modify role permissions at runtime:

**WARNING:** Changes are runtime-only and will be lost on server restart.

```typescript
// Update permissions for a role
await updateRolePermissions('moderator', [
  'books.books.read',
  'books.books.moderate',
  'reviews.reviews.moderate'
]);
```

**Audit Logging:**
Every permission change is logged with:
- Role name
- User who made the change
- Effective role at time of change
- Timestamp
- Old vs new permissions
- Impersonation status

## Backend API Endpoints

All endpoints require authentication and are only available when `DEV_MODE=true`.

### GET /api/dev/system-flags

Returns current system configuration:

```json
{
  "DEV_MODE": true,
  "ALLOW_PERMISSION_EDITING": true,
  "NODE_ENV": "development",
  "effectiveRole": "admin",
  "isImpersonating": true
}
```

### GET /api/dev/roles

Returns all available roles with their permissions:

```json
{
  "roles": [
    {
      "name": "admin",
      "permissions": ["*"],
      "priority": 90,
      "description": "Administrator role",
      "isSystemRole": true
    },
    // ... more roles
  ]
}
```

### GET /api/dev/permissions

Returns all available permissions:

```json
{
  "permissions": [
    {
      "id": "uuid",
      "module": "books",
      "resource": "books",
      "action": "create",
      "permissionString": "books.books.create"
    },
    // ... more permissions
  ],
  "structure": {
    "books": {
      "module": "books",
      "resources": ["books", "authors"],
      "actions": ["create", "read", "update", "delete"]
    }
  }
}
```

### GET /api/dev/role-permissions

Returns complete permission matrix:

```json
{
  "matrix": {
    "reader": {
      "permissions": ["books.books.read", "reviews.reviews.create"],
      "priority": 10,
      "hasWildcard": false
    },
    "admin": {
      "permissions": ["*"],
      "priority": 90,
      "hasWildcard": true
    }
  }
}
```

### GET /api/dev/current-role-info

Returns information about current effective role:

```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "actualRole": "reader"
  },
  "effectiveRole": "admin",
  "isImpersonating": true,
  "permissions": ["*"],
  "hasWildcard": true
}
```

### PUT /api/dev/role-permissions/:roleName

Update permissions for a role (SuperAdmin only, requires `ALLOW_PERMISSION_EDITING=true`):

**Request:**
```json
{
  "permissions": ["books.books.read", "books.books.create"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Permissions for role 'author' updated successfully",
  "role": "author",
  "permissions": ["books.books.read", "books.books.create"],
  "warning": "Changes are runtime-only and will be lost on server restart",
  "auditLog": {
    "changedBy": "admin@example.com",
    "effectiveRole": "admin",
    "timestamp": "2026-02-16T08:50:00.000Z"
  }
}
```

## Frontend Usage

### Using the DevMode Context

```typescript
import { useDevMode } from '@/contexts/DevModeContext';

function MyComponent() {
  const {
    isDevMode,              // Is dev mode enabled?
    availableRoles,         // Array of all roles
    activeRole,             // Currently active role
    setActiveRole,          // Function to switch roles
    isImpersonating,        // Are we impersonating?
    permissions,            // All available permissions
    permissionMatrix,       // Complete role-permission matrix
    currentRoleInfo,        // Info about current role
    refreshData,            // Refresh all dev data
    updateRolePermissions,  // Update role permissions
    allowPermissionEditing  // Can edit permissions?
  } = useDevMode();
  
  // Switch role
  const handleRoleChange = (role: string) => {
    setActiveRole(role);
  };
  
  return (
    <div>
      {isDevMode && (
        <div>
          Current Role: {activeRole}
          {isImpersonating && <span> (Impersonating)</span>}
        </div>
      )}
    </div>
  );
}
```

### Using the API Client

```typescript
import api from '@/lib/api';

// The API client automatically includes the x-dev-role header
const response = await api.get('/books');

// Set custom headers
import { setCustomHeader } from '@/lib/api';
setCustomHeader('x-custom-header', 'value');
```

## UI Components

### DevToolbar

The DevToolbar component is automatically rendered in the MainLayout when `DEV_MODE=true`.

It provides:
- **Role Switcher** - Dropdown to select active role
- **Permission Matrix Tab** - View all role-permission mappings
- **Current Role Tab** - View permissions for active role
- **System Info** - Display role/permission counts and user info

The toolbar appears as a purple button on the right side of the screen and expands into a full panel when clicked.

## Security Considerations

### Production Safety

1. **Automatic Disabling:**
   - When `NODE_ENV=production`, both `DEV_MODE` and `ALLOW_PERMISSION_EDITING` are forced to `false`
   - Dev toolbar never renders in production
   - All dev API endpoints return 403 Forbidden

2. **Header Validation:**
   - In production, any `x-dev-role` headers are ignored
   - Attempts to use dev headers in production are logged as security warnings

3. **Database Integrity:**
   - Role impersonation NEVER modifies the user_roles table
   - Changes are purely runtime and exist only in memory
   - Permission edits are volatile and lost on server restart

### Audit Trail

All permission changes are logged with complete audit information:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔐 PERMISSION CHANGE AUDIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Role:           moderator
Changed by:     admin@example.com
Effective role: admin
Impersonating:  NO
Timestamp:      2026-02-16T08:50:00.000Z
Old permissions: ["books.books.read","books.books.moderate"]
New permissions: ["books.books.read","books.books.moderate","reviews.reviews.moderate"]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Testing

Tests are included for core functionality:

```bash
# Run all tests
npm test

# Run specific tests
npm test -- src/test/system-flags.test.ts
npm test -- src/test/api-client.test.ts
```

## Troubleshooting

### Dev toolbar not appearing

1. Check that `VITE_DEV_MODE` is not set to `'false'`
2. Verify you're not in production mode
3. Check browser console for errors

### Role impersonation not working

1. Ensure backend `DEV_MODE=true`
2. Check that `x-dev-role` header is being sent (DevTools Network tab)
3. Verify backend logs show role switch message

### Permission editing disabled

1. Check `ALLOW_PERMISSION_EDITING` is `true` on both frontend and backend
2. Verify current effective role is `admin` or `superadmin`
3. Check backend logs for security warnings

### Dev endpoints returning 403

1. Ensure you're authenticated
2. Check `DEV_MODE` is enabled on backend
3. Verify you're not in production environment

## Best Practices

1. **Use for Development Only:**
   - Never enable dev mode in production
   - Always test with production flags before deploying

2. **Document Permission Changes:**
   - When editing permissions, document your changes
   - Remember changes are volatile

3. **Test All Roles:**
   - Use role impersonation to test all user journeys
   - Verify permission enforcement for each role

4. **Monitor Audit Logs:**
   - Regularly review permission change logs
   - Investigate any unexpected changes

## Future Enhancements

Potential improvements:

1. **Persistent Permission Editing:**
   - Add database persistence for permission changes
   - Implement permission versioning

2. **Role Creation:**
   - UI for creating new custom roles
   - Role priority management

3. **Permission Testing:**
   - Automated permission test generator
   - Permission coverage reports

4. **Enhanced Audit:**
   - Export audit logs to file
   - Permission change history view

5. **Multi-user Testing:**
   - Test with multiple simultaneous role impersonations
   - Simulate user interactions

## License

This feature is part of the Book Explorer application.
