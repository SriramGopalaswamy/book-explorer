/**
 * Base Controller
 *
 * All controllers should extend this base class.
 * Provides common HTTP response methods and error handling.
 */

const { ApiResponse } = require('../utils/response');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

class BaseController {
  constructor() {
    // Bind methods to preserve 'this' context
    this.handleRequest = this.handleRequest.bind(this);
  }

  /**
   * Wrap async route handlers with error handling
   * @param {Function} fn - Async function to wrap
   * @returns {Function} Express middleware
   */
  handleRequest(fn) {
    return async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Send success response
   * @param {Object} res - Express response object
   * @param {*} data - Response data
   * @param {String} message - Success message
   * @param {Number} statusCode - HTTP status code
   */
  success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json(
      ApiResponse.success(data, message, statusCode)
    );
  }

  /**
   * Send created response (201)
   * @param {Object} res - Express response object
   * @param {*} data - Created resource data
   * @param {String} message - Success message
   */
  created(res, data, message = 'Resource created successfully') {
    return this.success(res, data, message, 201);
  }

  /**
   * Send no content response (204)
   * @param {Object} res - Express response object
   */
  noContent(res) {
    return res.status(204).send();
  }

  /**
   * Send paginated response
   * @param {Object} res - Express response object
   * @param {Array} data - Page data
   * @param {Object} pagination - Pagination metadata
   */
  paginated(res, data, pagination) {
    return res.status(200).json(
      ApiResponse.paginated(data, pagination)
    );
  }

  /**
   * Send error response
   * @param {Object} res - Express response object
   * @param {Error} error - Error object
   * @param {Number} statusCode - HTTP status code
   */
  error(res, error, statusCode = 500) {
    logger.error('Controller error:', {
      error: error.message,
      stack: error.stack,
      statusCode
    });

    return res.status(statusCode).json(
      ApiResponse.error(error.message, statusCode)
    );
  }

  /**
   * Send validation error response
   * @param {Object} res - Express response object
   * @param {Array} errors - Validation errors
   */
  validationError(res, errors) {
    return res.status(400).json(
      ApiResponse.validationError(errors)
    );
  }

  /**
   * Send unauthorized response
   * @param {Object} res - Express response object
   * @param {String} message - Error message
   */
  unauthorized(res, message = 'Unauthorized') {
    return res.status(401).json(
      ApiResponse.error(message, 401)
    );
  }

  /**
   * Send forbidden response
   * @param {Object} res - Express response object
   * @param {String} message - Error message
   */
  forbidden(res, message = 'Forbidden') {
    return res.status(403).json(
      ApiResponse.error(message, 403)
    );
  }

  /**
   * Send not found response
   * @param {Object} res - Express response object
   * @param {String} message - Error message
   */
  notFound(res, message = 'Resource not found') {
    return res.status(404).json(
      ApiResponse.error(message, 404)
    );
  }

  /**
   * Extract pagination params from request
   * @param {Object} req - Express request object
   * @returns {Object} Pagination params
   */
  getPaginationParams(req) {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100
    const offset = (page - 1) * limit;

    return { page, limit, offset };
  }

  /**
   * Extract sort params from request
   * @param {Object} req - Express request object
   * @param {String} defaultSort - Default sort field
   * @returns {Object} Sort params
   */
  getSortParams(req, defaultSort = 'created_at') {
    const sortBy = req.query.sortBy || defaultSort;
    const sortOrder = req.query.sortOrder?.toLowerCase() === 'asc' ? 'asc' : 'desc';

    return { sortBy, sortOrder };
  }

  /**
   * Extract filter params from request
   * @param {Object} req - Express request object
   * @param {Array} allowedFilters - List of allowed filter fields
   * @returns {Object} Filter params
   */
  getFilterParams(req, allowedFilters = []) {
    const filters = {};

    allowedFilters.forEach(field => {
      if (req.query[field] !== undefined) {
        filters[field] = req.query[field];
      }
    });

    return filters;
  }

  /**
   * Get current user from request
   * @param {Object} req - Express request object
   * @returns {Object} User object
   */
  getCurrentUser(req) {
    return req.user;
  }

  /**
   * Get current tenant from request
   * @param {Object} req - Express request object
   * @returns {Object} Tenant object
   */
  getCurrentTenant(req) {
    return req.tenant;
  }
}

module.exports = BaseController;
