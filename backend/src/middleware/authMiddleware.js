/**
 * Authentication Middleware
 *
 * Validates JWT tokens and authenticates requests
 * Integrates with Supabase Auth
 */

const { createClient } = require('@supabase/supabase-js');
const { UnauthorizedError, TokenError } = require('../utils/errors');
const logger = require('../utils/logger');

class AuthMiddleware {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Authenticate request
   * Validates JWT token and attaches user to request
   */
  authenticate = async (req, res, next) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Authorization token required');
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Validate token with Supabase
      const { data: { user }, error } = await this.supabase.auth.getUser(token);

      if (error || !user) {
        logger.logSecurity('invalid_token_attempt', 'medium', {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          error: error?.message
        });
        throw new TokenError('Invalid or expired token');
      }

      // Attach user to request
      req.user = user;
      req.token = token;

      // Log successful authentication
      logger.logAuth('token_validated', user.id, true, {
        ip: req.ip,
        userAgent: req.get('user-agent')
      });

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Optional authentication
   * Attaches user if token is valid, but doesn't fail if missing
   */
  optionalAuth = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { data: { user } } = await this.supabase.auth.getUser(token);

        if (user) {
          req.user = user;
          req.token = token;
        }
      }

      next();
    } catch (error) {
      // Don't fail on optional auth errors
      next();
    }
  };

  /**
   * Validate API key
   * For service-to-service authentication
   */
  validateApiKey = (req, res, next) => {
    try {
      const apiKey = req.headers['x-api-key'];

      if (!apiKey) {
        throw new UnauthorizedError('API key required');
      }

      // Validate API key (implement your logic)
      const validApiKeys = (process.env.VALID_API_KEYS || '').split(',');

      if (!validApiKeys.includes(apiKey)) {
        logger.logSecurity('invalid_api_key', 'high', {
          ip: req.ip,
          apiKey: apiKey.substring(0, 8) + '...'
        });
        throw new UnauthorizedError('Invalid API key');
      }

      // Mark request as API key authenticated
      req.apiKeyAuth = true;

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Verify email is verified
   */
  requireVerifiedEmail = (req, res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      if (!req.user.email_confirmed_at) {
        throw new UnauthorizedError('Email verification required');
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Refresh token
   */
  refreshToken = async (req, res, next) => {
    try {
      const refreshToken = req.body.refresh_token;

      if (!refreshToken) {
        throw new UnauthorizedError('Refresh token required');
      }

      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: refreshToken
      });

      if (error) {
        throw new TokenError('Invalid refresh token');
      }

      logger.logAuth('token_refreshed', data.user.id, true, {
        ip: req.ip
      });

      res.json({
        success: true,
        data: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          user: data.user
        }
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = AuthMiddleware;
