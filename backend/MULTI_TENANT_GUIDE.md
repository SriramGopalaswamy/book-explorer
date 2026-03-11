# Multi-Tenant Architecture Guide

Complete guide for the multi-tenant customization system with settings, custom fields, features, and modules.

## Overview

The multi-tenant architecture provides:
- **Tenant Settings**: Organization-specific configuration
- **Custom Fields**: Add custom fields to any entity
- **Feature Flags**: Enable/disable features per tenant
- **Modules**: Enable/disable entire modules per tenant
- **Branding**: Custom logos, colors, and themes
- **Workflows**: Custom approval workflows
- **Integrations**: External service connections

## Database Schema

### Core Tables

1. **tenant_settings** - Organization-specific settings
2. **custom_fields** - Custom field definitions
3. **custom_field_values** - Custom field values per entity
4. **tenant_features** - Feature flags per organization
5. **tenant_modules** - Module enablement per organization
6. **tenant_branding** - Custom branding per organization
7. **tenant_workflows** - Custom workflows per organization
8. **tenant_integrations** - External integrations per organization

## Tenant Settings

### Setting Categories

Settings are organized by category:
- `general` - General organization settings
- `payroll` - Payroll configuration
- `hrms` - HR management settings
- `attendance` - Attendance tracking settings
- `performance` - Performance review settings
- `notifications` - Notification preferences
- `security` - Security settings

### Data Types

Supported data types:
- `string` - Text values
- `number` - Numeric values
- `boolean` - True/false flags
- `json` - Complex objects
- `date` - Date values

### API Examples

**Get all settings:**
```javascript
GET /api/tenant/settings

Response:
[
  {
    "id": "uuid",
    "organization_id": "uuid",
    "category": "general",
    "setting_key": "company_name",
    "setting_value": "Acme Corp",
    "data_type": "string"
  }
]
```

**Get settings by category:**
```javascript
GET /api/tenant/settings/payroll

Response:
{
  "pay_frequency": "bi-weekly",
  "overtime_multiplier": 1.5,
  "tax_calculation_method": "automatic"
}
```

**Update single setting:**
```javascript
PUT /api/tenant/settings/general/company_name
Body: { "value": "New Company Name" }

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "setting_key": "company_name",
    "setting_value": "New Company Name"
  }
}
```

**Bulk update settings:**
```javascript
POST /api/tenant/settings/bulk
Body: {
  "settings": [
    {
      "category": "payroll",
      "key": "pay_frequency",
      "value": "monthly",
      "dataType": "string"
    },
    {
      "category": "payroll",
      "key": "overtime_multiplier",
      "value": 2.0,
      "dataType": "number"
    }
  ]
}

Response:
{
  "success": true,
  "message": "2 settings updated successfully"
}
```

### Using Settings in Code

**In Service:**
```javascript
const TenantService = require('./services/TenantService');

// Get payroll settings
const payrollSettings = await tenantService.getSettingsByCategory(
  organizationId,
  'payroll'
);

const payFrequency = payrollSettings.pay_frequency; // "bi-weekly"
const overtimeMultiplier = payrollSettings.overtime_multiplier; // 1.5
```

**In Frontend:**
```javascript
// Fetch tenant config on app load
const response = await fetch('/api/tenant/config', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Tenant-ID': organizationId
  }
});

const config = await response.json();

// Access settings
const companyName = config.settings.general.company_name;
const payFrequency = config.settings.payroll.pay_frequency;
```

## Custom Fields

### Field Types

Supported field types:
- `text` - Single-line text
- `number` - Numeric input
- `date` - Date picker
- `select` - Single select dropdown
- `multi_select` - Multiple select
- `boolean` - Checkbox
- `file` - File upload

### Entity Types

You can add custom fields to any entity:
- `employee` - Employee profiles
- `department` - Departments
- `project` - Projects
- `leave_request` - Leave requests
- `expense` - Expense claims
- `timesheet` - Timesheets
- etc.

