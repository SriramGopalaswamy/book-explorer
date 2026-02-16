# Association Architecture & Best Practices

## Overview
This document outlines the Sequelize association architecture for the Book Explorer backend and provides guidelines to prevent common errors like `SequelizeAssociationError: duplicate alias`.

## Current Association Architecture

### Association Definition Location
**File:** `backend/src/modules/index.js`

All model associations are defined in a single, centralized location with a guard mechanism to prevent duplicate initialization.

### Initialization Guard Pattern
```javascript
let associationsInitialized = false;

function initializeAssociations() {
  if (associationsInitialized) {
    console.log('ℹ️  Associations already initialized, skipping...');
    return;
  }
  
  // Define associations here...
  
  associationsInitialized = true;
  console.log('✓ Core models initialized successfully');
}
```

### Currently Defined Associations

| Source Model      | Target Model       | Type       | Alias              | Foreign Key     |
|-------------------|--------------------|------------|--------------------|-----------------|
| User              | Review             | hasMany    | reviews            | userId          |
| User              | FinancialRecord    | hasMany    | financialRecords   | userId          |
| Author            | Book               | hasMany    | books              | authorId        |
| Book              | Author             | belongsTo  | author             | authorId        |
| Book              | Review             | hasMany    | reviews            | bookId          |
| Review            | Book               | belongsTo  | book               | bookId          |
| Review            | User               | belongsTo  | user               | userId          |
| FinancialRecord   | User               | belongsTo  | user               | userId          |

## Critical Rules to Prevent Duplicate Alias Errors

### Rule 1: Unique Aliases Per Model
Each model can only use an alias once. Attempting to use the same alias twice will cause:
```
SequelizeAssociationError: You have used the alias `X` in two separate associations. 
Aliased associations must have unique aliases.
```

✅ **CORRECT:**
```javascript
Role.belongsToMany(Permission, { 
  through: 'role_permissions',
  as: 'permissions',
  foreignKey: 'roleId' 
});

Role.belongsToMany(ModulePermission, { 
  through: 'role_module_permissions',
  as: 'modulePermissions',  // Different alias!
  foreignKey: 'roleId' 
});
```

❌ **INCORRECT:**
```javascript
Role.belongsToMany(Permission, { 
  through: 'role_permissions',
  as: 'permissions',
  foreignKey: 'roleId' 
});

Role.belongsToMany(Permission, { 
  through: 'role_table_permissions',
  as: 'permissions',  // ❌ DUPLICATE ALIAS!
  foreignKey: 'roleId' 
});
```

### Rule 2: Avoid Alias/Field Name Conflicts

**⚠️ IMPORTANT:** The Role model has a JSON field named `permissions` (role.model.js, line 21-24):
```javascript
permissions: {
  type: DataTypes.JSON,
  defaultValue: []
}
```

**DO NOT** create a belongsToMany association with the alias `permissions` on the Role model, as it will conflict with this field.

If you need to add a Role-Permission many-to-many relationship, use one of these approaches:

✅ **Option A: Different Alias**
```javascript
Role.belongsToMany(Permission, {
  through: 'role_permissions',
  as: 'permissionRecords',  // Different from the 'permissions' field
  foreignKey: 'roleId'
});
```

✅ **Option B: Rename the JSON Field**
```javascript
// In role.model.js
permissionStrings: {  // Renamed from 'permissions'
  type: DataTypes.JSON,
  defaultValue: []
}
```

### Rule 3: Bidirectional Associations Need Different Aliases

For many-to-many relationships, each side needs its own unique alias:

```javascript
// Role side
Role.belongsToMany(Permission, {
  through: 'role_permissions',
  as: 'permissionRecords',    // Role → Permission
  foreignKey: 'roleId',
  otherKey: 'permissionId'
});

// Permission side
Permission.belongsToMany(Role, {
  through: 'role_permissions',
  as: 'roles',                // Permission → Role
  foreignKey: 'permissionId',
  otherKey: 'roleId'
});
```

### Rule 4: Single Point of Association Definition

All associations MUST be defined in `backend/src/modules/index.js`. 

**DO NOT** define associations:
- Inside model files
- Inside route handlers
- Inside controllers
- Inside seeders or migrations
- In environment-specific code blocks

### Rule 5: Use the Initialization Guard

Always define associations inside the `initializeAssociations()` function to ensure they are only registered once, even if the module is required multiple times.

## Model Import Best Practices

### ✅ CORRECT: Import from index.js
```javascript
const { User, Book, Review } = require('../modules');
```

### ⚠️ ACCEPTABLE: Direct import (for individual models)
```javascript
const User = require('../modules/users/user.model');
```

### ❌ AVOID: Multiple association definitions
```javascript
// DON'T do this in multiple files:
User.hasMany(Review, { as: 'reviews' });
```

## Troubleshooting Duplicate Alias Errors

If you encounter:
```
SequelizeAssociationError: You have used the alias `X` in two separate associations.
```

### Checklist:
1. ✓ Search for the alias in `backend/src/modules/index.js`
2. ✓ Check if any model has a field with the same name as the alias
3. ✓ Verify the association is only defined once
4. ✓ Ensure no associations are defined outside `index.js`
5. ✓ Check that the initialization guard is in place
6. ✓ Look for circular imports that might cause re-initialization

### Debug Commands:
```bash
# Search for a specific alias
cd backend
grep -rn "as: 'permissions'" --include="*.js" .

# Find all association definitions
grep -rn "belongsToMany\|hasMany\|hasOne" --include="*.js" src/

# Check if models are imported multiple times
grep -rn "require.*modules" --include="*.js" src/
```

## Testing Association Initialization

### Test 1: Single Load
```bash
cd backend
node -e "
  const models = require('./src/modules');
  console.log('Models loaded successfully');
"
```

Expected output:
```
🔗 Initializing model associations...
✓ Core models initialized successfully
Models loaded successfully
```

### Test 2: Multiple Loads (Guard Test)
```bash
cd backend
node -e "
  require('./src/modules');
  require('./src/modules');
  require('./src/modules');
  console.log('No duplicate alias errors!');
"
```

Expected output:
```
🔗 Initializing model associations...
✓ Core models initialized successfully
No duplicate alias errors!
```

Note: Guard prevents re-initialization after first load. Subsequent requires execute silently without re-initializing associations or cluttering logs.

### Test 3: Production Mode
```bash
cd backend
NODE_ENV=production DATABASE_URL=postgres://localhost/test npm start
```

Expected output:
```
📊 DATABASE: PostgreSQL (Production)
🔗 Initializing model associations...
✓ Core models initialized successfully
```

## Future Enhancements

If you need to add new associations:

1. ✅ Add them to `initializeAssociations()` in `backend/src/modules/index.js`
2. ✅ Use unique aliases that don't conflict with model fields
3. ✅ Document them in this file
4. ✅ Test with multiple requires to ensure guard works
5. ✅ Update the association table in this document

## Security Considerations

- Associations define data relationships that affect authorization
- Changes to associations can affect who can access what data
- Always review security implications before modifying associations
- Test RBAC permissions after association changes

## References

- Sequelize Associations: https://sequelize.org/docs/v6/core-concepts/assocs/
- Sequelize Association Errors: https://sequelize.org/docs/v6/other-topics/errors/
