/**
 * Developer Mode API Routes
 * 
 * Provides endpoints for:
 * - Role introspection
 * - Permission matrix debugging
 * - Live role-permission governance
 * - SuperAdmin permission editing
 * 
 * Security:
 * - Only available when DEV_MODE=true
 * - All endpoints require authentication
 * - Permission editing requires SuperAdmin + ALLOW_PERMISSION_EDITING
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../auth/middleware/permissions');
const { DEV_MODE, ALLOW_PERMISSION_EDITING } = require('../../config/systemFlags');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../../auth/middleware/permissions');
const Role = require('../security/role.model');
const Permission = require('../security/permission.model');

/**
 * Middleware to ensure dev mode is enabled
 */
const requireDevMode = (req, res, next) => {
  if (!DEV_MODE) {
    return res.status(403).json({
      error: 'Developer mode disabled',
      message: 'Developer tools are not available in this environment.'
    });
  }
  next();
};

/**
 * Middleware to require SuperAdmin role for sensitive operations
 */
const requireSuperAdmin = (req, res, next) => {
  const roleToCheck = req.effectiveRole || req.user?.role;
  
  // Check for SuperAdmin or admin role
  if (roleToCheck !== 'admin' && roleToCheck !== 'superadmin') {
    return res.status(403).json({
      error: 'SuperAdmin access required',
      message: 'This operation requires SuperAdmin privileges.',
      effectiveRole: roleToCheck
    });
  }
  next();
};

/**
 * Validate role name against known roles
 */
const isValidRole = (roleName) => {
  return ROLE_PERMISSIONS.hasOwnProperty(roleName);
};

/**
 * Validate permission string format
 */
const isValidPermission = (permission) => {
  // Wildcard is valid
  if (permission === '*') return true;
  
  // Check format: module.resource.action
  const parts = permission.split('.');
  if (parts.length !== 3) return false;
  
  // Check against known modules
  const [module, resource, action] = parts;
  const modulePerms = PERMISSIONS[module];
  if (!modulePerms) return false;
  
  return true;
};

/**
 * GET /api/dev/system-flags
 * Returns current system flags
 */
router.get('/system-flags', requireAuth, requireDevMode, (req, res) => {
  res.json({
    DEV_MODE,
    ALLOW_PERMISSION_EDITING,
    NODE_ENV: process.env.NODE_ENV || 'development',
    effectiveRole: req.effectiveRole || req.user?.role,
    isImpersonating: req.isImpersonating || false
  });
});

/**
 * GET /api/dev/roles
 * Returns all roles with their permissions and metadata
 */
router.get('/roles', requireAuth, requireDevMode, async (req, res) => {
  try {
    // Get roles from database
    const dbRoles = await Role.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']]
    });
    
    // Merge with hardcoded role permissions
    const roles = Object.keys(ROLE_PERMISSIONS).map(roleName => {
      const dbRole = dbRoles.find(r => r.name.toLowerCase() === roleName.toLowerCase());
      
      return {
        name: roleName,
        permissions: ROLE_PERMISSIONS[roleName],
        priority: getPriorityForRole(roleName),
        description: dbRole?.description || `${roleName.charAt(0).toUpperCase() + roleName.slice(1)} role`,
        isSystemRole: true,
        ...(dbRole ? { id: dbRole.id } : {})
      };
    });
    
    // Sort by priority (highest first)
    roles.sort((a, b) => b.priority - a.priority);
    
    res.json({ roles });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ 
      error: 'Failed to fetch roles', 
      details: error.message 
    });
  }
});

/**
 * Helper function to determine role priority
 */
function getPriorityForRole(roleName) {
  const priorities = {
    'superadmin': 100,
    'admin': 90,
    'moderator': 50,
    'author': 40,
    'reader': 10
  };
  return priorities[roleName.toLowerCase()] || 0;
}

/**
 * GET /api/dev/permissions
 * Returns all available permissions
 */
