/**
 * Permission Middleware
 *
 * Handles role-based and permission-based access control
 * Supports both organization roles and platform roles
 */

const { ForbiddenError, PermissionError } = require('../utils/errors');
const logger = require('../utils/logger');

class PermissionMiddleware {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Check if user has specific role
   * @param {String} requiredRole - Required role
   * @returns {Function} Express middleware
   */
  hasRole(requiredRole) {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          throw new ForbiddenError('Authentication required');
        }

        if (!req.tenant) {
          throw new ForbiddenError('Tenant context required');
        }

        // Check organization role
        const userRole = await this.getUserRole(req.user.id, req.tenant.id);

        if (userRole !== requiredRole) {
          logger.logSecurity('permission_denied', 'low', {
            userId: req.user.id,
            tenantId: req.tenant.id,
            requiredRole,
            userRole,
            path: req.path
          });
          throw new PermissionError(`Role '${requiredRole}' required`, requiredRole);
        }

        req.userRole = userRole;
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Check if user has any of the specified roles
   * @param {Array} allowedRoles - Array of allowed roles
   * @returns {Function} Express middleware
   */
  hasAnyRole(allowedRoles) {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          throw new ForbiddenError('Authentication required');
        }

        if (!req.tenant) {
          throw new ForbiddenError('Tenant context required');
        }

        // Check platform admin first (super admin)
        const platformRole = await this.getPlatformRole(req.user.id);
        if (platformRole === 'super_admin') {
          req.userRole = 'super_admin';
          req.isPlatformAdmin = true;
          return next();
        }

        // Check organization role
        const userRole = await this.getUserRole(req.user.id, req.tenant.id);

        if (!allowedRoles.includes(userRole)) {
          logger.logSecurity('permission_denied', 'low', {
            userId: req.user.id,
            tenantId: req.tenant.id,
            allowedRoles,
            userRole,
            path: req.path
          });
          throw new PermissionError(
            `One of the following roles required: ${allowedRoles.join(', ')}`,
            allowedRoles
          );
        }

        req.userRole = userRole;
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Check if user is platform admin (super admin)
   * @returns {Function} Express middleware
   */
  isPlatformAdmin() {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          throw new ForbiddenError('Authentication required');
        }

        const platformRole = await this.getPlatformRole(req.user.id);

        if (platformRole !== 'super_admin') {
          logger.logSecurity('platform_admin_required', 'medium', {
            userId: req.user.id,
            platformRole,
            path: req.path
          });
          throw new PermissionError('Platform administrator access required');
        }

        req.userRole = 'super_admin';
        req.isPlatformAdmin = true;
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Check if user owns the resource
   * @param {String} userIdParam - Parameter name containing user ID
   * @returns {Function} Express middleware
   */
  isOwner(userIdParam = 'id') {
    return (req, res, next) => {
      try {
        if (!req.user) {
          throw new ForbiddenError('Authentication required');
        }

        const resourceUserId = req.params[userIdParam];

        if (req.user.id !== resourceUserId) {
          logger.logSecurity('owner_access_denied', 'low', {
            userId: req.user.id,
            resourceUserId,
            path: req.path
          });
          throw new PermissionError('You can only access your own resources');
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Check if user is owner OR has specified role
   * @param {String} userIdParam - Parameter name containing user ID
   * @param {Array} allowedRoles - Array of allowed roles
   * @returns {Function} Express middleware
   */
  isOwnerOrHasRole(userIdParam = 'id', allowedRoles = ['admin']) {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          throw new ForbiddenError('Authentication required');
        }

        // Check if owner
        const resourceUserId = req.params[userIdParam];
        if (req.user.id === resourceUserId) {
          req.isOwner = true;
          return next();
        }

        // Check if has required role
        if (!req.tenant) {
          throw new ForbiddenError('Tenant context required');
        }

        // Check platform admin
        const platformRole = await this.getPlatformRole(req.user.id);
        if (platformRole === 'super_admin') {
          req.isPlatformAdmin = true;
          return next();
        }

        // Check organization role
        const userRole = await this.getUserRole(req.user.id, req.tenant.id);
        if (!allowedRoles.includes(userRole)) {
          logger.logSecurity('owner_or_role_denied', 'low', {
            userId: req.user.id,
            resourceUserId,
            userRole,
            allowedRoles,
            path: req.path
          });
          throw new PermissionError(
            `You must be the owner or have one of these roles: ${allowedRoles.join(', ')}`
          );
        }

        req.userRole = userRole;
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Check if user has specific permission
   * @param {String} permission - Permission name
   * @returns {Function} Express middleware
   */
  hasPermission(permission) {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          throw new ForbiddenError('Authentication required');
        }

        const hasPermission = await this.checkUserPermission(
          req.user.id,
          req.tenant?.id,
          permission
        );

        if (!hasPermission) {
          logger.logSecurity('permission_denied', 'low', {
            userId: req.user.id,
            tenantId: req.tenant?.id,
            permission,
            path: req.path
          });
          throw new PermissionError(`Permission '${permission}' required`, permission);
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Get user's organization role
   * @param {String} userId - User ID
   * @param {String} organizationId - Organization ID
   * @returns {Promise<String>} User role
   */
  async getUserRole(userId, organizationId) {
    try {
      const query = `
        SELECT role
        FROM grxbooks.user_roles
        WHERE user_id = $1
        AND organization_id = $2
        LIMIT 1
      `;

      const result = await this.pool.query(query, [userId, organizationId]);
      return result.rows[0]?.role || null;
    } catch (error) {
      logger.error('Error fetching user role:', error);
      return null;
    }
  }

  /**
   * Get user's platform role
   * @param {String} userId - User ID
   * @returns {Promise<String>} Platform role
   */
  async getPlatformRole(userId) {
    try {
      const query = `
        SELECT role
        FROM grxbooks.platform_roles
        WHERE user_id = $1
        LIMIT 1
      `;

      const result = await this.pool.query(query, [userId]);
      return result.rows[0]?.role || null;
    } catch (error) {
      logger.error('Error fetching platform role:', error);
      return null;
    }
  }

  /**
   * Check if user has specific permission
   * @param {String} userId - User ID
   * @param {String} organizationId - Organization ID
   * @param {String} permission - Permission name
   * @returns {Promise<Boolean>} Has permission
   */
  async checkUserPermission(userId, organizationId, permission) {
    try {
      // Platform admins have all permissions
      const platformRole = await this.getPlatformRole(userId);
      if (platformRole === 'super_admin') {
        return true;
      }

      // Check role-based permissions
      const query = `
        SELECT rp.permission
        FROM grxbooks.user_roles ur
        JOIN grxbooks.role_permissions rp ON ur.role = rp.role
        WHERE ur.user_id = $1
        AND ur.organization_id = $2
        AND rp.permission = $3
        LIMIT 1
      `;

      const result = await this.pool.query(query, [userId, organizationId, permission]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking user permission:', error);
      return false;
    }
  }
}

module.exports = PermissionMiddleware;
