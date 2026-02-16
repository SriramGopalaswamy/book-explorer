/**
 * RBAC Permission Middleware
 */

const PERMISSIONS = {
  books: {
    module: 'books',
    resources: ['books', 'authors', 'genres', 'collections'],
    actions: ['create', 'read', 'update', 'delete', 'publish', 'moderate']
  },
  reviews: {
    module: 'reviews', 
    resources: ['reviews', 'ratings'],
    actions: ['create', 'read', 'update', 'delete', 'moderate', 'report']
  },
  users: {
    module: 'users',
    resources: ['profiles', 'preferences', 'progress'],
    actions: ['create', 'read', 'update', 'delete']
  }
};

const ROLE_PERMISSIONS = {
  reader: [
    'books.books.read',
    'books.authors.read',
    'books.genres.read',
    'books.collections.read',
    'reviews.reviews.create',
    'reviews.reviews.read',
    'reviews.reviews.update',
    'reviews.ratings.create',
    'users.profiles.read',
    'users.profiles.update',
    'users.progress.create',
    'users.progress.update',
    'users.preferences.update'
  ],
  author: [
    'books.books.create',
    'books.books.read',
    'books.books.update',
    'books.authors.read',
    'books.authors.update',
    'books.genres.read',
    'reviews.reviews.read'
  ],
  moderator: [
    'books.books.read',
    'books.books.moderate',
    'books.authors.read',
    'reviews.reviews.read',
    'reviews.reviews.moderate',
    'reviews.reviews.delete',
    'users.profiles.read'
  ],
  admin: ['*'] // Admin has all permissions
};

/**
 * Check if user has required permission
 * @param {string} role - Role to check (can be effectiveRole or actualRole)
 * @param {string} requiredPermission - Permission string to check
 */
const hasPermission = (role, requiredPermission) => {
  const rolePermissions = ROLE_PERMISSIONS[role] || [];
  
  // Admin has all permissions
  if (rolePermissions.includes('*')) {
    return true;
  }
  
  // Check exact permission match
  if (rolePermissions.includes(requiredPermission)) {
    return true;
  }
  
  return false;
};

/**
 * Middleware to require specific permission
 * Uses effectiveRole if set (for dev mode impersonation), otherwise falls back to user.role
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'You must be logged in to access this resource.'
      });
    }
    
    // Use effectiveRole if available (set by resolveEffectiveRole middleware)
    // Otherwise fall back to user.role for backwards compatibility
    const roleToCheck = req.effectiveRole || req.user.role;
    
    if (!hasPermission(roleToCheck, permission)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `You do not have the required permission: ${permission}`,
        required: permission,
        effectiveRole: roleToCheck,
        isImpersonating: req.isImpersonating || false
      });
    }
    
    next();
  };
};

/**
 * Middleware to require authentication
 */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be logged in to access this resource.'
    });
  }
  next();
};

/**
 * Middleware to require admin role
 * Uses effectiveRole if set (for dev mode impersonation), otherwise falls back to user.role
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be logged in to access this resource.'
    });
  }
  
  // Use effectiveRole if available (set by resolveEffectiveRole middleware)
  // Otherwise fall back to user.role for backwards compatibility
  const roleToCheck = req.effectiveRole || req.user.role;
  
  if (roleToCheck !== 'admin') {
    return res.status(403).json({ 
      error: 'Admin access required',
      message: 'This resource requires administrator privileges.',
      effectiveRole: roleToCheck,
      isImpersonating: req.isImpersonating || false
    });
  }
  
  next();
};

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  requirePermission,
  requireAuth,
  requireAdmin
};
