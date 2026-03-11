# Backend Architecture

Modern, layered backend architecture following industry best practices.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        HTTP Request                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────▼─────────────┐
        │      Middleware Stack      │
        │  • CORS                    │
        │  • Helmet (Security)       │
        │  • Rate Limiter            │
        │  • JWT Validator           │
        │  • Tenant Resolver         │
        │  • Permission Guard        │
        │  • Audit Logger            │
        └─────────────┬──────────────┘
                      │
        ┌─────────────▼─────────────┐
        │    Controller Layer       │
        │  • HTTP concerns          │
        │  • Request validation     │
        │  • Response formatting    │
        │  • Error handling         │
        └─────────────┬──────────────┘
                      │
        ┌─────────────▼─────────────┐
        │     Service Layer         │
        │  • Business logic         │
        │  • Validation             │
        │  • Orchestration          │
        │  • Transaction mgmt       │
        └─────────────┬──────────────┘
                      │
        ┌─────────────▼─────────────┐
        │   Repository Layer        │
        │  • Database queries       │
        │  • Data access            │
        │  • Query building         │
        └─────────────┬──────────────┘
                      │
        ┌─────────────▼─────────────┐
        │      PostgreSQL DB        │
        │    (grxbooks schema)      │
        └───────────────────────────┘
```

## Layer Responsibilities

### Controller Layer
- **Location**: `src/controllers/`
- **Extends**: `BaseController`
- **Responsibilities**:
  - Handle HTTP requests/responses
  - Extract and validate request parameters
  - Call appropriate service methods
  - Format responses using ApiResponse helpers
  - HTTP error handling
- **Rules**:
  - NO business logic
  - NO direct database access
  - Only orchestrate service calls

**Example**:
```javascript
const BaseController = require('../core/BaseController');

class EmployeeController extends BaseController {
  constructor(employeeService) {
    super();
    this.employeeService = employeeService;
  }

  async getEmployees(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);
      const { page, limit } = this.getPaginationParams(req);

      const result = await this.employeeService.getOrganizationEmployees(
        tenant.id,
        { page, limit }
      );

      return this.paginated(res, result.data, result.pagination);
    })(req, res, next);
  }
}
```

### Service Layer
- **Location**: `src/services/`
- **Extends**: `BaseService`
- **Responsibilities**:
  - Business logic and rules
  - Data validation
  - Orchestrate repository calls
  - Transaction management
  - Audit logging
- **Rules**:
  - NO direct database queries
  - NO HTTP concerns
  - Use repositories for data access

**Example**:
```javascript
const BaseService = require('../core/BaseService');

class EmployeeService extends BaseService {
  constructor(employeeRepository) {
    super(employeeRepository);
    this.employeeRepository = employeeRepository;
  }

  async createEmployee(data, context) {
    // Validate business rules
    const emailExists = await this.employeeRepository.emailExists(
      data.email,
      context.tenantId
    );
    if (emailExists) {
      throw new ConflictError('Email already exists');
    }

    // Create employee
    const employee = await this.create(data, context);

    // Log business event
    logger.logBusiness('employee_created', { employeeId: employee.id });

    return employee;
  }
}
```

### Repository Layer
- **Location**: `src/repositories/`
- **Extends**: `BaseRepository`
- **Responsibilities**:
  - All database queries
  - Data access abstraction
  - Query building
  - Transaction support
- **Rules**:
  - ONLY layer that talks to database
  - NO business logic
  - Return raw data

**Example**:
```javascript
const BaseRepository = require('../core/BaseRepository');

class EmployeeRepository extends BaseRepository {
  constructor(pool) {
    super('profiles', pool); // Table name
  }

