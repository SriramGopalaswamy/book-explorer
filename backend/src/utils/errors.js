/**
 * Custom Error Classes
 *
 * Application-specific error hierarchy for better error handling
 */

/**
 * Base Application Error
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp
    };
  }
}

/**
 * Validation Error (400)
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 400);
    this.errors = errors;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      errors: this.errors
    };
  }
}

/**
 * Authentication Error (401)
 */
class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

/**
 * Authorization Error (403)
 */
class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403);
  }
}

/**
 * Not Found Error (404)
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found', resource = null) {
    super(message, 404);
    this.resource = resource;
  }

  toJSON() {
    const json = super.toJSON();
    if (this.resource) {
      json.resource = this.resource;
    }
    return json;
  }
}

/**
 * Conflict Error (409)
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict', conflictingField = null) {
    super(message, 409);
    this.conflictingField = conflictingField;
  }

  toJSON() {
    const json = super.toJSON();
    if (this.conflictingField) {
      json.conflictingField = this.conflictingField;
    }
    return json;
  }
}

/**
 * Rate Limit Error (429)
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter = null) {
    super(message, 429);
    this.retryAfter = retryAfter;
  }

  toJSON() {
    const json = super.toJSON();
    if (this.retryAfter) {
      json.retryAfter = this.retryAfter;
    }
    return json;
  }
}

/**
 * Database Error (500)
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', originalError = null) {
    super(message, 500);
    this.originalError = originalError;
  }
}

/**
 * External Service Error (502)
 */
class ExternalServiceError extends AppError {
  constructor(message = 'External service error', service = null) {
    super(message, 502);
    this.service = service;
  }

  toJSON() {
    const json = super.toJSON();
    if (this.service) {
      json.service = this.service;
    }
    return json;
  }
}

/**
 * Business Logic Error (422)
 */
class BusinessLogicError extends AppError {
  constructor(message = 'Business rule violation', rule = null) {
    super(message, 422);
    this.rule = rule;
  }

  toJSON() {
    const json = super.toJSON();
    if (this.rule) {
      json.rule = this.rule;
    }
    return json;
  }
}

/**
 * Tenant Error (400)
 */
class TenantError extends AppError {
  constructor(message = 'Tenant-related error') {
    super(message, 400);
  }
}

/**
 * Token Error (401)
 */
class TokenError extends UnauthorizedError {
  constructor(message = 'Invalid or expired token') {
    super(message);
  }
}

/**
 * Permission Error (403)
 */
class PermissionError extends ForbiddenError {
  constructor(message = 'Insufficient permissions', requiredPermission = null) {
    super(message);
    this.requiredPermission = requiredPermission;
  }

  toJSON() {
    const json = super.toJSON();
    if (this.requiredPermission) {
      json.requiredPermission = this.requiredPermission;
    }
    return json;
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  BusinessLogicError,
  TenantError,
  TokenError,
  PermissionError
};
