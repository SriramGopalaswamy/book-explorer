# Middleware Guide

Complete guide for the authentication, security, and audit middleware stack.

## Overview

The middleware stack provides:
- **Authentication**: JWT validation with Supabase
- **Authorization**: Role-based and permission-based access control
- **Multi-tenancy**: Automatic tenant resolution and isolation
- **Rate Limiting**: Protection against abuse with tier-based limits
- **Audit Logging**: Comprehensive request and action logging
- **Security**: CORS, Helmet headers, XSS prevention, SQL injection detection
- **Error Handling**: Centralized error processing

## Middleware Order

The order of middleware is critical. Here's the recommended stack:

```javascript
const express = require('express');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const {
  SecurityMiddleware,
  RateLimiterMiddleware,
  AuthMiddleware,
  TenantMiddleware,
  PermissionMiddleware,
  AuditMiddleware,
  ErrorMiddleware
} = require('./middleware');

const app = express();

// 1. Security headers (first)
const securityMiddleware = new SecurityMiddleware();
app.use(securityMiddleware.helmetMiddleware());
app.use(securityMiddleware.corsMiddleware());
app.use(securityMiddleware.requestIdMiddleware());
app.use(securityMiddleware.securityResponseHeaders());

// 2. Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Security validation
app.use(securityMiddleware.sanitizeInputMiddleware());
app.use(securityMiddleware.preventParameterPollution());
app.use(securityMiddleware.sqlInjectionDetection());

// 4. Rate limiting (global)
const rateLimiter = new RateLimiterMiddleware(process.env.REDIS_URL);
app.use(rateLimiter.globalLimiter());

// 5. Audit logging (all requests)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const auditMiddleware = new AuditMiddleware(pool);
app.use(auditMiddleware.auditRequest);

// 6. Authentication (for protected routes)
const authMiddleware = new AuthMiddleware(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 7. Tenant resolution (after auth)
const tenantMiddleware = new TenantMiddleware(pool);

// 8. Permission checking
const permissionMiddleware = new PermissionMiddleware(pool);

// Mount your routes here...

// 9. 404 handler (before error handler)
app.use(ErrorMiddleware.notFoundHandler);

// 10. Error handler (last)
app.use(ErrorMiddleware.getErrorHandler());

// Setup global error handlers
ErrorMiddleware.setupGlobalHandlers();
```

## Authentication Middleware

### Basic Usage

```javascript
// Require authentication
app.get('/api/protected',
  authMiddleware.authenticate,
  (req, res) => {
    // req.user is available
    res.json({ user: req.user });
  }
);

// Optional authentication
app.get('/api/public',
  authMiddleware.optionalAuth,
  (req, res) => {
    // req.user may or may not be present
    res.json({ user: req.user || 'anonymous' });
  }
);

// API key authentication (for service-to-service)
app.post('/api/webhook',
  authMiddleware.validateApiKey,
  (req, res) => {
    // req.apiKeyAuth is true
    res.json({ received: true });
  }
);

// Require verified email
app.post('/api/sensitive',
  authMiddleware.authenticate,
  authMiddleware.requireVerifiedEmail,
  (req, res) => {
    res.json({ data: 'sensitive data' });
  }
);
```

### Token Refresh

```javascript
app.post('/api/auth/refresh',
  authMiddleware.refreshToken
);
```

## Permission Middleware

### Role-Based Access

```javascript
// Require specific role
app.get('/api/admin/dashboard',
  authMiddleware.authenticate,
  tenantMiddleware.resolveTenant,
  permissionMiddleware.hasRole('admin'),
  (req, res) => {
    // Only admins can access
  }
);

// Require any of multiple roles
app.get('/api/employees',
  authMiddleware.authenticate,
  tenantMiddleware.resolveTenant,
  permissionMiddleware.hasAnyRole(['admin', 'hr', 'manager']),
  (req, res) => {
    // Admin, HR, or Manager can access
  }
);

// Platform admin only
app.get('/api/platform/settings',
  authMiddleware.authenticate,
  permissionMiddleware.isPlatformAdmin(),
  (req, res) => {
    // Only super_admin can access
  }
);
```

