/**
 * Validation Middleware
 *
 * Validates request data against Joi schemas
 */

const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

class ValidationMiddleware {
  /**
   * Validate request body
   * @param {Object} schema - Joi validation schema
   * @returns {Function} Express middleware
   */
  static validateBody(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.body, {
        abortEarly: false, // Get all errors, not just first
        stripUnknown: true, // Remove unknown fields
        convert: true // Convert types if possible
      });

      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));

        logger.warn('Validation error:', {
          path: req.path,
          errors,
          body: req.body
        });

        return next(new ValidationError('Validation failed', errors));
      }

      // Replace req.body with validated and sanitized value
      req.body = value;
      next();
    };
  }

  /**
   * Validate query parameters
   * @param {Object} schema - Joi validation schema
   * @returns {Function} Express middleware
   */
  static validateQuery(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });

      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));

        logger.warn('Query validation error:', {
          path: req.path,
          errors,
          query: req.query
        });

        return next(new ValidationError('Query validation failed', errors));
      }

      req.query = value;
      next();
    };
  }

  /**
   * Validate URL parameters
   * @param {Object} schema - Joi validation schema
   * @returns {Function} Express middleware
   */
  static validateParams(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.params, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });

      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));

        logger.warn('Params validation error:', {
          path: req.path,
          errors,
          params: req.params
        });

        return next(new ValidationError('Parameter validation failed', errors));
      }

      req.params = value;
      next();
    };
  }

  /**
   * Validate all parts of request
   * @param {Object} schemas - Object with body, query, params schemas
   * @returns {Function} Express middleware
   */
  static validate(schemas = {}) {
    return async (req, res, next) => {
      try {
        const errors = [];

        // Validate body
        if (schemas.body) {
          const { error, value } = schemas.body.validate(req.body, {
            abortEarly: false,
            stripUnknown: true,
            convert: true
          });

          if (error) {
            errors.push(...error.details.map(detail => ({
              location: 'body',
              field: detail.path.join('.'),
              message: detail.message
            })));
          } else {
            req.body = value;
          }
        }

        // Validate query
        if (schemas.query) {
          const { error, value } = schemas.query.validate(req.query, {
            abortEarly: false,
            stripUnknown: true,
            convert: true
          });

          if (error) {
            errors.push(...error.details.map(detail => ({
              location: 'query',
              field: detail.path.join('.'),
              message: detail.message
            })));
          } else {
            req.query = value;
          }
        }

        // Validate params
        if (schemas.params) {
          const { error, value } = schemas.params.validate(req.params, {
            abortEarly: false,
            stripUnknown: true,
            convert: true
          });

          if (error) {
            errors.push(...error.details.map(detail => ({
              location: 'params',
              field: detail.path.join('.'),
              message: detail.message
            })));
          } else {
            req.params = value;
          }
        }

        if (errors.length > 0) {
          logger.warn('Request validation error:', {
            path: req.path,
            errors
          });

          return next(new ValidationError('Request validation failed', errors));
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Validate file upload
   * @param {Object} options - Upload options
   * @returns {Function} Express middleware
   */
  static validateFile(options = {}) {
    const {
      required = true,
      maxSize = 5 * 1024 * 1024, // 5MB
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
    } = options;

    return (req, res, next) => {
      if (required && !req.file) {
        return next(new ValidationError('File is required'));
      }

      if (req.file) {
        // Check file size
        if (req.file.size > maxSize) {
          return next(new ValidationError(
            `File size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`
          ));
        }

        // Check file type
        if (!allowedTypes.includes(req.file.mimetype)) {
          return next(new ValidationError(
            `File type ${req.file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`
          ));
        }
      }

      next();
    };
  }
}

module.exports = ValidationMiddleware;