### Creating Custom Fields

**API Example:**
```javascript
POST /api/tenant/custom-fields
Body: {
  "entity_type": "employee",
  "field_name": "employee_tier",
  "field_label": "Employee Tier",
  "field_type": "select",
  "field_options": {
    "options": ["junior", "mid-level", "senior", "lead"]
  },
  "is_required": true,
  "is_searchable": true,
  "is_filterable": true,
  "display_order": 1,
  "help_text": "Select the employee's tier level"
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "field_name": "employee_tier",
    "field_label": "Employee Tier",
    "field_type": "select"
  }
}
```

**Field Name Rules:**
- Must be lowercase
- Use underscores for spaces
- Must start with a letter
- Only letters, numbers, and underscores
- Example: `employee_tier`, `start_date_override`

### Setting Custom Field Values

**For a specific entity:**
```javascript
POST /api/tenant/custom-fields/employee/{{employeeId}}/values
Body: {
  "fieldValues": {
    "employee_tier": "senior",
    "certification_date": "2024-01-15",
    "special_skills": ["react", "node", "aws"]
  }
}

Response:
{
  "success": true,
  "message": "Custom field values set successfully"
}
```

### Getting Custom Field Values

**Get all custom fields with values for an entity:**
```javascript
GET /api/tenant/custom-fields/employee/{{employeeId}}/values

Response:
[
  {
    "id": "uuid",
    "field_name": "employee_tier",
    "field_label": "Employee Tier",
    "field_type": "select",
    "field_options": {"options": ["junior", "mid-level", "senior", "lead"]},
    "field_value": "senior",
    "is_required": true
  },
  {
    "id": "uuid",
    "field_name": "certification_date",
    "field_label": "Certification Date",
    "field_type": "date",
    "field_value": "2024-01-15"
  }
]
```

### Using Custom Fields in Queries

**PostgreSQL function to get custom fields:**
```sql
SELECT grxbooks.get_entity_custom_fields(
  'org-id',
  'employee',
  'employee-id'
) as custom_fields;

-- Returns:
{
  "employee_tier": "senior",
  "certification_date": "2024-01-15",
  "special_skills": ["react", "node", "aws"]
}
```

**Join with main entity:**
```sql
SELECT
  e.*,
  grxbooks.get_entity_custom_fields(e.organization_id, 'employee', e.id) as custom_fields
FROM grxbooks.profiles e
WHERE e.organization_id = 'org-id';
```

### Validation Rules

Add validation rules to custom fields:
```javascript
{
  "field_name": "years_of_experience",
  "field_type": "number",
  "validation_rules": {
    "min": 0,
    "max": 50,
    "required": true
  }
}

{
  "field_name": "employee_email",
  "field_type": "text",
  "validation_rules": {
    "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
    "maxLength": 100
  }
}
```

## Feature Flags

### Feature System

Features can be enabled/disabled per organization:
- Control access to specific functionality
- Tier-based restrictions
- A/B testing capabilities
- Gradual rollout

### Available Features

Common features:
- `employee_management` - Basic employee CRUD
- `advanced_reporting` - Advanced analytics
- `payroll_processing` - Payroll module
- `performance_reviews` - Performance management
- `time_tracking` - Time and attendance
- `expense_management` - Expense tracking
- `document_management` - Document storage
- `api_access` - API access
- `custom_integrations` - Custom integrations
- `sso_login` - Single sign-on

### Tier Restrictions

Features can be restricted by subscription tier:
- `free` - Available to all
- `basic` - Requires basic or higher
- `pro` - Requires pro or higher
- `enterprise` - Enterprise only

### API Examples

**Get all features:**
```javascript
GET /api/tenant/features

Response:
[
  {
    "id": "uuid",
    "feature_key": "employee_management",
    "feature_name": "Employee Management",
    "is_enabled": true,
    "tier_restriction": "free"
  },
  {
    "id": "uuid",
    "feature_key": "advanced_reporting",
    "feature_name": "Advanced Reporting",
    "is_enabled": false,
    "tier_restriction": "pro"
  }
]
```