### Ownership Checks

```javascript
// Only owner can access
app.get('/api/users/:id/profile',
  authMiddleware.authenticate,
  permissionMiddleware.isOwner('id'),
  (req, res) => {
    // User can only access their own profile
  }
);

// Owner OR admin can access
app.delete('/api/users/:id',
  authMiddleware.authenticate,
  tenantMiddleware.resolveTenant,
  permissionMiddleware.isOwnerOrHasRole('id', ['admin']),
  (req, res) => {
    // User can delete their own account OR admin can delete any
  }
);
```

### Permission-Based Access

```javascript
// Check specific permission
app.post('/api/reports/financial',
  authMiddleware.authenticate,
  tenantMiddleware.resolveTenant,
  permissionMiddleware.hasPermission('reports:financial:create'),
  (req, res) => {
    // User must have specific permission
  }
);
```

## Tenant Middleware

### Basic Resolution

```javascript
// Automatic tenant resolution
app.get('/api/data',
  authMiddleware.authenticate,
  tenantMiddleware.resolveTenant,
  tenantMiddleware.requireTenant,
  (req, res) => {
    // req.tenant and req.tenantId are available
    const { tenantId } = req;
  }
);

// Platform admin override
app.get('/api/admin/tenants/:id/data',
  authMiddleware.authenticate,
  tenantMiddleware.resolveTenantWithPlatformOverride,
  (req, res) => {
    // Platform admin can access any tenant
  }
);
```

### Tenant Resolution Methods

1. **X-Tenant-ID header** (highest priority)
```bash
curl -H "X-Tenant-ID: org-123" -H "Authorization: Bearer token" /api/data
```

2. **Subdomain**
```bash
# If MULTI_TENANT_SUBDOMAIN=true
curl https://acme.yourdomain.com/api/data
```

3. **Query parameter**
```bash
curl /api/data?tenant_id=org-123
```

4. **User's organization** (from profile)
```bash
# Automatically uses user's organization_id
curl -H "Authorization: Bearer token" /api/data
```

## Rate Limiting

### Different Limiters for Different Routes

```javascript
// Global rate limit (applied to all routes)
app.use(rateLimiter.globalLimiter());

// Authentication endpoints (stricter)
app.post('/api/auth/login',
  rateLimiter.authLimiter(),
  loginController.login
);

// API routes (moderate)
app.use('/api',
  rateLimiter.apiLimiter()
);

// Write operations (stricter than reads)
app.post('/api/users',
  authMiddleware.authenticate,
  rateLimiter.writeLimiter(),
  userController.create
);

// File uploads (very strict)
app.post('/api/upload',
  authMiddleware.authenticate,
  rateLimiter.uploadLimiter(),
  uploadController.upload
);

// Bulk operations (strictest)
app.post('/api/employees/bulk-import',
  authMiddleware.authenticate,
  rateLimiter.bulkOperationLimiter(),
  employeeController.bulkImport
);
```

### Tier-Based Limiting

```javascript
// Different limits based on subscription tier
app.use('/api',
  authMiddleware.authenticate,
  tenantMiddleware.resolveTenant,
  rateLimiter.tierBasedLimiter()
);
```

### Skip Limiting for Platform Admins

```javascript
app.use('/api',
  authMiddleware.authenticate,
  rateLimiter.skipForPlatformAdmins(
    rateLimiter.apiLimiter()
  )
);
```

### Custom Dynamic Limits

```javascript
app.post('/api/heavy-operation',
  authMiddleware.authenticate,
  tenantMiddleware.resolveTenant,
  rateLimiter.customLimiter(async (req) => {
    // Return dynamic limits based on request
    if (req.isPlatformAdmin) {
      return { windowMs: 60000, max: 1000 };
    }
    if (req.tenant.subscription_tier === 'enterprise') {
      return { windowMs: 60000, max: 100 };
    }
    return { windowMs: 60000, max: 10 };
  }),
  controller.heavyOperation
);
```

## Audit Logging

### Automatic Request Logging

```javascript
// All requests are logged automatically
app.use(auditMiddleware.auditRequest);
```

