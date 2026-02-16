/**
 * Demo Mode Middleware
 * Blocks all mutation requests (POST, PUT, DELETE, PATCH) when DEMO_MODE is enabled
 */

const demoModeMiddleware = (req, res, next) => {
  const isDemoMode = process.env.DEMO_MODE === 'true';
  const isMutationRequest = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  
  if (isDemoMode && isMutationRequest) {
    return res.status(403).json({ 
      error: 'Demo mode active: Data modifications are disabled',
      message: 'This is a read-only demo environment. Sign up for full access.',
      demoMode: true
    });
  }
  
  next();
};

module.exports = demoModeMiddleware;