**Check if feature is enabled:**
```javascript
GET /api/tenant/features/advanced_reporting/enabled

Response:
{
  "success": true,
  "data": {
    "enabled": false
  }
}
```

**Toggle feature:**
```javascript
POST /api/tenant/features/advanced_reporting/toggle
Body: { "enabled": true }

Response:
{
  "success": true,
  "message": "Feature enabled successfully",
  "data": {
    "feature_key": "advanced_reporting",
    "is_enabled": true,
    "enabled_at": "2024-01-15T10:30:00Z",
    "enabled_by": "user-id"
  }
}
```

### Using Features in Code

**Check feature in backend:**
```javascript
const TenantService = require('./services/TenantService');

// Check if feature is enabled
const hasAdvancedReporting = await tenantService.isFeatureEnabled(
  organizationId,
  'advanced_reporting'
);

if (!hasAdvancedReporting) {
  throw new ForbiddenError('Advanced reporting not available on your plan');
}
```

**Feature guard middleware:**
```javascript
const featureGuard = (featureKey) => {
  return async (req, res, next) => {
    const isEnabled = await tenantService.isFeatureEnabled(
      req.tenant.id,
      featureKey
    );

    if (!isEnabled) {
      return res.status(403).json({
        success: false,
        message: `Feature '${featureKey}' is not enabled for your organization`
      });
    }

    next();
  };
};

// Use in routes
router.get('/advanced-reports',
  authMiddleware.authenticate,
  tenantMiddleware.resolveTenant,
  featureGuard('advanced_reporting'),
  reportsController.getAdvancedReports
);
```

**Check feature in frontend:**
```javascript
// In React component
const { config } = useTenantConfig();

const hasAdvancedReporting = config.features.includes('advanced_reporting');

return (
  <div>
    {hasAdvancedReporting && (
      <AdvancedReportsSection />
    )}
  </div>
);
```

## Complete Example: Adding Custom Field to Employees

### 1. Create Custom Field

```javascript
// As admin, create a custom field for employees
POST /api/tenant/custom-fields
Body: {
  "entity_type": "employee",
  "field_name": "emergency_contact",
  "field_label": "Emergency Contact",
  "field_type": "text",
  "is_required": true,
  "is_searchable": false,
  "display_order": 10,
  "help_text": "Emergency contact phone number"
}
```

### 2. Set Values When Creating Employee

```javascript
// Create employee with custom field
POST /api/employees
Body: {
  "full_name": "John Doe",
  "email": "john@company.com",
  "ms365_email": "john@company.com",
  "department": "Engineering",
  "custom_fields": {
    "emergency_contact": "+1-555-0123"
  }
}
```

### 3. Update Custom Field Value

```javascript
// Update emergency contact
POST /api/tenant/custom-fields/employee/{{employeeId}}/values
Body: {
  "fieldValues": {
    "emergency_contact": "+1-555-9999"
  }
}
```

### 4. Query with Custom Fields

```javascript
// Get employee with custom fields
GET /api/employees/{{employeeId}}

Response:
{
  "success": true,
  "data": {
    "id": "employee-id",
    "full_name": "John Doe",
    "email": "john@company.com",
    "department": "Engineering",
    "custom_fields": {
      "emergency_contact": "+1-555-9999",
      "employee_tier": "senior"
    }
  }
}
```

## Frontend Integration

### React Hook for Tenant Config

```javascript
// hooks/useTenantConfig.js
import { useEffect, useState } from 'react';

export function useTenantConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchConfig() {
      const response = await fetch('/api/tenant/config', {
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'X-Tenant-ID': getOrganizationId()
        }
      });

      const data = await response.json();
      setConfig(data.data);
      setLoading(false);
    }

    fetchConfig();
  }, []);

  return { config, loading };
}
```

