/**
 * API Response Helper
 *
 * Standardized response format for all API endpoints
 */

class ApiResponse {
  /**
   * Success response
   * @param {*} data - Response data
   * @param {String} message - Success message
   * @param {Number} statusCode - HTTP status code
   * @returns {Object} Formatted response
   */
  static success(data = null, message = 'Success', statusCode = 200) {
    return {
      success: true,
      statusCode,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Error response
   * @param {String} message - Error message
   * @param {Number} statusCode - HTTP status code
   * @param {Array} errors - Detailed errors
   * @returns {Object} Formatted error response
   */
  static error(message = 'An error occurred', statusCode = 500, errors = null) {
    const response = {
      success: false,
      statusCode,
      message,
      timestamp: new Date().toISOString()
    };

    if (errors) {
      response.errors = errors;
    }

    return response;
  }

  /**
   * Paginated response
   * @param {Array} data - Page data
   * @param {Object} pagination - Pagination metadata
   * @returns {Object} Formatted paginated response
   */
  static paginated(data, pagination) {
    return {
      success: true,
      statusCode: 200,
      message: 'Success',
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: pagination.totalPages,
        hasNext: pagination.page < pagination.totalPages,
        hasPrev: pagination.page > 1
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validation error response
   * @param {Array} errors - Validation errors
   * @returns {Object} Formatted validation error response
   */
  static validationError(errors) {
    return {
      success: false,
      statusCode: 400,
      message: 'Validation failed',
      errors: Array.isArray(errors) ? errors : [errors],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Created response (201)
   * @param {*} data - Created resource data
   * @param {String} message - Success message
   * @returns {Object} Formatted response
   */
  static created(data, message = 'Resource created successfully') {
    return this.success(data, message, 201);
  }

  /**
   * No content response (204)
   * @returns {Object} Empty response
   */
  static noContent() {
    return {
      success: true,
      statusCode: 204,
      message: 'No content',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Unauthorized response (401)
   * @param {String} message - Error message
   * @returns {Object} Formatted error response
   */
  static unauthorized(message = 'Authentication required') {
    return this.error(message, 401);
  }

  /**
   * Forbidden response (403)
   * @param {String} message - Error message
   * @returns {Object} Formatted error response
   */
  static forbidden(message = 'Access forbidden') {
    return this.error(message, 403);
  }

  /**
   * Not found response (404)
   * @param {String} message - Error message
   * @returns {Object} Formatted error response
   */
  static notFound(message = 'Resource not found') {
    return this.error(message, 404);
  }

  /**
   * Conflict response (409)
   * @param {String} message - Error message
   * @returns {Object} Formatted error response
   */
  static conflict(message = 'Resource conflict') {
    return this.error(message, 409);
  }

  /**
   * Too many requests response (429)
   * @param {String} message - Error message
   * @returns {Object} Formatted error response
   */
  static tooManyRequests(message = 'Too many requests') {
    return this.error(message, 429);
  }

  /**
   * Internal server error response (500)
   * @param {String} message - Error message
   * @returns {Object} Formatted error response
   */
  static serverError(message = 'Internal server error') {
    return this.error(message, 500);
  }
}

module.exports = { ApiResponse };
