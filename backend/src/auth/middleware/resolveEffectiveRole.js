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

const { DEV_MODE } = require('../config/systemFlags');

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
  
  // If user is not authenticated, skip role resolution
  if (!req.user) {
    return next();
  }
  
  // Get actual user role from database/session
  const actualRole = req.user.role;
  
  // Check for dev mode role override
  if (DEV_MODE) {
    const devRoleHeader = req.get('x-dev-role');
    
    if (devRoleHeader && devRoleHeader.trim()) {
      // Use header role for impersonation
      req.effectiveRole = devRoleHeader.trim().toLowerCase();
      req.isImpersonating = true;
      
      // Log role switch for audit trail
      console.log(`🔄 DEV ROLE SWITCH → ${req.effectiveRole} (actual: ${actualRole}, user: ${req.user.id || req.user.email})`);
    } else {
      // No impersonation, use actual role
      req.effectiveRole = actualRole;
    }
  } else {
    // Production mode: ALWAYS use actual role, ignore any headers
    req.effectiveRole = actualRole;
    
    // Security: Log any attempts to use dev headers in production
    const devRoleHeader = req.get('x-dev-role');
    if (devRoleHeader) {
      console.warn(`⚠️  SECURITY: Attempted role impersonation in production mode (user: ${req.user.id || req.user.email}, attempted role: ${devRoleHeader})`);
    }
  }
  
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