router.get('/permissions', requireAuth, requireDevMode, async (req, res) => {
  try {
    // Get permissions from database
    const dbPermissions = await Permission.findAll({
      where: { isActive: true },
      order: [['module', 'ASC'], ['resource', 'ASC'], ['action', 'ASC']]
    });
    
    // Also include hardcoded permissions structure
    const permissionsStructure = PERMISSIONS;
    
    res.json({ 
      permissions: dbPermissions.map(p => ({
        id: p.id,
        module: p.module,
        resource: p.resource,
        action: p.action,
        permissionString: p.getPermissionString(),
        description: p.description
      })),
      structure: permissionsStructure
    });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch permissions', 
      details: error.message 
    });
  }
});

/**
 * GET /api/dev/role-permissions
 * Returns complete role-permission matrix
 */
router.get('/role-permissions', requireAuth, requireDevMode, (req, res) => {
  try {
    const matrix = {};
    
    // Build matrix from ROLE_PERMISSIONS
    Object.keys(ROLE_PERMISSIONS).forEach(role => {
      matrix[role] = {
        permissions: ROLE_PERMISSIONS[role],
        priority: getPriorityForRole(role),
        hasWildcard: ROLE_PERMISSIONS[role].includes('*')
      };
    });
    
    res.json({ 
      matrix,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error building permission matrix:', error);
    res.status(500).json({ 
      error: 'Failed to build permission matrix', 
      details: error.message 
    });
  }
});

/**
 * GET /api/dev/current-role-info
 * Returns information about the current effective role
 */
router.get('/current-role-info', requireAuth, requireDevMode, (req, res) => {
  const actualRole = req.user?.role;
  const effectiveRole = req.effectiveRole || actualRole;
  
  res.json({
    user: {
      id: req.user?.id,
      email: req.user?.email,
      actualRole
    },
    effectiveRole,
    isImpersonating: req.isImpersonating || false,
    permissions: ROLE_PERMISSIONS[effectiveRole] || [],
    hasWildcard: ROLE_PERMISSIONS[effectiveRole]?.includes('*') || false
  });
});

/**
 * PUT /api/dev/role-permissions/:roleName
 * Update role permissions (SuperAdmin only, requires ALLOW_PERMISSION_EDITING)
 * 
 * NOTE: This modifies the RUNTIME permissions only, not the database
 * For production-grade persistence, this should write to database and reload
 */
router.put('/role-permissions/:roleName', requireAuth, requireDevMode, requireSuperAdmin, (req, res) => {
  if (!ALLOW_PERMISSION_EDITING) {
    return res.status(403).json({
      error: 'Permission editing disabled',
      message: 'Runtime permission editing is disabled in this environment.'
    });
  }
  
  try {
    const { roleName } = req.params;
    const { permissions } = req.body;
    
    if (!isValidRole(roleName)) {
      return res.status(404).json({
        error: 'Role not found',
        message: `Role '${roleName}' does not exist.`
      });
    }
    
    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        error: 'Invalid permissions format',
        message: 'Permissions must be an array of permission strings.'
      });
    }
    
    // Validate each permission
    const invalidPermissions = permissions.filter(p => !isValidPermission(p));
    if (invalidPermissions.length > 0) {
      return res.status(400).json({
        error: 'Invalid permissions',
        message: 'Some permissions have invalid format.',
        invalidPermissions
      });
    }
    
    // Audit log
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 PERMISSION CHANGE AUDIT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Role:           ${roleName}`);
    console.log(`Changed by:     ${req.user?.email || req.user?.id}`);
    console.log(`Effective role: ${req.effectiveRole || req.user?.role}`);
    console.log(`Impersonating:  ${req.isImpersonating ? 'YES' : 'NO'}`);
    console.log(`Timestamp:      ${new Date().toISOString()}`);
    console.log(`Old permissions: ${JSON.stringify(ROLE_PERMISSIONS[roleName])}`);
    console.log(`New permissions: ${JSON.stringify(permissions)}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Update runtime permissions
    // WARNING: This is volatile - changes lost on server restart
    ROLE_PERMISSIONS[roleName] = permissions;
    
    res.json({
      success: true,
      message: `Permissions for role '${roleName}' updated successfully`,
      role: roleName,
      permissions,
      warning: 'Changes are runtime-only and will be lost on server restart',
      auditLog: {
        changedBy: req.user?.email || req.user?.id,
        effectiveRole: req.effectiveRole || req.user?.role,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error updating role permissions:', error);
    res.status(500).json({ 
      error: 'Failed to update role permissions', 
      details: error.message 
    });
  }
});

module.exports = router;
