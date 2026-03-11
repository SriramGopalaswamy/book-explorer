/**
 * Middleware Index
 *
 * Central export point for all middleware
 */

const AuthMiddleware = require('./authMiddleware');
const PermissionMiddleware = require('./permissionMiddleware');
const TenantMiddleware = require('./tenantMiddleware');
const RateLimiterMiddleware = require('./rateLimiterMiddleware');
const AuditMiddleware = require('./auditMiddleware');
const ErrorMiddleware = require('./errorMiddleware');
const SecurityMiddleware = require('./securityMiddleware');

module.exports = {
  AuthMiddleware,
  PermissionMiddleware,
  TenantMiddleware,
  RateLimiterMiddleware,
  AuditMiddleware,
  ErrorMiddleware,
  SecurityMiddleware
};
