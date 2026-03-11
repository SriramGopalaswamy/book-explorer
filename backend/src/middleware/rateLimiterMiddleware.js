/**
 * Rate Limiter Middleware
 *
 * Protects API from abuse using sliding window rate limiting
 * Supports different limits for different routes and user tiers
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { createClient } = require('redis');
const { RateLimitError } = require('../utils/errors');
const logger = require('../utils/logger');

class RateLimiterMiddleware {
  constructor(redisUrl) {
    // Initialize Redis client if URL provided
    this.redisClient = null;
    if (redisUrl) {
      this.redisClient = createClient({ url: redisUrl });
      this.redisClient.connect().catch(err => {
        logger.error('Redis connection failed:', err);
      });
    }
  }

  /**
   * Create rate limiter with custom options
   * @param {Object} options - Rate limit options
   * @returns {Function} Express middleware
   */
  createLimiter(options = {}) {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      max = 100, // Max requests per window
      message = 'Too many requests, please try again later',
      skipSuccessfulRequests = false,
      skipFailedRequests = false
    } = options;

    const limiterConfig = {
      windowMs,
      max,
      message,
      skipSuccessfulRequests,
      skipFailedRequests,
      standardHeaders: true, // Return rate limit info in headers
      legacyHeaders: false,
      handler: (req, res) => {
        logger.logSecurity('rate_limit_exceeded', 'medium', {
          ip: req.ip,
          userId: req.user?.id,
          path: req.path,
          limit: max,
          windowMs
        });

        res.status(429).json({
          success: false,
          statusCode: 429,
          message,
          retryAfter: Math.ceil(windowMs / 1000),
          timestamp: new Date().toISOString()
        });
      },
      keyGenerator: (req) => {
        // Use user ID if authenticated, otherwise IP
        return req.user?.id || req.ip;
      }
    };

    // Use Redis store if available
    if (this.redisClient) {
      limiterConfig.store = new RedisStore({
        client: this.redisClient,
        prefix: 'rate_limit:'
      });
    }

    return rateLimit(limiterConfig);
  }

  /**
   * Global rate limiter (loose limits)
   * Apply to all routes
   */
  globalLimiter() {
    return this.createLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // 1000 requests per 15 minutes
      message: 'Too many requests from this IP, please try again later'
    });
  }

  /**
   * Authentication routes (stricter limits)
   */
  authLimiter() {
    return this.createLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // 10 attempts per 15 minutes
      message: 'Too many authentication attempts, please try again later',
      skipSuccessfulRequests: true
    });
  }

  /**
   * API routes (moderate limits)
   */
  apiLimiter() {
    return this.createLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 300, // 300 requests per 15 minutes
      message: 'API rate limit exceeded, please try again later'
    });
  }

  /**
   * Write operations (stricter than reads)
   */
  writeLimiter() {
    return this.createLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // 100 writes per 15 minutes
      message: 'Too many write operations, please try again later'
    });
  }

  /**
   * File upload rate limiter
   */
  uploadLimiter() {
    return this.createLimiter({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 50, // 50 uploads per hour
      message: 'Upload limit exceeded, please try again later'
    });
  }

  /**
   * Export/bulk operations (very strict)
   */
  bulkOperationLimiter() {
    return this.createLimiter({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 10, // 10 bulk operations per hour
      message: 'Bulk operation limit exceeded, please try again later'
    });
  }

  /**
   * Tier-based rate limiter
   * Different limits based on subscription tier
   */
  tierBasedLimiter() {
    return async (req, res, next) => {
      try {
        // Get tenant subscription tier
        const tier = req.tenant?.subscription_tier || 'free';

        // Define limits per tier
        const tierLimits = {
          free: { windowMs: 15 * 60 * 1000, max: 100 },
          basic: { windowMs: 15 * 60 * 1000, max: 500 },
          pro: { windowMs: 15 * 60 * 1000, max: 2000 },
          enterprise: { windowMs: 15 * 60 * 1000, max: 10000 }
        };

        const limits = tierLimits[tier] || tierLimits.free;

        // Create and apply limiter with tier-specific limits
        const limiter = this.createLimiter({
          windowMs: limits.windowMs,
          max: limits.max,
          message: `Rate limit exceeded for ${tier} tier. Upgrade for higher limits.`
        });

        return limiter(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Custom rate limiter with dynamic limits
   * @param {Function} getLimits - Function that returns { windowMs, max } based on request
   * @returns {Function} Express middleware
   */
  customLimiter(getLimits) {
    return async (req, res, next) => {
      try {
        const limits = await getLimits(req);
        const limiter = this.createLimiter({
          windowMs: limits.windowMs,
          max: limits.max,
          message: limits.message || 'Rate limit exceeded'
        });

        return limiter(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Skip rate limiting for certain conditions
   * @param {Function} shouldSkip - Function that returns true to skip limiting
   * @param {Function} limiter - Rate limiter middleware
   * @returns {Function} Express middleware
   */
  conditionalLimiter(shouldSkip, limiter) {
    return async (req, res, next) => {
      try {
        const skip = await shouldSkip(req);
        if (skip) {
          return next();
        }
        return limiter(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Skip rate limiting for platform admins
   * @param {Function} limiter - Rate limiter middleware
   * @returns {Function} Express middleware
   */
  skipForPlatformAdmins(limiter) {
    return this.conditionalLimiter(
      async (req) => req.isPlatformAdmin === true,
      limiter
    );
  }

  /**
   * Get rate limit info for user
   */
  getRateLimitInfo = async (req, res, next) => {
    try {
      const key = req.user?.id || req.ip;

      // This would query Redis for current rate limit status
      // Implementation depends on your store

      res.json({
        success: true,
        data: {
          key,
          // Add rate limit info here
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Close Redis connection
   */
  async close() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

module.exports = RateLimiterMiddleware;
