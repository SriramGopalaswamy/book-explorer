/**
 * API Versioning Middleware
 *
 * Supports version detection via:
 * 1. URL path (/api/v1/...)
 * 2. Accept header (Accept: application/vnd.api+json; version=1)
 * 3. Custom header (X-API-Version: 1)
 */

const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

class VersionMiddleware {
  constructor() {
    this.supportedVersions = ['1', '2']; // Supported API versions
    this.defaultVersion = '1';
    this.deprecatedVersions = []; // Versions that are deprecated but still supported
  }

  /**
   * Extract API version from request
   * @returns {Function} Express middleware
   */
  extractVersion = (req, res, next) => {
    try {
      let version = null;

      // 1. Check URL path (/api/v1/resource)
      const pathMatch = req.path.match(/^\/api\/v(\d+)\//);
      if (pathMatch) {
        version = pathMatch[1];
      }

      // 2. Check X-API-Version header
      if (!version && req.headers['x-api-version']) {
        version = req.headers['x-api-version'];
      }

      // 3. Check Accept header
      if (!version && req.headers['accept']) {
        const acceptMatch = req.headers['accept'].match(/version=(\d+)/);
        if (acceptMatch) {
          version = acceptMatch[1];
        }
      }

      // Use default version if none specified
      if (!version) {
        version = this.defaultVersion;
      }

      // Validate version
      if (!this.supportedVersions.includes(version)) {
        throw new AppError(
          `API version ${version} is not supported. Supported versions: ${this.supportedVersions.join(', ')}`,
          400
        );
      }

      // Check if deprecated
      if (this.deprecatedVersions.includes(version)) {
        res.setHeader('X-API-Deprecated', 'true');
        res.setHeader(
          'X-API-Deprecation-Message',
          `API version ${version} is deprecated. Please migrate to version ${this.defaultVersion}.`
        );

        logger.warn('Deprecated API version used:', {
          version,
          path: req.path,
          ip: req.ip,
          userAgent: req.get('user-agent')
        });
      }

      // Attach version to request
      req.apiVersion = version;

      // Add version info to response headers
      res.setHeader('X-API-Version', version);

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Require specific API version
   * @param {String} requiredVersion - Required version
   * @returns {Function} Express middleware
   */
  requireVersion(requiredVersion) {
    return (req, res, next) => {
      if (req.apiVersion !== requiredVersion) {
        return next(
          new AppError(
            `This endpoint requires API version ${requiredVersion}. Current version: ${req.apiVersion}`,
            400
          )
        );
      }
      next();
    };
  }

  /**
   * Version-specific route handler
   * @param {Object} handlers - Object with version keys and handler functions
   * @returns {Function} Express middleware
   */
  versionedHandler(handlers) {
    return (req, res, next) => {
      const version = req.apiVersion || this.defaultVersion;
      const handler = handlers[version] || handlers['default'];

      if (!handler) {
        return next(
          new AppError(
            `No handler available for API version ${version}`,
            501
          )
        );
      }

      return handler(req, res, next);
    };
  }

  /**
   * Deprecate a version
   * @param {String} version - Version to deprecate
   * @param {Date} sunsetDate - Date when version will be removed
   */
  deprecateVersion(version, sunsetDate) {
    if (!this.deprecatedVersions.includes(version)) {
      this.deprecatedVersions.push(version);

      logger.info('API version deprecated:', {
        version,
        sunsetDate: sunsetDate?.toISOString(),
        remainingTime: sunsetDate ? this.getDaysUntil(sunsetDate) : 'indefinite'
      });
    }
  }

  /**
   * Remove support for a version
   * @param {String} version - Version to remove
   */
  removeVersion(version) {
    this.supportedVersions = this.supportedVersions.filter(v => v !== version);
    this.deprecatedVersions = this.deprecatedVersions.filter(v => v !== version);

    logger.info('API version removed:', { version });
  }

  /**
   * Get days until date
   * @param {Date} date - Future date
   * @returns {Number} Days until date
   */
  getDaysUntil(date) {
    const now = new Date();
    const diffTime = date - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * API version info endpoint
   */
  getVersionInfo = (req, res) => {
    res.json({
      success: true,
      data: {
        current_version: this.defaultVersion,
        supported_versions: this.supportedVersions,
        deprecated_versions: this.deprecatedVersions,
        api_documentation: '/api/docs',
        version_history: {
          v2: {
            released: '2024-01-15',
            changes: [
              'Added pagination to all list endpoints',
              'Improved error responses',
              'Added custom fields support'
            ]
          },
          v1: {
            released: '2023-06-01',
            changes: [
              'Initial API release'
            ],
            deprecated: this.deprecatedVersions.includes('1')
          }
        }
      }
    });
  };
}

// Export singleton instance
module.exports = new VersionMiddleware();
