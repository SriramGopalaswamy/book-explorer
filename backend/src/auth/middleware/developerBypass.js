/**
 * Developer Bypass Middleware
 * 
 * Allows bypassing authentication in developer mode for internal tool usage.
 * 
 * Architecture:
 * - ONLY active when DEV_MODE=true AND NODE_ENV != 'production'
 * - Reads x-dev-bypass header
 * - Injects mock user object with highest authority role
 * - Marks req.isDeveloperSession = true for audit trails
 * - NEVER active in production builds
 * 
 * Security:
 * - Production builds ignore this middleware completely
 * - Logs all developer bypass activations
 * - Does not generate JWT tokens
 * - Local state override only
 */

const { DEV_MODE, NODE_ENV } = require('../../config/systemFlags');

/**
 * Create mock user for developer bypass
 * Returns user object with superadmin role (highest authority)
 * Each session gets a unique ID to prevent log correlation
 */
const createMockDeveloperUser = () => {
  const sessionId = `dev-bypass-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return {
    id: sessionId,
    email: 'developer@internal.local',
    role: 'superadmin',
    full_name: 'Developer (Bypass Mode)',
    created_at: new Date().toISOString(),
    isDeveloperBypass: true
  };
};

/**
 * Developer bypass middleware
 * Intercepts requests with x-dev-bypass header and injects mock user
 */
const developerBypass = (req, res, next) => {
  // Only process in development mode
  if (!DEV_MODE || NODE_ENV === 'production') {
    // In production, log any bypass attempts as security incidents
    if (req.get('x-dev-bypass')) {
      console.error('⚠️  SECURITY: Developer bypass attempted in production mode');
      console.error('   Source IP:', req.ip);
      console.error('   User Agent:', req.get('user-agent'));
      console.error('   Path:', req.path);
    }
    return next();
  }

  // Check for developer bypass header
  const bypassHeader = req.get('x-dev-bypass');
  
  if (bypassHeader === 'true') {
    // Inject mock user
    req.user = createMockDeveloperUser();
    req.isDeveloperSession = true;
    req.effectiveRole = 'superadmin';
    req.isImpersonating = false; // Not impersonating, this IS the role
    
    console.log('🔓 DEVELOPER BYPASS ACTIVE');
    console.log('   Path:', req.method, req.path);
    console.log('   Mock User:', req.user.email);
    console.log('   Role:', req.user.role);
    console.log('   Effective Role:', req.effectiveRole);
    console.log('   Session ID:', req.user.id);
    
    // Mark response for debugging
    res.setHeader('X-Developer-Session', 'true');
  } else {
    console.log('ℹ️  No developer bypass header detected');
    console.log('   Path:', req.method, req.path);
    console.log('   x-dev-bypass header:', bypassHeader || '(not set)');
  }
  
  next();
};

/**
 * Check if current request is a developer session
 */
const isDeveloperSession = (req) => {
  return req.isDeveloperSession === true;
};

module.exports = {
  developerBypass,
  isDeveloperSession,
  createMockDeveloperUser
};
