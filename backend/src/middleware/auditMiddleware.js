/**
 * Audit Middleware
 *
 * Logs all API requests and important events for compliance and security
 * Stores audit logs in database for long-term retention
 */

const logger = require('../utils/logger');

class AuditMiddleware {
  constructor(pool) {
    this.pool = pool;
    this.excludedPaths = ['/health', '/metrics', '/favicon.ico'];
    this.excludedMethods = [];
  }

  /**
   * Audit all requests
   * Logs request details and response status
   */
  auditRequest = async (req, res, next) => {
    // Skip excluded paths
    if (this.shouldSkipPath(req.path)) {
      return next();
    }

    const startTime = Date.now();

    // Capture original res.json to intercept response
    const originalJson = res.json.bind(res);
    let responseBody = null;

    res.json = function (body) {
      responseBody = body;
      return originalJson(body);
    };

    // Log on response finish
    res.on('finish', async () => {
      const duration = Date.now() - startTime;

      const auditData = {
        userId: req.user?.id || null,
        tenantId: req.tenant?.id || null,
        method: req.method,
        path: req.path,
        query: JSON.stringify(req.query),
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        requestId: req.id,
        timestamp: new Date()
      };

      // Log to console/file
      logger.logRequest(req, res.statusCode, duration);

      // Store in database (async, don't block response)
      this.storeAuditLog(auditData).catch(err => {
        logger.error('Failed to store audit log:', err);
      });

      // Log security events
      if (res.statusCode === 401 || res.statusCode === 403) {
        logger.logSecurity('access_denied', 'medium', auditData);
      }
    });

    next();
  };