### Action-Specific Auditing

```javascript
// Audit CRUD operations
app.post('/api/employees',
  authMiddleware.authenticate,
  tenantMiddleware.resolveTenant,
  auditMiddleware.auditAction('CREATE', 'employee'),
  employeeController.create
);

app.put('/api/employees/:id',
  authMiddleware.authenticate,
  tenantMiddleware.resolveTenant,
  auditMiddleware.auditAction('UPDATE', 'employee'),
  employeeController.update
);

app.delete('/api/employees/:id',
  authMiddleware.authenticate,
  tenantMiddleware.resolveTenant,
  auditMiddleware.auditAction('DELETE', 'employee'),
  employeeController.delete
);
```

### Authentication Event Auditing

```javascript
app.post('/api/auth/login',
  auditMiddleware.auditAuth('login'),
  authController.login
);

app.post('/api/auth/logout',
  authMiddleware.authenticate,
  auditMiddleware.auditAuth('logout'),
  authController.logout
);
```

### Data Access Auditing

```javascript
// Audit access to sensitive data
app.get('/api/employees/:id/salary',
  authMiddleware.authenticate,
  tenantMiddleware.resolveTenant,
  permissionMiddleware.hasAnyRole(['admin', 'hr']),
  auditMiddleware.auditDataAccess('employee_salary', 'high'),
  employeeController.getSalary
);
```

### Retrieve Audit Logs

```javascript
app.get('/api/audit-logs',
  authMiddleware.authenticate,
  permissionMiddleware.hasRole('admin'),
  auditMiddleware.getAuditLogs
);
```

## Error Handling

### Throwing Errors

```javascript
const { NotFoundError, ValidationError, ConflictError } = require('./utils/errors');

// In controller or service
if (!user) {
  throw new NotFoundError('User not found');
}

if (emailExists) {
  throw new ConflictError('Email already exists', 'email');
}

const errors = [
  { field: 'email', message: 'Email is required' },
  { field: 'password', message: 'Password must be at least 8 characters' }
];
throw new ValidationError('Validation failed', errors);
```

### Async Route Handlers

```javascript
// Option 1: Use asyncHandler wrapper
app.get('/api/users',
  ErrorMiddleware.asyncHandler(async (req, res) => {
    const users = await userService.findAll();
    res.json({ users });
  })
);

// Option 2: Use controller's handleRequest (recommended)
app.get('/api/users',
  userController.getUsers.bind(userController)
);
```

## Complete Route Example

Here's a complete example with all middleware:

```javascript
const express = require('express');
const router = express.Router();

function createEmployeeRoutes(
  employeeController,
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware,
  rateLimiter,
  auditMiddleware
) {
  // Authentication for all routes
  router.use(authMiddleware.authenticate);

  // Tenant resolution for all routes
  router.use(tenantMiddleware.resolveTenant);
  router.use(tenantMiddleware.requireTenant);

  // List employees
  router.get('/',
    rateLimiter.apiLimiter(),
    permissionMiddleware.hasAnyRole(['admin', 'hr', 'manager']),
    employeeController.getEmployees.bind(employeeController)
  );

  // Get single employee
  router.get('/:id',
    permissionMiddleware.isOwnerOrHasRole('id', ['admin', 'hr', 'manager']),
    employeeController.getEmployee.bind(employeeController)
  );

  // Create employee
  router.post('/',
    rateLimiter.writeLimiter(),
    permissionMiddleware.hasAnyRole(['admin', 'hr']),
    auditMiddleware.auditAction('CREATE', 'employee'),
    employeeController.createEmployee.bind(employeeController)
  );

  // Update employee
  router.put('/:id',
    rateLimiter.writeLimiter(),
    permissionMiddleware.hasAnyRole(['admin', 'hr']),
    auditMiddleware.auditAction('UPDATE', 'employee'),
    employeeController.updateEmployee.bind(employeeController)
  );

  // Delete employee
  router.delete('/:id',
    permissionMiddleware.hasRole('admin'),
    auditMiddleware.auditAction('DELETE', 'employee'),
    employeeController.deleteEmployee.bind(employeeController)
  );

  // Bulk import
  router.post('/bulk-import',
    rateLimiter.bulkOperationLimiter(),
    permissionMiddleware.hasAnyRole(['admin', 'hr']),
    auditMiddleware.auditAction('BULK_IMPORT', 'employee'),
    employeeController.bulkImportEmployees.bind(employeeController)
  );

  return router;
}

module.exports = createEmployeeRoutes;
```

