/**
 * Logger Utility
 *
 * Structured logging with Winston
 * Supports multiple log levels and transports
 */

const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

// Add colors to Winston
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format (human-readable)
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(info => {
    const { timestamp, level, message, ...meta } = info;
    let metaString = '';

    if (Object.keys(meta).length > 0) {
      metaString = '\n' + JSON.stringify(meta, null, 2);
    }

    return `${timestamp} [${level}]: ${message}${metaString}`;
  })
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.LOG_LEVEL || 'info'
  }),

  // Error log file
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/error.log'),
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    format
  }),

  // Combined log file
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    format
  })
];

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
  exitOnError: false
});

// Add audit log file transport if in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/audit.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      format
    })
  );
}

/**
 * Helper methods for structured logging
 */

/**
 * Log HTTP request
 * @param {Object} req - Express request object
 * @param {Number} statusCode - Response status code
 * @param {Number} duration - Request duration in ms
 */
logger.logRequest = (req, statusCode, duration) => {
  logger.http('HTTP Request', {
    method: req.method,
    url: req.url,
    statusCode,
    duration: `${duration}ms`,
    userId: req.user?.id,
    tenantId: req.tenant?.id,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
};

/**
 * Log database query
 * @param {String} operation - DB operation type
 * @param {String} table - Table name
 * @param {Number} duration - Query duration in ms
 * @param {Object} meta - Additional metadata
 */
logger.logQuery = (operation, table, duration, meta = {}) => {
  logger.debug('Database Query', {
    operation,
    table,
    duration: `${duration}ms`,
    ...meta
  });
};

/**
 * Log audit event
 * @param {String} action - Action performed
 * @param {String} resource - Resource affected
 * @param {Object} context - User/tenant context
 * @param {Object} details - Additional details
 */
logger.logAudit = (action, resource, context, details = {}) => {
  logger.info('Audit Event', {
    action,
    resource,
    userId: context.userId,
    tenantId: context.tenantId,
    timestamp: new Date().toISOString(),
    ...details
  });
};

/**
 * Log authentication event
 * @param {String} event - Auth event type (login, logout, etc.)
 * @param {String} userId - User ID
 * @param {Boolean} success - Whether event was successful
 * @param {Object} meta - Additional metadata
 */
logger.logAuth = (event, userId, success, meta = {}) => {
  logger.info('Authentication Event', {
    event,
    userId,
    success,
    timestamp: new Date().toISOString(),
    ...meta
  });
};

/**
 * Log security event
 * @param {String} event - Security event type
 * @param {String} severity - Event severity (low, medium, high, critical)
 * @param {Object} details - Event details
 */
logger.logSecurity = (event, severity, details = {}) => {
  logger.warn('Security Event', {
    event,
    severity,
    timestamp: new Date().toISOString(),
    ...details
  });
};

/**
 * Log performance metric
 * @param {String} metric - Metric name
 * @param {Number} value - Metric value
 * @param {String} unit - Unit of measurement
 * @param {Object} meta - Additional metadata
 */
logger.logPerformance = (metric, value, unit, meta = {}) => {
  logger.debug('Performance Metric', {
    metric,
    value,
    unit,
    timestamp: new Date().toISOString(),
    ...meta
  });
};

/**
 * Log error with context
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
logger.logError = (error, context = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    statusCode: error.statusCode,
    ...context
  });
};

/**
 * Log business event
 * @param {String} event - Business event name
 * @param {Object} data - Event data
 */
logger.logBusiness = (event, data = {}) => {
  logger.info('Business Event', {
    event,
    timestamp: new Date().toISOString(),
    ...data
  });
};

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = logger;