  /**
   * Audit specific actions (CRUD operations)
   * More detailed logging for important operations
   */
  auditAction = (action, resourceType) => {
    return async (req, res, next) => {
      // Capture original res.json
      const originalJson = res.json.bind(res);

      res.json = function (body) {
        // Log action after successful response
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const auditData = {
            action,
            resourceType,
            resourceId: req.params.id || body?.data?.id || null,
            userId: req.user?.id || null,
            tenantId: req.tenant?.id || null,
            changes: req.body,
            timestamp: new Date(),
            ip: req.ip
          };

          logger.logAudit(action, resourceType, {
            userId: auditData.userId,
            tenantId: auditData.tenantId
          }, auditData);

          // Store detailed audit
          this.storeDetailedAuditLog(auditData).catch(err => {
            logger.error('Failed to store detailed audit log:', err);
          });
        }

        return originalJson(body);
      };

      next();
    };
  };

  /**
   * Audit authentication events
   */
  auditAuth = (event) => {
    return async (req, res, next) => {
      const originalJson = res.json.bind(res);

      res.json = function (body) {
        const success = res.statusCode >= 200 && res.statusCode < 300;

        logger.logAuth(event, req.user?.id || req.body?.email, success, {
          ip: req.ip,
          userAgent: req.get('user-agent')
        });

        // Store auth audit
        const auditData = {
          event,
          userId: req.user?.id || null,
          email: req.body?.email || null,
          success,
          timestamp: new Date(),
          ip: req.ip,
          userAgent: req.get('user-agent')
        };

        this.storeAuthAuditLog(auditData).catch(err => {
          logger.error('Failed to store auth audit log:', err);
        });

        return originalJson(body);
      };

      next();
    };
  };

  /**
   * Audit data access
   * Logs when sensitive data is accessed
   */
  auditDataAccess = (dataType, sensitivityLevel = 'medium') => {
    return async (req, res, next) => {
      const auditData = {
        dataType,
        sensitivityLevel,
        userId: req.user?.id || null,
        tenantId: req.tenant?.id || null,
        resourceId: req.params.id || null,
        action: 'READ',
        timestamp: new Date(),
        ip: req.ip
      };

      logger.info('Data access', auditData);

      // Store data access audit
      this.storeDataAccessAuditLog(auditData).catch(err => {
        logger.error('Failed to store data access audit log:', err);
      });

      next();
    };
  };

  /**
   * Store basic audit log in database
   * @param {Object} data - Audit data
   */
  async storeAuditLog(data) {
    try {
      const query = `
        INSERT INTO grxbooks.audit_logs (
          user_id,
          organization_id,
          method,
          path,
          query_params,
          status_code,
          duration_ms,
          ip_address,
          user_agent,
          request_id,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;

      await this.pool.query(query, [
        data.userId,
        data.tenantId,
        data.method,
        data.path,
        data.query,
        data.statusCode,
        data.duration,
        data.ip,
        data.userAgent,
        data.requestId,
        data.timestamp
      ]);
    } catch (error) {
      // Don't throw - audit logging failures shouldn't break requests
      logger.error('Failed to store audit log in database:', error);
    }
  }

  /**
   * Store detailed action audit log
   * @param {Object} data - Detailed audit data
   */
  async storeDetailedAuditLog(data) {
    try {
      const query = `
        INSERT INTO grxbooks.action_audit_logs (
          action,
          resource_type,
          resource_id,
          user_id,
          organization_id,
          changes,
          ip_address,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      await this.pool.query(query, [
        data.action,
        data.resourceType,
        data.resourceId,
        data.userId,
        data.tenantId,
        JSON.stringify(data.changes),
        data.ip,
        data.timestamp
      ]);
    } catch (error) {
      logger.error('Failed to store detailed audit log:', error);
    }
  }

  /**
   * Store authentication audit log
   * @param {Object} data - Auth audit data
   */
  async storeAuthAuditLog(data) {
    try {
      const query = `
        INSERT INTO grxbooks.auth_audit_logs (
          event,
          user_id,
          email,
          success,
          ip_address,
          user_agent,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      await this.pool.query(query, [
        data.event,
        data.userId,
        data.email,
        data.success,
        data.ip,
        data.userAgent,
        data.timestamp
      ]);
    } catch (error) {
      logger.error('Failed to store auth audit log:', error);
    }
  }

  /**
   * Store data access audit log
   * @param {Object} data - Data access audit data
   */
  async storeDataAccessAuditLog(data) {
    try {
      const query = `
        INSERT INTO grxbooks.data_access_audit_logs (
          data_type,
          sensitivity_level,
          user_id,
          organization_id,
          resource_id,
          action,
          ip_address,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      await this.pool.query(query, [
        data.dataType,
        data.sensitivityLevel,
        data.userId,
        data.tenantId,
        data.resourceId,
        data.action,
        data.ip,
        data.timestamp
      ]);
    } catch (error) {
      logger.error('Failed to store data access audit log:', error);
    }
  }

  /**
   * Check if path should be skipped
   * @param {String} path - Request path
   * @returns {Boolean} Should skip
   */
  shouldSkipPath(path) {
    return this.excludedPaths.some(excluded => path.startsWith(excluded));
  }

  /**
   * Add path to exclusion list
   * @param {String} path - Path to exclude
   */
  excludePath(path) {
    if (!this.excludedPaths.includes(path)) {
      this.excludedPaths.push(path);
    }
  }

  /**
   * Get audit logs for user/tenant
   */
  getAuditLogs = async (req, res, next) => {
    try {
      const { userId, tenantId, startDate, endDate, action, limit = 100 } = req.query;

      const conditions = [];
      const values = [];
      let paramIndex = 1;

      if (userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        values.push(userId);
      }

      if (tenantId) {
        conditions.push(`organization_id = $${paramIndex++}`);
        values.push(tenantId);
      }

      if (startDate) {
        conditions.push(`created_at >= $${paramIndex++}`);
        values.push(startDate);
      }

      if (endDate) {
        conditions.push(`created_at <= $${paramIndex++}`);
        values.push(endDate);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const query = `
        SELECT *
        FROM grxbooks.action_audit_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex}
      `;

      values.push(limit);

      const result = await this.pool.query(query, values);

      res.json({
        success: true,
        data: result.rows,
        total: result.rows.length
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = AuditMiddleware;