## Database Tables for Audit

Create these tables to store audit logs:

```sql
-- Basic request audit logs
CREATE TABLE grxbooks.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES grxbooks.organizations(id),
  method VARCHAR(10) NOT NULL,
  path TEXT NOT NULL,
  query_params JSONB,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON grxbooks.audit_logs(user_id);
CREATE INDEX idx_audit_logs_org ON grxbooks.audit_logs(organization_id);
CREATE INDEX idx_audit_logs_created ON grxbooks.audit_logs(created_at);

-- Action audit logs (CRUD operations)
CREATE TABLE grxbooks.action_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID,
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES grxbooks.organizations(id),
  changes JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_action_audit_user ON grxbooks.action_audit_logs(user_id);
CREATE INDEX idx_action_audit_resource ON grxbooks.action_audit_logs(resource_type, resource_id);
CREATE INDEX idx_action_audit_created ON grxbooks.action_audit_logs(created_at);

-- Authentication audit logs
CREATE TABLE grxbooks.auth_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  email VARCHAR(255),
  success BOOLEAN NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auth_audit_user ON grxbooks.auth_audit_logs(user_id);
CREATE INDEX idx_auth_audit_created ON grxbooks.auth_audit_logs(created_at);

-- Data access audit logs
CREATE TABLE grxbooks.data_access_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_type VARCHAR(100) NOT NULL,
  sensitivity_level VARCHAR(20) NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES grxbooks.organizations(id),
  resource_id UUID,
  action VARCHAR(50) NOT NULL,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_data_access_user ON grxbooks.data_access_audit_logs(user_id);
CREATE INDEX idx_data_access_created ON grxbooks.data_access_audit_logs(created_at);
```

## Environment Variables

Required environment variables:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Redis (for rate limiting)
REDIS_URL=redis://localhost:6379

# Security
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
MAX_REQUEST_SIZE=10485760

# API Keys (comma-separated)
VALID_API_KEYS=key1,key2,key3

# Multi-tenant
MULTI_TENANT_SUBDOMAIN=true

# Environment
NODE_ENV=production
LOG_LEVEL=info
```

## Best Practices

1. **Always authenticate before authorizing**
   ```javascript
   // ✅ Correct
   router.use(authMiddleware.authenticate);
   router.use(permissionMiddleware.hasRole('admin'));

   // ❌ Wrong
   router.use(permissionMiddleware.hasRole('admin')); // No user context
   ```

2. **Resolve tenant before permission checks**
   ```javascript
   // ✅ Correct
   router.use(authMiddleware.authenticate);
   router.use(tenantMiddleware.resolveTenant);
   router.use(permissionMiddleware.hasRole('admin'));
   ```

3. **Apply rate limiting early but after security**
   ```javascript
   app.use(securityMiddleware.corsMiddleware());
   app.use(rateLimiter.globalLimiter()); // After CORS, before routes
   ```

4. **Use specific error classes**
   ```javascript
   // ✅ Good
   throw new NotFoundError('User not found');

   // ❌ Bad
   throw new Error('User not found'); // Generic error
   ```

5. **Audit sensitive operations**
   ```javascript
   router.delete('/users/:id',
     auditMiddleware.auditAction('DELETE', 'user'), // Always audit deletes
     controller.delete
   );
   ```

## Testing Middleware

Example tests for middleware:

```javascript
const request = require('supertest');
const app = require('./app');

describe('Authentication Middleware', () => {
  it('should reject requests without token', async () => {
    const res = await request(app)
      .get('/api/protected')
      .expect(401);

    expect(res.body.message).toBe('Authorization token required');
  });

  it('should accept valid token', async () => {
    const token = 'valid-jwt-token';
    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
```
