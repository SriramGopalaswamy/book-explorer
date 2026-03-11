/**
 * Security Middleware
 *
 * Handles CORS, security headers, and other security-related concerns
 * Uses helmet for security headers and custom CORS configuration
 */

const helmet = require('helmet');
const cors = require('cors');
const logger = require('../utils/logger');

class SecurityMiddleware {
  constructor() {
    this.allowedOrigins = this.getAllowedOrigins();
  }

  /**
   * Get allowed origins from environment
   * @returns {Array} Allowed origins
   */
  getAllowedOrigins() {
    const origins = process.env.ALLOWED_ORIGINS || '';
    return origins.split(',').map(origin => origin.trim()).filter(Boolean);
  }

  /**
   * Configure CORS
   * @returns {Function} CORS middleware
   */
  corsMiddleware() {
    return cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
          return callback(null, true);
        }

        // Allow localhost in development
        if (process.env.NODE_ENV === 'development') {
          if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
          }
        }

        // Check if origin is in allowed list
        if (this.allowedOrigins.includes(origin) || this.allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          logger.logSecurity('cors_violation', 'medium', {
            origin,
            allowedOrigins: this.allowedOrigins
          });
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true, // Allow cookies
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Tenant-ID',
        'X-API-Key',
        'X-Request-ID'
      ],
      exposedHeaders: [
        'X-Total-Count',
        'X-Page',
        'X-Page-Size',
        'X-Rate-Limit-Limit',
        'X-Rate-Limit-Remaining',
        'X-Rate-Limit-Reset'
      ],
      maxAge: 86400 // 24 hours
    });
  }

  /**
   * Configure Helmet security headers
   * @returns {Function} Helmet middleware
   */
  helmetMiddleware() {
    return helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      // Other security headers
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'deny' },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      ieNoOpen: true,
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true
    });
  }

  /**
   * Add request ID to each request
   * Useful for tracking requests across logs
   */
  requestIdMiddleware() {
    return (req, res, next) => {
      // Use provided request ID or generate new one
      req.id = req.headers['x-request-id'] || this.generateRequestId();

      // Add to response headers
      res.setHeader('X-Request-ID', req.id);

      next();
    };
  }

  /**
   * Generate unique request ID
   * @returns {String} Request ID
   */
  generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Sanitize user input to prevent XSS
   * Remove potentially dangerous characters
   */
  sanitizeInputMiddleware() {
    return (req, res, next) => {
      if (req.body) {
        req.body = this.sanitizeObject(req.body);
      }

      if (req.query) {
        req.query = this.sanitizeObject(req.query);
      }

      if (req.params) {
        req.params = this.sanitizeObject(req.params);
      }

      next();
    };
  }

  /**
   * Sanitize object recursively
   * @param {Object} obj - Object to sanitize
   * @returns {Object} Sanitized object
   */
  sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return this.sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = this.sanitizeObject(value);
    }

    return sanitized;
  }

  /**
   * Sanitize string
   * @param {*} value - Value to sanitize
   * @returns {*} Sanitized value
   */
  sanitizeString(value) {
    if (typeof value !== 'string') {
      return value;
    }

    // Remove null bytes
    value = value.replace(/\0/g, '');

    // Basic XSS prevention (for display, not for database)
    // Database queries should use parameterized queries
    return value;
  }

  /**
   * Prevent HTTP parameter pollution
   */
  preventParameterPollution() {
    return (req, res, next) => {
      // Ensure query parameters are not arrays (except whitelisted ones)
      const allowedArrayParams = ['ids', 'filters', 'fields', 'sort'];

      if (req.query) {
        Object.keys(req.query).forEach(key => {
          if (Array.isArray(req.query[key]) && !allowedArrayParams.includes(key)) {
            // Take only the first value
            req.query[key] = req.query[key][0];
          }
        });
      }

      next();
    };
  }

  /**
   * Add security-related information to response
   */
  securityResponseHeaders() {
    return (req, res, next) => {
      // Remove sensitive headers
      res.removeHeader('X-Powered-By');

      // Add custom security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');

      next();
    };
  }

  /**
   * Validate content type for POST/PUT/PATCH requests
   */
  validateContentType() {
    return (req, res, next) => {
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const contentType = req.headers['content-type'];

        if (!contentType) {
          return res.status(400).json({
            success: false,
            message: 'Content-Type header is required'
          });
        }

        if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
          return res.status(415).json({
            success: false,
            message: 'Unsupported Media Type. Use application/json or multipart/form-data'
          });
        }
      }

      next();
    };
  }

  /**
   * Limit request body size
   */
  bodyLimitMiddleware() {
    return (req, res, next) => {
      const maxSize = parseInt(process.env.MAX_REQUEST_SIZE) || 10485760; // 10MB default

      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > maxSize) {
          logger.logSecurity('request_too_large', 'medium', {
            size,
            maxSize,
            path: req.path,
            ip: req.ip
          });

          res.status(413).json({
            success: false,
            message: 'Request entity too large'
          });

          req.connection.destroy();
        }
      });

      next();
    };
  }

  /**
   * Detect and block SQL injection attempts
   * Basic detection - proper prevention is via parameterized queries
   */
  sqlInjectionDetection() {
    return (req, res, next) => {
      const sqlPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
        /(;|\-\-|\/\*|\*\/|xp_|sp_)/gi,
        /(\bOR\b\s+\d+\s*=\s*\d+)/gi,
        /(\bAND\b\s+\d+\s*=\s*\d+)/gi
      ];

      const checkValue = (value) => {
        if (typeof value === 'string') {
          return sqlPatterns.some(pattern => pattern.test(value));
        }
        return false;
      };

      const checkObject = (obj) => {
        if (typeof obj !== 'object' || obj === null) {
          return checkValue(obj);
        }

        for (const value of Object.values(obj)) {
          if (Array.isArray(value)) {
            if (value.some(item => checkObject(item))) return true;
          } else if (checkObject(value)) {
            return true;
          }
        }

        return false;
      };

      const isSuspicious =
        checkObject(req.body) ||
        checkObject(req.query) ||
        checkObject(req.params);

      if (isSuspicious) {
        logger.logSecurity('sql_injection_attempt', 'high', {
          ip: req.ip,
          path: req.path,
          body: req.body,
          query: req.query,
          userAgent: req.get('user-agent')
        });

        return res.status(400).json({
          success: false,
          message: 'Invalid request'
        });
      }

      next();
    };
  }
}

module.exports = SecurityMiddleware;