  async findByEmail(email, organizationId) {
    const fullTable = this.getFullTableName(); // grxbooks.profiles

    const query = `
      SELECT * FROM ${fullTable}
      WHERE email = $1
      AND organization_id = $2
      AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [email, organizationId]);
    return result.rows[0] || null;
  }
}
```

## Base Classes

### BaseController
Provides common HTTP response methods:
- `success(res, data, message, statusCode)` - Success response
- `created(res, data, message)` - Created response (201)
- `paginated(res, data, pagination)` - Paginated response
- `error(res, error, statusCode)` - Error response
- `validationError(res, errors)` - Validation error (400)
- `unauthorized(res, message)` - Unauthorized (401)
- `forbidden(res, message)` - Forbidden (403)
- `notFound(res, message)` - Not found (404)

Helper methods:
- `getPaginationParams(req)` - Extract pagination
- `getSortParams(req, defaultSort)` - Extract sorting
- `getFilterParams(req, allowedFilters)` - Extract filters
- `getCurrentUser(req)` - Get authenticated user
- `getCurrentTenant(req)` - Get current tenant

### BaseService
Provides common CRUD operations:
- `findAll(options)` - Find all with pagination
- `findById(id, options)` - Find by ID
- `findOne(criteria, options)` - Find one by criteria
- `create(data, context)` - Create record
- `update(id, data, context)` - Update record
- `delete(id, context)` - Soft delete record
- `hardDelete(id, context)` - Hard delete record
- `count(filters)` - Count records
- `exists(criteria)` - Check if exists
- `transaction(callback)` - Execute in transaction

Hooks for validation:
- `validateCreateData(data)` - Override in subclass
- `validateUpdateData(data)` - Override in subclass

### BaseRepository
Provides common database operations:
- `findAll(options)` - Find all with filters
- `findById(id, options)` - Find by ID
- `findOne(criteria, options)` - Find one
- `create(data)` - Insert record
- `update(id, data)` - Update record
- `softDelete(id, deletedBy)` - Soft delete
- `hardDelete(id)` - Hard delete
- `count(where)` - Count records
- `exists(criteria)` - Check existence
- `buildWhereClause(criteria)` - Build WHERE clause
- `executeQuery(query, values)` - Raw query
- `transaction(callback)` - Execute in transaction

All queries use `grxbooks` schema by default.

## Utilities

### ApiResponse (`src/utils/response.js`)
Standardized response format:
```javascript
const { ApiResponse } = require('../utils/response');

// Success
ApiResponse.success(data, message, statusCode);

// Error
ApiResponse.error(message, statusCode, errors);

// Paginated
ApiResponse.paginated(data, pagination);

// Validation error
ApiResponse.validationError(errors);
```

### Error Classes (`src/utils/errors.js`)
Custom error hierarchy:
- `AppError` - Base error
- `ValidationError` - Validation failures (400)
- `UnauthorizedError` - Auth required (401)
- `ForbiddenError` - Access forbidden (403)
- `NotFoundError` - Resource not found (404)
- `ConflictError` - Resource conflict (409)
- `RateLimitError` - Too many requests (429)
- `DatabaseError` - DB operation failed (500)
- `BusinessLogicError` - Business rule violation (422)

### Logger (`src/utils/logger.js`)
Structured logging with Winston:
```javascript
const logger = require('../utils/logger');

logger.info('Message', { meta: 'data' });
logger.error('Error occurred', error);
logger.logRequest(req, statusCode, duration);
logger.logAudit(action, resource, context, details);
logger.logBusiness(event, data);
```

## Creating New Modules

### Step 1: Create Repository
```javascript
// src/repositories/YourRepository.js
const BaseRepository = require('../core/BaseRepository');

class YourRepository extends BaseRepository {
  constructor(pool) {
    super('your_table_name', pool);
  }

  // Add custom queries
  async findByCustomCriteria(criteria) {
    // Implementation
  }
}

module.exports = YourRepository;
```

### Step 2: Create Service
```javascript
// src/services/YourService.js
const BaseService = require('../core/BaseService');
const { ValidationError } = require('../utils/errors');

class YourService extends BaseService {
  constructor(yourRepository) {
    super(yourRepository);
    this.yourRepository = yourRepository;
  }

  // Add business logic methods
  async customBusinessLogic(data, context) {
    // Validation
    // Business rules
    // Call repository
  }

  validateCreateData(data) {
    // Validation logic
  }
}

module.exports = YourService;
```

### Step 3: Create Controller
```javascript
// src/controllers/YourController.js
const BaseController = require('../core/BaseController');

class YourController extends BaseController {
  constructor(yourService) {
    super();
    this.yourService = yourService;
  }

  async getItems(req, res, next) {
    return this.handleRequest(async (req, res) => {
      const tenant = this.getCurrentTenant(req);
      const items = await this.yourService.getItems(tenant.id);
      return this.success(res, items);
    })(req, res, next);
  }
}

module.exports = YourController;
```

### Step 4: Create Routes
```javascript
// src/routes/yourRoutes.js
const express = require('express');
const router = express.Router();

function createYourRoutes(yourController, authMiddleware, permissionMiddleware) {
  router.use(authMiddleware.authenticate);

  router.get('/',
    permissionMiddleware.hasAnyRole(['admin']),
    yourController.getItems.bind(yourController)
  );

  return router;
}

module.exports = createYourRoutes;
```

### Step 5: Wire in Main App
```javascript
// src/app.js or src/server.js
const YourRepository = require('./repositories/YourRepository');
const YourService = require('./services/YourService');
const YourController = require('./controllers/YourController');
const createYourRoutes = require('./routes/yourRoutes');

// Initialize
const yourRepository = new YourRepository(pool);
const yourService = new YourService(yourRepository);
const yourController = new YourController(yourService);
const yourRoutes = createYourRoutes(yourController, authMiddleware, permissionMiddleware);

// Mount routes
app.use('/api/your-resource', yourRoutes);
```

## Best Practices

### 1. Separation of Concerns
- Controllers handle HTTP only
- Services contain business logic only
- Repositories handle database only

### 2. Error Handling
```javascript
// In Service
if (emailExists) {
  throw new ConflictError('Email already exists', 'email');
}

// In Controller - errors are caught by handleRequest
return this.handleRequest(async (req, res) => {
  const result = await this.service.method();
  return this.success(res, result);
})(req, res, next);
```

### 3. Validation
```javascript
// In Service
validateCreateData(data) {
  const errors = [];

  if (!data.field) {
    errors.push({ field: 'field', message: 'Field is required' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }
}
```

### 4. Logging
```javascript
// Log business events
logger.logBusiness('user_created', { userId, organizationId });

// Log audit trail
logger.logAudit('UPDATE', resourceId, context, { changes });

// Log errors with context
logger.logError(error, { userId, action: 'createEmployee' });
```

### 5. Transactions
```javascript
// In Service
async complexOperation(data, context) {
  return await this.transaction(async (client) => {
    // All queries within this block use the same transaction
    const result1 = await this.repository.create(data1);
    const result2 = await this.otherRepository.create(data2);
    return { result1, result2 };
  });
}
```

## Multi-Tenant Support

All services automatically support multi-tenancy through context:

```javascript
const context = {
  userId: req.user.id,
  tenantId: req.tenant.id,
  auditLog: true
};

await service.create(data, context);
```

BaseService automatically adds `organization_id` to all create operations.

## Next Steps

1. **Phase 3**: Implement Authentication & Security Middleware
   - JWT validation
   - Permission guards
   - Rate limiting
   - Audit logging

2. **Phase 4**: Multi-Tenant Architecture
   - Tenant settings
   - Custom fields
   - Feature flags

3. **Phase 5**: Database Optimizations
   - Indexes
   - RLS improvements
   - Performance tuning

See `MODERNIZATION_PLAN.md` for complete roadmap.