### Feature Flag Component

```javascript
// components/FeatureFlag.jsx
import { useTenantConfig } from '../hooks/useTenantConfig';

export function FeatureFlag({ feature, children, fallback = null }) {
  const { config, loading } = useTenantConfig();

  if (loading) return null;

  const isEnabled = config?.features?.includes(feature);

  return isEnabled ? children : fallback;
}

// Usage:
<FeatureFlag feature="advanced_reporting">
  <AdvancedReportsSection />
</FeatureFlag>
```

### Custom Fields Form Component

```javascript
// components/CustomFieldsForm.jsx
import { useEffect, useState } from 'react';

export function CustomFieldsForm({ entityType, entityId, onSave }) {
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});

  useEffect(() => {
    // Fetch custom fields definition
    fetch(`/api/tenant/custom-fields/${entityType}`)
      .then(res => res.json())
      .then(data => setFields(data.data));

    // Fetch current values if editing
    if (entityId) {
      fetch(`/api/tenant/custom-fields/${entityType}/${entityId}/values`)
        .then(res => res.json())
        .then(data => {
          const vals = {};
          data.data.forEach(field => {
            vals[field.field_name] = field.field_value;
          });
          setValues(vals);
        });
    }
  }, [entityType, entityId]);

  const handleSave = async () => {
    await fetch(`/api/tenant/custom-fields/${entityType}/${entityId}/values`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldValues: values })
    });

    onSave?.();
  };

  return (
    <div>
      {fields.map(field => (
        <div key={field.id}>
          <label>{field.field_label}</label>
          {field.field_type === 'text' && (
            <input
              type="text"
              value={values[field.field_name] || ''}
              onChange={(e) => setValues({
                ...values,
                [field.field_name]: e.target.value
              })}
              required={field.is_required}
            />
          )}
          {field.field_type === 'select' && (
            <select
              value={values[field.field_name] || ''}
              onChange={(e) => setValues({
                ...values,
                [field.field_name]: e.target.value
              })}
            >
              {field.field_options.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
          {field.help_text && <small>{field.help_text}</small>}
        </div>
      ))}
      <button onClick={handleSave}>Save</button>
    </div>
  );
}
```

## Best Practices

### 1. Setting Naming Conventions

```javascript
// ✅ Good
"pay_frequency"
"overtime_multiplier"
"email_notifications_enabled"

// ❌ Bad
"PayFrequency"
"Overtime Multiplier"
"EmailNotifications"
```

### 2. Custom Field Limits

- Maximum 50 custom fields per entity type
- Field names max 255 characters
- Use meaningful display_order for logical grouping

### 3. Feature Flag Strategy

```javascript
// Use feature flags for:
// - New features in beta
// - Tier-restricted features
// - Gradual rollouts
// - A/B testing

// Don't use feature flags for:
// - Core functionality
// - Security features
// - Critical bug fixes
```

### 4. Performance Optimization

```javascript
// Cache tenant config on frontend
localStorage.setItem('tenant_config', JSON.stringify(config));

// Batch custom field updates
await tenantService.bulkSetCustomFieldValues(orgId, entityType, entityId, {
  field1: value1,
  field2: value2,
  field3: value3
});
```

## Migration Scripts

Run the migration to create all tables:

```bash
psql $DATABASE_URL -f backend/migrations/004_multi_tenant_architecture.sql
```

## Summary

The multi-tenant architecture provides complete customization capabilities:

✅ **Settings** - Organization-specific configuration
✅ **Custom Fields** - Extend any entity with custom data
✅ **Features** - Control access with feature flags
✅ **Modules** - Enable/disable entire modules
✅ **Tier Support** - Different features per subscription level
✅ **Full API** - Complete REST API for all operations
✅ **Frontend Hooks** - React integration ready
✅ **Type Safety** - Full validation and type checking
