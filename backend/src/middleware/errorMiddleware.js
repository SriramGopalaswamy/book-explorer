/**
 * Error Handler Middleware
 *
 * Centralized error handling for all application errors
 * Formats errors consistently and logs them appropriately
 */

const { AppError } = require('../utils/errors');
const { ApiResponse } = require('../utils/response');
const logger = require('../utils/logger');

class ErrorMiddleware {
  /**
   * Main error handler
   * Catches all errors and formats responses
   */
  static handleError = (err, req, res, next) => {
    // Default error values
    let statusCode = 500;
    let message = 'Internal server error';
    let errors = null;

    // If it's an operational error (AppError), use its properties
    if (err instanceof AppError) {
      statusCode = err.statusCode;
      message = err.message;

      // Include additional error details if available
      if (err.errors) {
        errors = err.errors;
      }
    } else if (err.name === 'ValidationError') {
      // Mongoose/Joi validation errors
      statusCode = 400;
      message = 'Validation failed';
      errors = ErrorMiddleware.extractValidationErrors(err);
    } else if (err.name === 'JsonWebTokenError') {
      // JWT errors
      statusCode = 401;
      message = 'Invalid token';
    } else if (err.name === 'TokenExpiredError') {
      statusCode = 401;
      message = 'Token expired';
    } else if (err.code === '23505') {
      // PostgreSQL unique violation
      statusCode = 409;
      message = 'Resource already exists';
      errors = [{ field: ErrorMiddleware.extractConstraintField(err), message: 'Value already exists' }];
    } else if (err.code === '23503') {
      // PostgreSQL foreign key violation
      statusCode = 400;
      message = 'Referenced resource does not exist';
    } else if (err.code === '23502') {
      // PostgreSQL not null violation
      statusCode = 400;
      message = 'Required field is missing';
      errors = [{ field: err.column, message: 'This field is required' }];
    } else if (err.code === '22P02') {
      // PostgreSQL invalid text representation
      statusCode = 400;
      message = 'Invalid data format';
    } else {
      // Unknown error - log full details
      logger.logError(err, {
        userId: req.user?.id,
        tenantId: req.tenant?.id,
        path: req.path,
        method: req.method
      });
    }

    // Log error based on severity
    if (statusCode >= 500) {
      logger.error('Server error:', {
        error: message,
        stack: err.stack,
        statusCode,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        tenantId: req.tenant?.id
      });
    } else if (statusCode >= 400) {
      logger.warn('Client error:', {
        error: message,
        statusCode,
        path: req.path,
        method: req.method,
        userId: req.user?.id
      });
    }

    // Send error response
    res.status(statusCode).json(
      ApiResponse.error(message, statusCode, errors)
    );
  };

  /**
   * Handle 404 errors (route not found)
   */
  static notFoundHandler = (req, res, next) => {
    logger.warn('Route not found:', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    res.status(404).json(
      ApiResponse.notFound(`Route ${req.method} ${req.path} not found`)
    );
  };

  /**
   * Handle async errors
   * Wraps async route handlers to catch errors
   */
  static asyncHandler = (fn) => {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };

  /**
   * Extract validation errors from error object
   * @param {Error} err - Validation error
   * @returns {Array} Formatted errors
   */
  static extractValidationErrors(err) {
    const errors = [];

    // Mongoose validation errors
    if (err.errors) {
      Object.keys(err.errors).forEach(field => {
        errors.push({
          field,
          message: err.errors[field].message
        });
      });
    }

    // Joi validation errors
    if (err.details) {
      err.details.forEach(detail => {
        errors.push({
          field: detail.path.join('.'),
          message: detail.message
        });
      });
    }

    return errors;
  }

  /**
   * Extract constraint field from PostgreSQL error
   * @param {Error} err - PostgreSQL error
   * @returns {String} Field name
   */
  static extractConstraintField(err) {
    if (err.constraint) {
      // Try to extract field name from constraint
      const match = err.constraint.match(/_(.+)_/);
      if (match) return match[1];
    }

    if (err.detail) {
      // Try to extract from detail message
      const match = err.detail.match(/Key \((.+)\)=/);
      if (match) return match[1];
    }

    return 'unknown';
  }

  /**
   * Handle uncaught exceptions
   */
  static handleUncaughtException = (err) => {
    logger.error('Uncaught Exception:', {
      error: err.message,
      stack: err.stack
    });

    // Give time for logging before exit
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  };

  /**
   * Handle unhandled promise rejections
   */
  static handleUnhandledRejection = (reason, promise) => {
    logger.error('Unhandled Promise Rejection:', {
      reason,
      promise
    });

    // Don't exit process - let app continue
  };

  /**
   * Setup global error handlers
   */
  static setupGlobalHandlers() {
    process.on('uncaughtException', ErrorMiddleware.handleUncaughtException);
    process.on('unhandledRejection', ErrorMiddleware.handleUnhandledRejection);

    logger.info('Global error handlers registered');
  }

  /**
   * Development error handler (includes stack trace)
   */
  static developmentErrorHandler = (err, req, res, next) => {
    let statusCode = 500;
    let message = err.message || 'Internal server error';

    if (err instanceof AppError) {
      statusCode = err.statusCode;
    }

    // Log error
    logger.error('Development error:', {
      error: message,
      stack: err.stack,
      statusCode
    });

    // Send detailed error response
    res.status(statusCode).json({
      success: false,
      statusCode,
      message,
      stack: err.stack,
      errors: err.errors || null,
      timestamp: new Date().toISOString()
    });
  };

  /**
   * Production error handler (no stack trace)
   */
  static productionErrorHandler = (err, req, res, next) => {
    // Use main handler
    ErrorMiddleware.handleError(err, req, res, next);
  };

  /**
   * Get appropriate error handler based on environment
   */
  static getErrorHandler() {
    return process.env.NODE_ENV === 'production'
      ? ErrorMiddleware.productionErrorHandler
      : ErrorMiddleware.developmentErrorHandler;
  }
}

module.exports = ErrorMiddleware;
