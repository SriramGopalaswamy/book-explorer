/**
 * Tenant Middleware
 *
 * Resolves tenant/organization context for multi-tenant requests
 * Attaches tenant information to request object
 */

const { TenantError } = require('../utils/errors');
const logger = require('../utils/logger');

class TenantMiddleware {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Resolve tenant from request
   * Supports multiple resolution strategies:
   * 1. X-Tenant-ID header
   * 2. subdomain
   * 3. user's default organization
   * 4. Query parameter
   */
  resolveTenant = async (req, res, next) => {
    try {
      if (!req.user) {
        // Tenant resolution requires authentication
        return next();
      }

      let tenantId = null;
      let resolutionMethod = null;

      // Strategy 1: X-Tenant-ID header (highest priority)
      if (req.headers['x-tenant-id']) {
        tenantId = req.headers['x-tenant-id'];
        resolutionMethod = 'header';
      }

      // Strategy 2: Subdomain
      if (!tenantId && process.env.MULTI_TENANT_SUBDOMAIN === 'true') {
        const subdomain = this.extractSubdomain(req);
        if (subdomain) {
          const org = await this.getOrganizationBySubdomain(subdomain);
          if (org) {
            tenantId = org.id;
            resolutionMethod = 'subdomain';
          }
        }
      }

      // Strategy 3: Query parameter
      if (!tenantId && req.query.tenant_id) {
        tenantId = req.query.tenant_id;
        resolutionMethod = 'query';
      }

      // Strategy 4: User's organization from profile
      if (!tenantId) {
        const userOrg = await this.getUserOrganization(req.user.id);
        if (userOrg) {
          tenantId = userOrg.id;
          resolutionMethod = 'user_profile';
        }
      }

      if (!tenantId) {
        throw new TenantError('Unable to determine tenant context');
      }

      // Verify user has access to this tenant
      const hasAccess = await this.verifyUserTenantAccess(req.user.id, tenantId);
      if (!hasAccess) {
        logger.logSecurity('tenant_access_denied', 'medium', {
          userId: req.user.id,
          tenantId,
          resolutionMethod,
          ip: req.ip
        });
        throw new TenantError('Access denied to this organization');
      }

      // Get full tenant information
      const tenant = await this.getTenantById(tenantId);
      if (!tenant) {
        throw new TenantError('Organization not found');
      }

      // Attach tenant to request
      req.tenant = tenant;
      req.tenantId = tenant.id;
      req.tenantResolutionMethod = resolutionMethod;

      logger.debug('Tenant resolved', {
        userId: req.user.id,
        tenantId,
        method: resolutionMethod
      });

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Require tenant context
   * Use after resolveTenant to enforce tenant presence
   */
  requireTenant = (req, res, next) => {
    try {
      if (!req.tenant) {
        throw new TenantError('Organization context required');
      }
      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Platform admin can access any tenant
   * Regular users only their own
   */
  resolveTenantWithPlatformOverride = async (req, res, next) => {
    try {
      if (!req.user) {
        return next();
      }

      // Check if platform admin
      const isPlatformAdmin = await this.isPlatformAdmin(req.user.id);

      if (isPlatformAdmin) {
        // Platform admins can specify any tenant
        let tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;

        if (tenantId) {
          const tenant = await this.getTenantById(tenantId);
          if (tenant) {
            req.tenant = tenant;
            req.tenantId = tenant.id;
            req.isPlatformAdminOverride = true;
            return next();
          }
        }
      }

      // Fall back to regular tenant resolution
      return this.resolveTenant(req, res, next);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Extract subdomain from request
   * @param {Object} req - Express request
   * @returns {String} Subdomain or null
   */
  extractSubdomain(req) {
    const host = req.get('host');
    if (!host) return null;

    const parts = host.split('.');
    if (parts.length < 3) return null; // No subdomain

    // Skip www
    const subdomain = parts[0];
    if (subdomain === 'www') return null;

    return subdomain;
  }

  /**
   * Get organization by subdomain
   * @param {String} subdomain - Subdomain
   * @returns {Promise<Object>} Organization or null
   */
  async getOrganizationBySubdomain(subdomain) {
    try {
      const query = `
        SELECT id, name, subdomain, status, settings
        FROM grxbooks.organizations
        WHERE subdomain = $1
        AND status = 'active'
        AND deleted_at IS NULL
        LIMIT 1
      `;

      const result = await this.pool.query(query, [subdomain]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching organization by subdomain:', error);
      return null;
    }
  }

  /**
   * Get user's organization from profile
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Organization or null
   */
  async getUserOrganization(userId) {
    try {
      const query = `
        SELECT o.id, o.name, o.subdomain, o.status, o.settings
        FROM grxbooks.profiles p
        JOIN grxbooks.organizations o ON p.organization_id = o.id
        WHERE p.id = $1
        AND o.status = 'active'
        AND o.deleted_at IS NULL
        LIMIT 1
      `;

      const result = await this.pool.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching user organization:', error);
      return null;
    }
  }

  /**
   * Get tenant by ID
   * @param {String} tenantId - Tenant ID
   * @returns {Promise<Object>} Tenant or null
   */
  async getTenantById(tenantId) {
    try {
      const query = `
        SELECT id, name, subdomain, status, settings, subscription_tier
        FROM grxbooks.organizations
        WHERE id = $1
        AND status = 'active'
        AND deleted_at IS NULL
        LIMIT 1
      `;

      const result = await this.pool.query(query, [tenantId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching tenant by ID:', error);
      return null;
    }
  }

  /**
   * Verify user has access to tenant
   * @param {String} userId - User ID
   * @param {String} tenantId - Tenant ID
   * @returns {Promise<Boolean>} Has access
   */
  async verifyUserTenantAccess(userId, tenantId) {
    try {
      // Check platform admin
      const isPlatformAdmin = await this.isPlatformAdmin(userId);
      if (isPlatformAdmin) return true;

      // Check organization membership
      const query = `
        SELECT COUNT(*) as count
        FROM grxbooks.user_roles
        WHERE user_id = $1
        AND organization_id = $2
      `;

      const result = await this.pool.query(query, [userId, tenantId]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      logger.error('Error verifying tenant access:', error);
      return false;
    }
  }

  /**
   * Check if user is platform admin
   * @param {String} userId - User ID
   * @returns {Promise<Boolean>} Is platform admin
   */
  async isPlatformAdmin(userId) {
    try {
      const query = `
        SELECT role
        FROM grxbooks.platform_roles
        WHERE user_id = $1
        AND role = 'super_admin'
        LIMIT 1
      `;

      const result = await this.pool.query(query, [userId]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking platform admin:', error);
      return false;
    }
  }
}

module.exports = TenantMiddleware;
