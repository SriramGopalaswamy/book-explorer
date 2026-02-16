/**
 * Effective Role Resolution Middleware
 * 
 * Implements runtime role impersonation for development/debugging WITHOUT modifying database.
 * 
 * Architecture:
 * - In DEV_MODE: Reads x-dev-role header to override user's actual role
 * - Sets req.effectiveRole for all downstream middleware
 * - Marks req.isImpersonating flag for audit trails
 * - NEVER modifies user_roles table
 * 
 * Usage:
 * 1. Client sends header: x-dev-role: admin
 * 2. Middleware sets: req.effectiveRole = 'admin', req.isImpersonating = true
 * 3. Permission checks use: req.effectiveRole (not req.user.role)
 */

const { DEV_MODE } = require('../../config/systemFlags');
const { ROLE_PERMISSIONS } = require('./permissions');

/**
 * Validate role name against known roles
 */
const isValidRole = (roleName) => {
  return ROLE_PERMISSIONS.hasOwnProperty(roleName.toLowerCase());
};

/**
 * Resolve the effective role for the current request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const resolveEffectiveRole = (req, res, next) => {
  // Initialize flags
  req.isImpersonating = false;
  req.effectiveRole = null;
  
  console.log('🔍 RESOLVE EFFECTIVE ROLE');
  console.log('   Path:', req.method, req.path);
  console.log('   User:', req.user ? `${req.user.email} (${req.user.role})` : 'null');
  
  // If user is not authenticated, skip role resolution
  if (!req.user) {
    console.log('   ❌ No user authenticated, skipping role resolution');
    return next();
  }
  
  // Get actual user role from database/session
  const actualRole = req.user.role;
  console.log('   Actual role:', actualRole);
  
  // Check for dev mode role override
  if (DEV_MODE) {
    const devRoleHeader = req.get('x-dev-role');
    console.log('   DEV_MODE active:', DEV_MODE);
    console.log('   x-dev-role header:', devRoleHeader || '(not set)');
    
    if (devRoleHeader && devRoleHeader.trim()) {
      const requestedRole = devRoleHeader.trim().toLowerCase();
      
      // Validate role name against known roles
      if (isValidRole(requestedRole)) {
        // Use header role for impersonation
        req.effectiveRole = requestedRole;
        req.isImpersonating = true;
        
        // Log role switch for audit trail
        console.log(`   ✓ Role impersonation: ${actualRole} → ${req.effectiveRole}`);
        console.log(`🔄 DEV ROLE SWITCH → ${req.effectiveRole} (actual: ${actualRole}, user: ${req.user.id || req.user.email})`);
      } else {
        // Invalid role requested - log warning and use actual role
        console.warn(`   ⚠️  Invalid role '${requestedRole}' requested for impersonation (user: ${req.user.id || req.user.email})`);
        req.effectiveRole = actualRole;
      }
    } else {
      // No impersonation, use actual role
      console.log('   Using actual role (no impersonation)');
      req.effectiveRole = actualRole;
    }
  } else {
    // Production mode: ALWAYS use actual role, ignore any headers
    console.log('   DEV_MODE disabled, using actual role');
    req.effectiveRole = actualRole;
    
    // Security: Log any attempts to use dev headers in production
    const devRoleHeader = req.get('x-dev-role');
    if (devRoleHeader) {
      console.warn(`⚠️  SECURITY: Attempted role impersonation in production mode (user: ${req.user.id || req.user.email}, attempted role: ${devRoleHeader})`);
    }
  }
  
  console.log('   Final effective role:', req.effectiveRole);
  next();
};

/**
 * Get effective role info for current request
 * Utility function for debugging/logging
 */
const getEffectiveRoleInfo = (req) => {
  return {
    effectiveRole: req.effectiveRole,
    actualRole: req.user?.role,
    isImpersonating: req.isImpersonating,
    userId: req.user?.id || req.user?.email
  };
};

module.exports = {
  resolveEffectiveRole,
  getEffectiveRoleInfo
};
